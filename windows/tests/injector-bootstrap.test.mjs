import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { CdpSession, earlyPayloadFor } from "../scripts/injector.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const injectorPath = path.resolve(here, "../scripts/injector.mjs");
const source = await fs.readFile(injectorPath, "utf8");

for (const data of ["null", "false", "42", '"unexpected"', "not-json"]) {
  const session = Object.create(CdpSession.prototype);
  Object.assign(session, { pending: new Map(), closed: false, ws: { close() {} } });
  assert.doesNotThrow(() => session.onMessage({ data }));
  assert.equal(session.closed, true, "Malformed CDP data must close only its Xskin connection.");
}
{
  const session = Object.create(CdpSession.prototype);
  const received = [];
  const errors = [];
  const originalError = console.error;
  Object.assign(session, { listeners: new Map([["fixture", [
    () => { throw new Error("listener failure"); },
    params => received.push(params.value),
  ]]]) });
  try {
    console.error = message => errors.push(message);
    assert.doesNotThrow(() => session.onMessage({ data: JSON.stringify({ method: "fixture", params: { value: 42 } }) }));
  } finally { console.error = originalError; }
  assert.deepEqual(received, [42], "A failing CDP callback cannot suppress the other listeners.");
  assert.match(errors[0], /listener failure/);
}

function createFixture() {
  const observers = [];
  const timers = new Map();
  let nextTimer = 1;
  const markers = { shell: false, sidebar: false };
  const context = {
    location: new URL('app://codex/'),
    URLSearchParams,
    window: { installs: [] },
    document: {
      documentElement: {},
      body: {},
      querySelector(selector) {
        if (selector === 'main[data-app-shell-main-surface]:not([data-app-shell-active-page="false"] *)') return markers.shell ? {} : null;
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
  return { context, markers, observers };
}

const guarded = createFixture();
vm.runInNewContext(earlyPayloadFor('window.installs.push("guarded")', "guarded"), guarded.context);
assert.deepEqual(guarded.context.window.installs, [], "Auxiliary app targets must remain untouched.");
guarded.markers.shell = true;
guarded.observers[0].callback([]);
assert.deepEqual(guarded.context.window.installs, [], "A main surface without the Codex sidebar is not sufficient.");
guarded.markers.sidebar = true;
guarded.observers[0].callback([]);
assert.deepEqual(guarded.context.window.installs, ["guarded"], "The guarded payload should install once the shell is complete.");

const rootless = createFixture();
rootless.context.document.documentElement = null;
vm.runInNewContext(earlyPayloadFor('window.installs.push("rootless")', "rootless"), rootless.context);
assert.equal(rootless.observers[0].target, rootless.context.document);
rootless.context.document.documentElement = {};
rootless.markers.shell = rootless.markers.sidebar = true;
rootless.observers[0].callback([]);
assert.deepEqual(rootless.context.window.installs, ["rootless"]);
assert.equal(rootless.observers[0].connected, false);

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

const registrationStart = source.indexOf("earlyScriptId = await registerEarlyPayload");
const evaluateStart = source.indexOf("await session.evaluate(earlyPayloadFor", registrationStart);
const probeStart = source.indexOf("const probe = await probeSession", registrationStart);
assert.ok(registrationStart >= 0 && evaluateStart > registrationStart && probeStart > evaluateStart,
  "New targets must register and run the early payload before full shell probing.");
assert.match(source, /attachLoadFallback\(target.id, target, session\)/,
  "Load events must also hand video files to early-injected documents after reload.");
assert.match(source, /if \(!fallbackTargets\.get\(id\) && !loadedPayload.videoSource\) return;/,
  "Successful early injection needs a load callback only for video handoff.");
assert.match(source, /Page\.removeScriptToEvaluateOnNewDocument/,
  "Watcher shutdown and theme refresh must unregister persistent Page scripts.");

console.log("PASS: Windows early injection is shell-guarded, generation-safe, ordered before probing, and fallback-scoped.");

const watchSource = source.slice(source.indexOf('async function runWatch'), source.indexOf('\nif (path.resolve(process.argv[1]'));
for (const mode of ['late-shell', 'auxiliary', 'stop', 'pause']) {
  const events = new EventEmitter();
  const calls = [];
  const pauses = [];
  let clock = 0, probes = 0, pauseChecks = 0;
  const anchor = {closed:false, close() {this.closed = true;}};
  const stop = () => events.emit('SIGTERM');
  const session = {
    closed:false,
    async evaluate(expression) {calls.push(expression.includes('GENERATION__ = null') ? 'cancel' : 'evaluate'); return true;},
    on() {},
    close() {this.closed = true; calls.push('close'); if (['auxiliary','pause'].includes(mode)) stop();},
  };
  const context = {
    process:events, Date:{now:() => clock}, STRONG_THEME_AUDIT_MS:30000,
    TokenUsageReader:class {}, watchUsageOverlay() {return {close() {}};},
    console:{error() {}, log() {if (mode === 'late-shell') stop();}},
    setTimeout(callback, ms) {pauses.push(ms); clock += ms; if(mode === 'stop') stop(); return setImmediate(callback);},
    async connectBrowserIdentityAnchor() {return anchor;},
    async loadPayload() {return {fingerprint:'fixture', sourceStamp:'stamp', payload:'', theme:{id:'fixture'}, videoSource:{}};},
    async fileExists() {return mode === 'pause' && ++pauseChecks > 2;},
    async readThemeSourceStamp() {return 'stamp';},
    async listAppTargets() {return [{id:'fixture'}];},
    async connectTarget() {calls.push('connect'); return session;},
    async registerEarlyPayload() {calls.push('register'); return 'early';},
    earlyPayloadFor() {return '';},
    async removeEarlyPayload() {calls.push('unregister');},
    async probeSession() {probes++; return {codex:mode === 'late-shell' && probes > 2, readyState:'complete'};},
    async attachVideoToSession() {calls.push('video');},
    async applyToSession() {calls.push('apply');},
    CdpIdentityMismatchError:class extends Error {},
  };
  await vm.runInNewContext(watchSource + '\nrunWatch({port:9335})', context);
  assert.equal(calls.filter(call => call === 'connect').length, 1, `${mode}: retain the original pending connection`);
  assert.equal(calls.filter(call => call === 'register').length, 1);
  if (mode === 'late-shell') {
    assert.equal(probes, 3);
    assert.deepEqual(pauses.slice(0, 2), [50, 50], 'Probe pending startup shells promptly instead of waiting for the steady-state heartbeat.');
    assert.equal(pauses.at(-1), 1200, 'Restore idle polling once the shell is ready.');
    assert.equal(calls.filter(call => call === 'video').length, 1);
    assert.equal(calls.includes('apply'), false, 'Do not replace artwork that early injection already installed.');
  } else {
    assert.ok(calls.includes('cancel'));
    assert.ok(calls.includes('unregister'));
    assert.ok(calls.indexOf('cancel') < calls.indexOf('unregister'));
    assert.ok(calls.indexOf('unregister') < calls.indexOf('close'));
  }
  assert.equal(anchor.closed, true);
}
console.log('PASS: late native shells retain early injection; expiry, pause and shutdown cancel pending observers.');

{
  const events = new EventEmitter();
  const loads = [];
  const applied = [];
  let polls = 0;
  let paused = false;
  let fingerprint = 'initial';
  const session = {
    closed: false, async evaluate() { return true; },
    on(method, listener) { if (method === 'Page.loadEventFired') loads.push(listener); },
    close() { this.closed = true; },
  };
  const context = {
    process: events, Date, STRONG_THEME_AUDIT_MS: 30000,
    TokenUsageReader: class {}, watchUsageOverlay() { return { close() {} }; },
    console: { error() {}, log() {} },
    setTimeout(callback, ms) {
      if (ms === 250) return setImmediate(callback);
      if (++polls === 1) paused = true;
      else if (polls === 2) paused = false;
      else if (polls === 3) fingerprint = 'changed';
      else {
        loads.forEach(listener => listener());
        return setImmediate(() => { events.emit('SIGTERM'); callback(); });
      }
      return setImmediate(callback);
    },
    async connectBrowserIdentityAnchor() { return { closed: false, close() {} }; },
    async loadPayload() { return { fingerprint, sourceStamp: fingerprint, payload: '', theme: { id: fingerprint }, videoSource: {} }; },
    async loadTheme() { return { fingerprint, sourceStamp: fingerprint }; },
    async fileExists() { return paused; },
    async readThemeSourceStamp() { return fingerprint; },
    async listAppTargets() { return [{ id: 'fixture' }]; },
    async connectTarget() { return session; },
    async registerEarlyPayload() {
      if (fingerprint === 'changed') throw new Error('early registration unavailable');
      return 'early';
    },
    earlyPayloadFor() { return ''; }, async removeEarlyPayload() {},
    async probeSession() { return { codex: true }; },
    async waitForCodexProbe() { return { codex: true }; },
    async attachVideoToSession() {}, async removeFromSession() {},
    async applyToSession(_session, loaded) { applied.push(loaded.fingerprint); },
    CdpIdentityMismatchError: class extends Error {},
  };
  await vm.runInNewContext(watchSource + '\nrunWatch({port:9335})', context);
  assert.equal(loads.length, 1, 'Pause/resume and a fallback refresh must retain one load listener per live connection.');
  assert.equal(applied.filter(value => value === 'changed').length, 2, 'Apply once for the theme change and once for its reload.');
}
console.log('PASS: pause/resume retains one load fallback per connection.');

{
  const events = new EventEmitter();
  const calls = [];
  const connections = [];
  let fingerprint = 'old';
  let polls = 0;
  const context = {
    process: events, Date, STRONG_THEME_AUDIT_MS: 30000,
    TokenUsageReader: class {},
    watchUsageOverlay(session) { return { close() { calls.push(`usage-stop:${session.id}`); } }; },
    console: { error() {}, log() {} },
    setTimeout(callback) {
      fingerprint = 'new';
      if (++polls >= 3) events.emit('SIGTERM');
      return setImmediate(callback);
    },
    async connectBrowserIdentityAnchor() { return { closed: false, close() {} }; },
    async loadPayload() { return { fingerprint, sourceStamp: fingerprint, payload: '', theme: { id: fingerprint } }; },
    async loadTheme() { return { fingerprint, sourceStamp: fingerprint }; },
    async fileExists() { return false; },
    async readThemeSourceStamp() { return fingerprint; },
    async listAppTargets() { return [{ id: 'fixture' }]; },
    async connectTarget() {
      const session = {
        id: connections.length + 1, closed: false,
        async evaluate() { return false; }, on() {},
        close() { this.closed = true; calls.push(`close:${this.id}`); },
      };
      connections.push(session);
      return session;
    },
    async registerEarlyPayload(session) { return `early-${session.id}-${fingerprint}`; },
    earlyPayloadFor() { return ''; },
    async removeEarlyPayload(session, identifier) { calls.push(`remove:${session.id}:${identifier}`); },
    async probeSession() { return { codex: true }; },
    async applyToSession(session, loaded) {
      calls.push(`apply:${session.id}:${loaded.fingerprint}`);
      if (session.id === 1 && loaded.fingerprint === 'new') throw new Error('transient renderer failure');
    },
    CdpIdentityMismatchError: class extends Error {},
  };
  await vm.runInNewContext(watchSource + '\nrunWatch({port:9335})', context);
  assert.equal(connections.length, 2, 'Retry a failed refresh without another theme change.');
  assert.ok(calls.includes('apply:2:new'), 'The replacement connection must apply the current revision.');
  assert.ok(calls.indexOf('usage-stop:1') < calls.indexOf('apply:1:new'), 'Release the previous usage subscription before refreshing.');
  const removed = calls.indexOf('remove:1:early-1-new');
  assert.ok(removed > calls.indexOf('apply:1:new') && removed < calls.indexOf('close:1'), 'Remove the failed early script before closing its connection.');
}
console.log('PASS: failed live theme refreshes reconnect and apply the latest revision.');
