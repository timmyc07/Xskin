import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { earlyPayloadFor, isValidCdpPageTarget, nextDiscoveryDelayMs, discoveryLogIntervalMs } from "../scripts/injector.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const injectorPath = path.resolve(here, "../scripts/injector.mjs");
const source = await fs.readFile(injectorPath, "utf8");

const mainTarget = { type: "page", id: "main", url: "app://-/index.html", webSocketDebuggerUrl: "ws://127.0.0.1:9341/devtools/page/main" };
assert.equal(isValidCdpPageTarget(mainTarget, 9341), true);
for (const url of ["app://-/index.html?initialRoute=%2Favatar-overlay", "app://-/detached-window.html?initialRoute=%2Fdetached-window"]) {
  assert.equal(isValidCdpPageTarget({ ...mainTarget, url }, 9341), false, "Auxiliary windows must not be repeatedly connected and probed as main windows.");
}
assert.equal(isValidCdpPageTarget({ ...mainTarget, webSocketDebuggerUrl: "ws://example.com:9341/devtools/page/main" }, 9341), false);
assert.equal(nextDiscoveryDelayMs(100, 0), 160);
assert.equal(nextDiscoveryDelayMs(500, 9000), 500);
assert.equal(nextDiscoveryDelayMs(5000, 10000), 5000);
assert.equal(nextDiscoveryDelayMs(30000, 60000), 30000);
assert.equal(discoveryLogIntervalMs(100), 2000);
assert.equal(discoveryLogIntervalMs(5000), 20000);
assert.equal(discoveryLogIntervalMs(30000), 60000);
const watchLoop = source.slice(source.indexOf("async function runWatch"));
assert.match(watchLoop, /targets = await listAppTargets[\s\S]*?outageStartedAt = null/, "A reachable endpoint must reset the outage backoff.");

function createFixture() {
  const observers = [];
  const timers = new Map();
  let nextTimer = 1;
  const markers = { shell: false, sidebar: false };
  const context = {
    window: { installs: [] },
    document: {
      documentElement: {},
      querySelector(selector) {
        if (selector === '[data-app-shell-active-page="true"] main[data-app-shell-main-surface]') return markers.shell ? {} : null;
        if (selector === "aside.app-shell-left-panel") return markers.sidebar ? {} : null;
        return null;
      },
    },
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.connected = true;
        observers.push(this);
      }
      observe() {}
      disconnect() { this.connected = false; }
    },
    setTimeout(callback) {
      const id = nextTimer++;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  return { context, markers, observers };
}

const guarded = createFixture();
vm.runInNewContext(earlyPayloadFor('window.installs.push("guarded")', "guarded"), guarded.context);
assert.deepEqual(guarded.context.window.installs, [], "Auxiliary app targets must remain untouched.");
guarded.markers.shell = true;
guarded.observers[0].callback([]);
assert.deepEqual(guarded.context.window.installs, [], "A main surface without the Codex sidebar is not sufficient.");

const generations = createFixture();
vm.runInNewContext(earlyPayloadFor('window.installs.push("old")', "old"), generations.context);
vm.runInNewContext(earlyPayloadFor('window.installs.push("new")', "new"), generations.context);
generations.markers.shell = true;
generations.markers.sidebar = true;
for (const observer of generations.observers) observer.callback([]);
assert.deepEqual(
  generations.context.window.installs,
  ["new"],
  "A stale early script must yield to the newest watcher generation.",
);
assert.equal(generations.context.window.__CODEX_DREAM_SKIN_EARLY_APPLIED__, "new");

const discoveryStart = source.indexOf("record.earlyScriptId = await registerEarly");
const probeStart = source.indexOf("const probe = await waitForCodexProbe", discoveryStart);
assert.ok(discoveryStart >= 0 && probeStart > discoveryStart, "Early registration must happen before full shell probing.");
assert.match(
  source,
  /finally\s*\{[\s\S]*Promise\.all\(\[\.\.\.sessions\.values\(\)\][\s\S]*removeEarly\(record\)/,
  "Watcher shutdown must unregister persistent Page scripts before closing CDP sessions.",
);
assert.match(
  source,
  /const earlyApplied = await session\.evaluate\([\s\S]*if \(!earlyApplied\) \{[\s\S]*applyToSession/,
  "The watcher must not run the full payload twice after a successful early install.",
);

assert.match(source, /A completed CDP command[\s\S]*process\.stdout, process\.stderr[\s\S]*process\.exit\(process\.exitCode \?\? 0\)/, "Completed CLI operations must flush output and exit without waiting on idle debugger sockets.");
console.log("PASS: early injection is shell-guarded, generation-safe, and removed on shutdown.");
