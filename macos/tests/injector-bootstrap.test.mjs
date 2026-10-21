import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import os from "node:os";
import { EventEmitter } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
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
      observe(target) { this.target = target; }
      disconnect() { this.connected = false; }
    },
    setTimeout(callback) {
      const id = nextTimer++;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  return { context, markers, observers, timers };
}

const guarded = createFixture();
vm.runInNewContext(earlyPayloadFor('window.installs.push("guarded")', "guarded"), guarded.context);
assert.equal(guarded.observers[0].target, guarded.context.document.documentElement);
assert.deepEqual(guarded.context.window.installs, [], "Auxiliary app targets must remain untouched.");
guarded.markers.shell = true;
guarded.observers[0].callback([]);
assert.deepEqual(guarded.context.window.installs, [], "A main surface without the Codex sidebar is not sufficient.");

const rootless = createFixture();
rootless.context.document.documentElement = null;
vm.runInNewContext(earlyPayloadFor('window.installs.push("rootless")', "rootless"), rootless.context);
assert.equal(rootless.observers[0]?.target, rootless.context.document, "A new document must be observed before its HTML element exists.");
assert.equal(rootless.timers.size, 1);
rootless.context.document.documentElement = {};
rootless.observers[0].callback([]);
assert.deepEqual(rootless.context.window.installs, [], "Creating HTML alone must not bypass the shell probe.");
rootless.markers.shell = true;
rootless.observers[0].callback([]);
assert.deepEqual(rootless.context.window.installs, [], "The later main surface still requires the sidebar.");
rootless.markers.sidebar = true;
rootless.observers[0].callback([]);
assert.deepEqual(rootless.context.window.installs, ["rootless"], "The background must install as soon as the new document gains its Codex shell.");
assert.equal(rootless.context.window.__CODEX_DREAM_SKIN_EARLY_APPLIED__, "rootless");
assert.equal(rootless.observers[0].connected, false);
assert.equal(rootless.timers.size, 0, "Early installation must cancel the ten-second deadline without waiting for it.");

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

const watchSource = source.slice(source.indexOf("async function runWatch"), source.indexOf('\nif (path.resolve(process.argv[1]'));
const listSource = source.slice(source.indexOf("async function listAppTargets"), source.indexOf("async function probeSession"));

async function shutdownFixture(mode) {
  const events = new EventEmitter();
  const calls = [];
  let acknowledge;
  let stoppedAt;
  let finished = false;
  const stop = () => { stoppedAt = performance.now(); events.emit("SIGTERM"); };
  const session = {
    closed: false,
    async send(method) {
      calls.push(method);
      if (method === "Page.addScriptToEvaluateOnNewDocument") return { identifier: "early-fixture" };
      if (mode === "active" && method === "Page.removeScriptToEvaluateOnNewDocument") return new Promise((resolve) => { acknowledge = resolve; });
      return {};
    },
    async evaluate() { return true; },
    on() {},
    close() { this.closed = true; calls.push("close"); },
  };
  const context = {
    process: events, AbortController, setTimeout, clearTimeout,
    console: { error() {}, log() { if (mode === "active") stop(); } },
    async loadPayload() { return { payload: "", revision: "fixture", theme: { id: "fixture" } }; },
    watchPayloadSources() { return () => {}; },
    nextDiscoveryDelayMs() { return 30000; },
    discoveryLogIntervalMs() { return 2000; },
    earlyPayloadFor() { return ""; },
    async connectTarget() { return session; },
    async waitForCodexProbe() { return { codex: true }; },
    async applyToSession() { calls.push("apply"); },
    async attachVideoToSession() { calls.push("video"); },
    delay(ms, value, options) {
      if (mode === "backoff" && ms === 30000) setImmediate(stop);
      return delay(ms, value, options);
    },
    fetch(_url, { signal }) {
      if (mode === "fetch") {
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
          setImmediate(stop);
        });
      }
      throw Error("offline");
    },
  };
  vm.createContext(context);
  context.listAppTargets = mode === "active" ? async () => [{ id: "main" }] : vm.runInContext(`(${listSource})`, context);
  const run = vm.runInContext(`(${watchSource})`, context);
  const running = run({ port: 19341 }).then(() => { finished = true; });
  if (mode === "active") {
    for (let attempt = 0; attempt < 50 && !acknowledge; attempt += 1) await delay(5);
    assert.ok(acknowledge, "An active shutdown must send the early-script removal");
    assert.equal(finished, false, "Shutdown must wait for the unregister ACK");
    assert.equal(session.closed, false, "An active CDP session must remain open until its ACK");
    acknowledge({});
  }
  await running;
  assert.ok(performance.now() - stoppedAt < 500, `${mode} shutdown must not wait on discovery/backoff`);
  if (mode === "active") {
    assert.ok(calls.indexOf("Page.removeScriptToEvaluateOnNewDocument") < calls.indexOf("close"));
    assert.equal(calls.filter((value) => value === "Page.addScriptToEvaluateOnNewDocument").length, 1);
  }
}
await shutdownFixture("active");
await shutdownFixture("fetch");
await shutdownFixture("backoff");

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "dream-skin-stop-test-"));
try {
  const stateRoot = path.join(temporary, "Library/Application Support/CodexDreamSkinStudio");
  await fs.mkdir(stateRoot, { recursive: true });
  await fs.writeFile(path.join(stateRoot, "state.json"), "{}");
  const fixture = `
set -euo pipefail
. "$1/scripts/common-macos.sh"
CODEX_EXE=/fixture/Codex
state_field() {
  case "$1" in
    injectorPid) printf 700 ;;
    port) printf 19341 ;;
    injectorStartedAt) printf FixtureStart ;;
    nodePath) printf '%s' "$NODE" ;;
    injectorPath) printf '%s' "$INJECTOR" ;;
    codexPid) printf 800 ;;
    codexExe) printf '%s' "$CODEX_EXE" ;;
  esac
}
function /bin/launchctl() { :; }
port_belongs_to_codex() { return 1; }
function /bin/ps() {
  if [ "$2" = 800 ]; then
    case "$4" in stat=) [ "$mode" = owner-dead ] && printf Z || printf S ;; comm=) printf '%s' "$CODEX_EXE" ;; esac
    return
  fi
  [ "$mode" != unreadable ] || return 0
  case "$4" in
    stat=) printf '%s' "$watcher_state" ;;
    command=) if [ "$reused" = true ]; then printf '/unrelated'; else printf '%s %s --watch --port 19341 --theme-dir /fixture/theme' "$NODE" "$INJECTOR"; fi ;;
    lstart=) printf FixtureStart ;;
  esac
}
function /bin/kill() {
  case "$1" in
    -TERM)
      signals="$signals TERM"
      if [ "$mode" = reused ]; then reused=true; elif [ "$mode" != owner-dead ]; then watcher_state=Z; fi
      ;;
    -KILL) signals="$signals KILL"; watcher_state=Z ;;
    *) return 0 ;;
  esac
}
for mode in zombie graceful reused owner-dead unreadable; do
  watcher_state=S
  [ "$mode" != zombie ] || watcher_state=Z
  reused=false
  signals=""
  if [ "$mode" = unreadable ]; then
    if stop_recorded_injector 2>/dev/null; then exit 1; fi
    [ -z "$signals" ]
    continue
  fi
  stop_recorded_injector
  case "$mode" in zombie) [ -z "$signals" ] ;; owner-dead) [ "$signals" = ' TERM KILL' ] ;; *) [ "$signals" = ' TERM' ] ;; esac
done
`;
  const started = performance.now();
  await promisify(execFile)("/bin/bash", ["-c", fixture, "_", path.resolve(here, "..")], { env: { ...process.env, HOME: temporary, NODE: process.execPath }, timeout: 5000 });
  assert.ok(performance.now() - started < 1000, "Zombie, PID reuse, and a dead owner must not consume the six-second stop timeout");
} finally { await fs.rm(temporary, { recursive: true, force: true }); }
console.log("PASS: shutdown cancels discovery/backoff, awaits active unregister, and safely stops dead-owner/zombie/reused PID fixtures.");
