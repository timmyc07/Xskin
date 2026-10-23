import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const source = await fs.readFile(new URL("../assets/token-overlay.js", import.meta.url), "utf8");
const css = await fs.readFile(new URL("../assets/dream-skin.css", import.meta.url), "utf8");
const THREAD = "01a161f4-8a44-7f02-9cee-9c9f8b750413";
const OTHER = "01a161f4-8a44-7f02-9cee-9c9f8b750414";

function fixture({ surface = "codex", lang = "zh-TW" } = {}) {
  let now = 1000000;
  let elapsed = 0;
  let nextTimer = 0;
  let installations = 0;
  const timers = new Map();
  const listeners = new Map();
  const motionListeners = new Map();
  class Element {
    constructor() {
      this.children = [];
      this.parentElement = null;
      this.dataset = {};
      this.attributes = new Map();
      this.textContent = "";
      this.title = "";
      this.style = {
        values: new Map(),
        getPropertyValue(name) { return this.values.get(name) ?? ""; },
        setProperty(name, value) { this.values.set(name, value); },
      };
    }
    append(...children) {
      for (const child of children) {
        child.remove();
        child.parentElement = this;
        this.children.push(child);
      }
    }
    remove() {
      if (!this.parentElement) return;
      const siblings = this.parentElement.children;
      siblings.splice(siblings.indexOf(this), 1);
      this.parentElement = null;
    }
    get previousElementSibling() {
      const siblings = this.parentElement?.children ?? [];
      return siblings[siblings.indexOf(this) - 1] ?? null;
    }
    get nextElementSibling() {
      const siblings = this.parentElement?.children ?? [];
      return siblings[siblings.indexOf(this) + 1] ?? null;
    }
    get isConnected() { return Boolean(this.parentElement); }
    checkVisibility() { return this.visible !== false; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    insertAdjacentElement(position, element) {
      assert.equal(position, "beforebegin");
      element.remove();
      element.parentElement = this.parentElement;
      this.parentElement.children.splice(this.parentElement.children.indexOf(this), 0, element);
    }
  }
  const parent = new Element();
  const anchor = new Element();
  const toolbar = new Element();
  parent.append(anchor, toolbar);
  const composer = new Element();
  anchor.append(composer);
  const inactiveComposer = new Element();
  inactiveComposer.checkVisibility = () => true;
  inactiveComposer.closest = selector => selector.includes("active-page") ? {} : null;
  composer.checkVisibility = () => data.composerVisible;
  composer.closest = selector => selector === '[data-app-shell-active-page="false"]' && !data.activePage
    ? {} : selector === "[data-composer-layout]" ? anchor : null;
  const conversation = new Element();
  const data = { composerVisible: true, activePage: true,
    composers: [inactiveComposer, composer], markers: [conversation] };
  const setIdentity = (id = THREAD, hostId = "local", depth = 19, ownerId = id) => {
    conversation.setAttribute("data-above-composer-conversation-id", id);
    const root = { tag: 3, stateNode: {}, return: null };
    root.stateNode.current = root;
    const owner = { memoizedProps: { conversationId: ownerId, hostId }, return: root };
    let fiber = owner;
    for (let index = 0; index < depth; index++) fiber = { memoizedProps: null, return: fiber };
    composer.__reactFiber$fixture = fiber;
    return { owner, fiber, root };
  };
  setIdentity();
  const document = {
    hidden: false,
    documentElement: { lang },
    createElement: () => new Element(),
    querySelector() { assert.fail("The input owner does not depend on a separate page or portal"); },
    querySelectorAll(selector) {
      assert.equal(selector, "[data-composer-body]", "Identity resolution never depends on sidebar rows");
      return data.composers;
    },
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name, callback) { if (listeners.get(name) === callback) listeners.delete(name); },
  };
  const motion = {
    matches: false,
    addEventListener(name, callback) { motionListeners.set(name, callback); },
    removeEventListener(name, callback) { if (motionListeners.get(name) === callback) motionListeners.delete(name); },
  };
  const state = { surface };
  const context = vm.createContext({
    document,
    window: { __CODEX_DREAM_SKIN_STATE__: state, matchMedia: () => motion,
      crypto: { randomUUID: () => `overlay-${++installations}` } },
    Date: { now: () => now },
    performance: { timeOrigin: 1000000, now: () => elapsed },
    Intl,
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, due: elapsed + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  const install = () => vm.runInContext(`(${source})()`, context);
  const advance = (milliseconds, wallChange = milliseconds) => {
    elapsed += milliseconds;
    now += wallChange;
    for (const [id, timer] of [...timers]) {
      if (timer.due <= elapsed && timers.has(id)) {
        timers.delete(id);
        timer.callback();
      }
    }
  };
  install();
  return {
    state, document, motion, data, parent, anchor, toolbar, composer, conversation, timers, listeners, motionListeners,
    install, advance, setIdentity,
    get overlay() { return state.usageOverlay; },
    get row() { return composer.previousElementSibling; },
    get text() { return composer.previousElementSibling?.children[1].textContent; },
    get cacheBar() { return composer.previousElementSibling?.children[2].children[0]; },
    get cacheText() { return composer.previousElementSibling?.children[2].children[1].textContent; },
    sample(overrides = {}) {
      return { threadId: THREAD, totalTokens: 1000, inputTokens: 800, cachedInputTokens: 600, outputTokens: 200,
        contextRemainingPercent: 75.4, primary: { remainingPercent: 86.2, windowMinutes: 300 },
        secondary: { remainingPercent: 92, windowMinutes: 10080 }, planType: "pro", sampledAt: now, running: false, ...overrides };
    },
  };
}

const f = fixture();
assert.equal(f.row.parentElement, f.anchor, "The measured native composer layout contains the usage strip");
assert.equal(f.row.nextElementSibling, f.composer, "The strip immediately precedes the actual input in normal flow");
assert.equal(f.anchor.nextElementSibling, f.toolbar, "The native footer remains immediately after the input");
assert.equal(f.overlay.request().threadId, THREAD, "A local composer mounts usage without any sidebar row");
assert.equal(f.text, "等待本機用量記錄");
assert.equal(f.row.dataset.usageState, "waiting");
assert.equal(f.cacheBar.parentElement.style.getPropertyValue("display"), "none", "No empty cache meter is shown before usage exists");
assert.equal(f.overlay.update(f.sample()), true);
assert.equal(f.row.dataset.usageState, "ready");
assert.equal(f.cacheBar.parentElement.style.getPropertyValue("display"), "");
assert.match(f.text, /Token 1,000.*快取 600.*上下文剩餘 75\.4%.*5時 額度剩餘 86\.2%.*7天 額度剩餘 92%.*方案 pro/);
assert.match(f.row.title, /輸入 800.*輸出 200.*快取包含在輸入內/);
assert.equal(f.overlay.status().spinning, false, "Loading history must not animate as new consumption");
f.overlay.update(f.sample({ running: true }));
assert.equal(f.overlay.status().spinning, true, "Starting a task spins immediately before its next usage event");
f.advance(2000);
f.overlay.update(f.sample({ totalTokens: 1200, cachedInputTokens: 700, running: true }));
assert.equal(f.overlay.status().tokensPerSecond, 100, "Cached input is a subset, never added to total consumption");
assert.equal(f.overlay.status().spinning, true);
const slowPeriod = parseFloat(f.row.style.getPropertyValue("--dream-skin-fan-period"));
f.advance(2000);
f.overlay.update(f.sample({ totalTokens: 2200, running: true }));
assert.ok(parseFloat(f.row.style.getPropertyValue("--dream-skin-fan-period")) < slowPeriod);
assert.equal(f.timers.size, 1, "Only the host heartbeat timeout is needed, with no per-frame JavaScript");

f.document.hidden = true;
f.listeners.get("visibilitychange")();
assert.equal(f.overlay.request().visible, false);
assert.equal(f.overlay.status().spinning, false);
f.document.hidden = false;
f.listeners.get("visibilitychange")();
assert.equal(f.overlay.status().spinning, false, "Returning from an intentional pause waits for fresh activity");
f.overlay.update(f.sample({ totalTokens: 2200, running: true }));
assert.equal(f.overlay.status().spinning, true);
f.motion.matches = true;
f.motionListeners.get("change")();
assert.equal(f.overlay.status().spinning, false);
f.motion.matches = false;
f.motionListeners.get("change")();
assert.equal(f.overlay.status().spinning, true);
f.advance(8000);
assert.equal(f.overlay.status().spinning, true, "Tool work keeps the fan spinning without another token event");
f.overlay.update(f.sample({ totalTokens: 2200 }));
assert.equal(f.overlay.status().spinning, false, "Completion stops the fan immediately without a fixed eight-second tail");
assert.equal(f.overlay.status().tokensPerSecond, 0);
f.advance(15000);
assert.equal(f.overlay.status().stale, true);
assert.match(f.text, /用量連線暫時中斷/);
assert.equal(f.overlay.status().availability, "reconnecting");
assert.equal(f.timers.size, 0);

f.overlay.update(f.sample());
f.setIdentity(OTHER);
assert.equal(f.overlay.request().threadId, OTHER);
assert.equal(f.text, "等待本機用量記錄", "Switching task clears old counts and shows one waiting label");
assert.equal(f.overlay.update(f.sample()), false, "An in-flight response for the old task is rejected");
assert.equal(f.overlay.update(f.sample({ threadId: OTHER })), true);
assert.equal(f.overlay.update(f.sample({ threadId: OTHER, sampledAt: f.overlay.status().sampledAt - 1,
  totalTokens: 999999 })), false, "Out-of-order snapshots do not overwrite counts");
assert.doesNotMatch(f.text, /999,999/);
f.advance(1000);
assert.equal(f.overlay.update(f.sample({ threadId: OTHER, sampledAt: 1 })), false);
assert.equal(f.overlay.update(f.sample({ threadId: OTHER, sampledAt: Date.now() + 100000 })), false);

delete f.composer.__reactFiber$fixture;
assert.equal(f.overlay.request().threadId, null, "An input without owner metadata cannot inherit the retained portal's conversation");
assert.equal(f.row, null, "An unidentified input has no empty usage strip covering its utility toolbar");
assert.equal(f.timers.size, 0);
assert.equal(f.overlay.update(f.sample({ threadId: null, totalTokens: null, inputTokens: null,
  cachedInputTokens: null, outputTokens: null, contextRemainingPercent: null, primary: null,
  secondary: null, planType: '<img src="private">' })), false);
f.setIdentity(OTHER);
f.overlay.request();
assert.equal(f.overlay.update(f.sample({ threadId: OTHER, planType: '<img src="private">' })), true);
assert.match(f.text, /方案 <img src="private">/, "Plan text is displayed literally, never interpreted as HTML");
assert.equal(f.row.children.length, 3);
f.setIdentity(OTHER, "remote");
assert.equal(f.overlay.request().threadId, null, "A remote UUID must never read coincident local usage");
assert.equal(f.row, null, "A thread that cannot be identified locally has no empty metrics row");
for (const hostId of [undefined, null, "", "unknown", "LOCAL", 1]) {
  const { owner } = f.setIdentity();
  owner.memoizedProps.hostId = hostId;
  assert.equal(f.overlay.request().threadId, null, "An unknown or malformed host cannot expose local usage");
}
f.setIdentity(THREAD.toUpperCase(), "local", 19, THREAD.toUpperCase());
assert.equal(f.overlay.request().threadId, THREAD, "Validated UUIDs are normalized independently of the sidebar");
f.setIdentity(THREAD, "local", 19, OTHER);
assert.equal(f.overlay.request().threadId, OTHER, "The input's owner takes priority over stale above-composer metadata");
assert.equal(f.text, "等待本機用量記錄", "Changing input owners clears the previous conversation's usage");
assert.equal(f.overlay.update(f.sample()), false, "A late response cannot cross the composer's owner change");
for (const id of ["../../auth.json", `local:${THREAD}`, "", "not-a-uuid"]) {
  f.setIdentity(id);
  assert.equal(f.overlay.request().threadId, null, "Malformed composer identifiers never request a local file");
}
f.setIdentity();

const identity = fixture();
const hiddenMarker = identity.document.createElement("div");
hiddenMarker.visible = false;
hiddenMarker.setAttribute("data-above-composer-conversation-id", THREAD);
identity.data.markers = [hiddenMarker, identity.conversation];
assert.equal(identity.overlay.request().threadId, THREAD, "A hidden portal does not obscure the input's own conversation identity");
hiddenMarker.setAttribute("data-above-composer-conversation-id", OTHER);
assert.equal(identity.overlay.request().threadId, THREAD, "An inactive portal for another conversation cannot override the input owner");
hiddenMarker.visible = true;
assert.equal(identity.overlay.request().threadId, THREAD, "Unrelated visible portals cannot override the input owner");
identity.data.markers = [identity.conversation, identity.conversation];
assert.equal(identity.overlay.request().threadId, THREAD, "Duplicate above-composer portals do not identify the input");
identity.conversation.visible = false;
identity.data.markers = [identity.conversation];
assert.equal(identity.overlay.request().threadId, THREAD, "The usage strip remains mounted when an empty above-composer portal is hidden");
identity.data.markers = [];
assert.equal(identity.overlay.request().threadId, THREAD, "Missing above-composer portals do not hide an identifiable active input");
identity.data.markers = [identity.conversation];
identity.data.composers = [identity.composer, identity.composer];
assert.equal(identity.overlay.request().threadId, null, "More than one visible composer never guesses which usage to show");
identity.data.composers = [identity.composer];
identity.data.activePage = false;
assert.equal(identity.overlay.request().threadId, null, "An inactive input cannot borrow retained identity metadata");
identity.data.activePage = true;
const attached = identity.setIdentity(THREAD, "local", 47);
let inputOwner = attached.fiber;
for (let depth = 0; depth < 12; depth++) inputOwner = inputOwner.return;
inputOwner.memoizedProps = { conversationId: THREAD };
identity.composer.append(identity.document.createElement("img"), identity.document.createElement("p"));
assert.equal(identity.overlay.request().threadId, THREAD, "An input with attachments resolves its matching host owner beyond its immediate conversation props");
assert.equal(identity.row.nextElementSibling, identity.composer, "Attachments stay inside the input below its usage strip");
inputOwner.memoizedProps.conversationId = OTHER;
assert.equal(identity.overlay.request().threadId, null, "A nearer input identity cannot read a different ancestor conversation's local usage");
inputOwner.memoizedProps.conversationId = "client-new-thread";
assert.equal(identity.overlay.request().threadId, null, "Draft inputs cannot inherit a retained conversation's usage");
identity.setIdentity(THREAD, "local", 99);
assert.equal(identity.overlay.request().threadId, THREAD, "The last permitted owner depth remains usable");
identity.setIdentity(THREAD, "local", 100);
assert.equal(identity.overlay.request().threadId, null, "The owner walk is bounded to one hundred nodes");
const cyclic = identity.setIdentity();
cyclic.fiber.return = cyclic.fiber;
assert.equal(identity.overlay.request().threadId, null, "Cyclic owner chains terminate without revealing stale local metrics");
const missingRoot = identity.setIdentity();
missingRoot.owner.return = null;
assert.equal(identity.overlay.request().threadId, null, "Unmounted owner branches lack an authoritative current root");
const unknownRoot = identity.setIdentity();
unknownRoot.root.stateNode.current = {};
assert.equal(identity.overlay.request().threadId, null, "An unknown current branch cannot establish a local host");
const rootBoundary = identity.setIdentity();
for (let depth = 20; depth < 511; depth++) {
  rootBoundary.owner.return = { memoizedProps: null, return: rootBoundary.owner.return };
}
assert.equal(identity.overlay.request().threadId, THREAD, "A deeply nested mounted composer is supported within the root bound");
rootBoundary.owner.return = { memoizedProps: null, return: rootBoundary.owner.return };
assert.equal(identity.overlay.request().threadId, null, "The committed-root walk stops beyond its 512-node limit");
const unpaired = identity.setIdentity();
unpaired.owner.memoizedProps = { hostId: "local" };
unpaired.owner.return = { memoizedProps: { conversationId: THREAD }, return: unpaired.root };
assert.equal(identity.overlay.request().threadId, null, "Host and UUID must come from the same owner props");
const nearestRemote = identity.setIdentity(THREAD, "remote");
nearestRemote.owner.return = { memoizedProps: { conversationId: THREAD, hostId: "local" }, return: nearestRemote.root };
assert.equal(identity.overlay.request().threadId, null, "A nearer remote owner cannot be overridden by a local ancestor");
for (const hostId of [undefined, null, 1]) {
  const nearestUnknown = identity.setIdentity(THREAD, hostId);
  nearestUnknown.owner.memoizedProps.hostId = hostId;
  nearestUnknown.owner.return = { memoizedProps: { conversationId: THREAD, hostId: "local" }, return: nearestUnknown.root };
  assert.equal(identity.overlay.request().threadId, null, "A nearer malformed host cannot be overridden by a local ancestor");
}
identity.setIdentity();
delete identity.composer.__reactFiber$fixture;
identity.composer.__unknownFiber = { memoizedProps: { conversationId: THREAD, hostId: "local" } };
assert.equal(identity.overlay.request().threadId, null, "Unsupported renderer metadata fails closed");
identity.overlay.dispose();

const alternate = fixture();
alternate.overlay.update(alternate.sample());
const oldBranch = alternate.setIdentity();
const remoteBranch = alternate.setIdentity(THREAD, "remote");
oldBranch.root.stateNode = remoteBranch.root.stateNode;
oldBranch.fiber.alternate = remoteBranch.fiber;
remoteBranch.fiber.alternate = oldBranch.fiber;
alternate.composer.__reactFiber$fixture = oldBranch.fiber;
assert.equal(alternate.overlay.request().threadId, null, "A stale local Fiber cannot override the current remote alternate");
assert.equal(alternate.row, null);
const localBranch = alternate.setIdentity(OTHER);
oldBranch.root.stateNode = localBranch.root.stateNode;
oldBranch.fiber.alternate = localBranch.fiber;
localBranch.fiber.alternate = oldBranch.fiber;
alternate.composer.__reactFiber$fixture = oldBranch.fiber;
assert.equal(alternate.overlay.request().threadId, OTHER, "A route change follows the committed alternate's identity");
assert.equal(alternate.text, "等待本機用量記錄");
assert.equal(alternate.overlay.update(alternate.sample()), false, "The previous route's asynchronous reply stays rejected after alternate resolution");
assert.equal(alternate.overlay.update(alternate.sample({ threadId: OTHER })), true);
alternate.overlay.dispose();

const installation = JSON.parse(JSON.stringify(f.overlay.request())).installation;
assert.equal(typeof installation, "string");
assert.equal(JSON.parse(JSON.stringify(f.overlay.request())).installation, installation,
  "CDP serialization preserves the installation identity instead of creating a new object each tick");

f.data.composerVisible = false;
assert.equal(f.overlay.request().visible, false);
assert.equal(f.row, null);
f.data.composerVisible = true;
assert.notEqual(f.overlay.request().installation, installation, "Remounting requests an immediate host refresh");
const remounted = f.overlay.request().installation;
assert.equal(f.overlay.request().installation, remounted, "The remounted identity stays stable across serialized polls");
const old = f.overlay;
f.install();
assert.notEqual(f.overlay.request().installation, installation, "Reinstallation changes the primitive identity");
assert.equal(f.parent.children.length, 2, "Reinstallation keeps the strip inside the measured layout, alongside the untouched native footer");
assert.equal(f.anchor.children.length, 2, "Reinstallation leaves only one strip before the native input");
assert.equal(f.anchor.nextElementSibling, f.toolbar);
assert.equal(f.listeners.size, 1);
assert.equal(f.motionListeners.size, 1);
assert.equal(old.request().visible, false);
f.overlay.dispose();
f.overlay.dispose();
assert.equal(f.row, null);
assert.equal(f.timers.size, 0);
assert.equal(f.listeners.size, 0);
assert.equal(f.motionListeners.size, 0);

const nested = fixture();
const wrapper = nested.document.createElement("div");
nested.anchor.append(wrapper);
wrapper.append(nested.composer);
const beforeMove = nested.overlay.request().installation;
assert.equal(nested.row.parentElement, wrapper, "Nested inputs keep the strip within their measured layout ancestor");
assert.equal(nested.row.nextElementSibling, nested.composer);
assert.deepEqual(nested.anchor.children, [wrapper], "Moving inside a nested input leaves no extra footer sibling");
nested.parent.append(nested.anchor);
nested.overlay.request();
assert.deepEqual(nested.parent.children, [nested.toolbar, nested.anchor], "A toolbar above the input keeps its native order");
const replacement = nested.document.createElement("div");
nested.anchor.append(replacement);
replacement.append(nested.composer);
assert.equal(nested.overlay.request().installation, beforeMove, "Reparenting the same input does not rebuild the usage subscription");
assert.equal(nested.row.parentElement, replacement);
assert.equal(wrapper.children.length, 0, "The old wrapper retains no detached strip");
delete nested.composer.__reactFiber$fixture;
nested.overlay.request();
assert.equal(nested.row, null, "Losing input identity removes a strip mounted within a nested composer layout");
nested.overlay.dispose();
assert.doesNotMatch(source, /ResizeObserver|MutationObserver|scrollTo|scrollIntoView|setInterval/,
  "Reservation belongs to the native layout; the overlay adds no scroll commands or measurement observers");

const english = fixture({ lang: "en" });
assert.equal(english.text, "Waiting for local usage records");
english.overlay.update(english.sample({ totalTokens: -1, cachedInputTokens: NaN, contextRemainingPercent: 101 }));
assert.match(english.text, /Tokens —.*Cached —.*Context left —/);
const history = fixture();
const historical = history.sample({ sampledAt: 1 });
assert.equal(history.overlay.update(historical), true, "A completed conversation keeps its historical counters");
assert.equal(history.overlay.status().spinning, false);
history.advance(14000);
assert.equal(history.overlay.update(historical), true, "An unchanged event is a healthy host heartbeat");
history.advance(14000);
assert.equal(history.overlay.status().stale, false);
assert.match(history.text, /Token 1,000/);
assert.equal(history.overlay.update({ ...historical, primary: { remainingPercent: 50, windowMinutes: 300 } }), true);
assert.match(history.text, /5時 額度剩餘 50%/, "Quota refresh can arrive without a newer usage timestamp");
history.advance(15000);
assert.equal(history.overlay.status().stale, true, "Only a missing host heartbeat makes counters stale");
history.overlay.update(historical);
assert.equal(history.overlay.update(null), true);
assert.equal(history.overlay.status().stale, true, "An unavailable host result clears current data immediately");
assert.equal(history.text, "等待本機用量記錄");
assert.notEqual(history.overlay.status().lastReceivedAt, null, "An empty usage result still acknowledges a healthy host");
history.advance(15000);
assert.equal(history.overlay.status().availability, "reconnecting", "Missing records must not hide a later host disconnect");
history.overlay.update(null);
assert.equal(history.overlay.status().availability, "waiting");
const clock = fixture();
const beforeRollback = clock.sample();
assert.equal(clock.overlay.update(beforeRollback), true);
clock.advance(15000, -3600000);
assert.equal(clock.overlay.status().availability, "reconnecting");
assert.equal(clock.overlay.update(beforeRollback), true, "A clock rollback must not reject a genuine historical heartbeat after timeout");
assert.equal(clock.overlay.status().availability, "ready");
assert.equal(clock.overlay.update({ ...beforeRollback, sampledAt: 1100000 }), false,
  "Clock correction must still reject samples ahead of both clocks");
clock.advance(0, 7200000);
assert.equal(clock.overlay.update(clock.sample()), true, "Resume after sleep can advance wall time without advancing the monotonic clock");
const beforeCorrection = clock.sample();
clock.advance(15000, -3600000);
assert.equal(clock.overlay.update(beforeCorrection), true, "A forward adjustment followed by rollback must preserve validated historical heartbeats");
clock.overlay.dispose();
const starting = fixture();
assert.equal(starting.overlay.update({ threadId: THREAD, sampledAt: 1000000, running: true }), true);
assert.equal(starting.overlay.status().spinning, true, "The first turn can animate before any token count exists");
assert.equal(starting.text, "任務執行中 · 等待本機用量記錄");
assert.doesNotMatch(starting.row.title, /Token 事件更新/, "A lifecycle-only event never displays an invented token sample time");
assert.equal(starting.overlay.update(starting.sample({ sampledAt: 999000, running: true })), true,
  "An earlier token timestamp is not an out-of-order sample when the previous snapshot only had lifecycle data");
assert.match(starting.text, /Token 1,000/);
starting.advance(15000);
assert.equal(starting.overlay.status().availability, "reconnecting");
starting.overlay.update({ threadId: THREAD, sampledAt: 1015000, running: true });
assert.equal(starting.overlay.status().availability, "waiting", "A healthy lifecycle heartbeat clears the reconnecting message even before counts arrive");
starting.overlay.dispose();
const hidden = fixture();
hidden.overlay.update(hidden.sample({ running: true }));
hidden.document.hidden = true;
hidden.listeners.get("visibilitychange")();
assert.equal(hidden.timers.size, 0, "An intentionally hidden page has no host-heartbeat timeout");
hidden.advance(60000);
assert.equal(hidden.overlay.status().availability, "waiting", "Intentional suspension never reports a broken connection");
hidden.document.hidden = false;
hidden.listeners.get("visibilitychange")();
assert.equal(hidden.overlay.status().availability, "waiting", "Resuming does not fabricate a host acknowledgment");
assert.equal(hidden.overlay.update(hidden.sample({ running: true })), true);
assert.equal(hidden.overlay.status().availability, "ready");
assert.equal(hidden.overlay.status().spinning, true);
hidden.advance(15000);
assert.equal(hidden.overlay.status().availability, "reconnecting", "A real visible-page heartbeat timeout still fails");
hidden.overlay.dispose();
const cache = fixture();
assert.match(cache.cacheText, /最近快取 —/);
assert.equal(cache.cacheBar.getAttribute("role"), "progressbar");
assert.equal(cache.cacheBar.getAttribute("aria-valuenow"), null, "Unknown cache hit is an indeterminate progressbar");
assert.equal(cache.cacheBar.dataset.available, "false");
cache.overlay.update(cache.sample({ totalTokens: 1234567, lastInputTokens: 2000, lastCachedInputTokens: 500,
  cacheWriteInputTokens: 12345, lastCacheWriteInputTokens: 1234 }));
assert.match(cache.text, /Token 1\.2M/);
assert.match(cache.row.title, /Token 1,234,567.*快取 600/);
assert.match(cache.row.title, /Token 事件更新/);
assert.match(cache.row.title, /服務端快取保存量與保留期限未提供/);
assert.equal(cache.cacheBar.getAttribute("aria-valuenow"), "25", "Cache hit uses latest input, not cumulative cached/input totals");
assert.equal(cache.cacheBar.getAttribute("aria-valuemin"), "0");
assert.equal(cache.cacheBar.getAttribute("aria-valuemax"), "100");
assert.equal(cache.cacheBar.children[0].style.getPropertyValue("transform"), "scaleX(0.25)");
assert.match(cache.cacheText, /最近快取 25% · 快取寫入 1,234/);
assert.match(cache.cacheBar.parentElement.title, /輸入 2,000.*快取 500/);
assert.match(cache.cacheBar.parentElement.title, /快取寫入 1,234.*累計快取寫入 12,345/);
cache.advance(1);
cache.overlay.update(cache.sample({ lastInputTokens: 100, lastCachedInputTokens: 0, cacheWriteInputTokens: 50 }));
assert.equal(cache.cacheBar.getAttribute("aria-valuenow"), "0", "A real zero cache hit remains known");
assert.match(cache.cacheText, /最近快取 0% · 累計快取寫入 50/);
cache.advance(1);
cache.overlay.update(cache.sample({ lastInputTokens: 0, lastCachedInputTokens: 0 }));
assert.equal(cache.cacheBar.getAttribute("aria-valuenow"), null, "A zero-input request does not invent a hit percentage");
assert.doesNotMatch(cache.cacheText, /寫入/);
cache.advance(1);
cache.overlay.update(cache.sample({ lastInputTokens: 10, lastCachedInputTokens: 11 }));
assert.equal(cache.cacheBar.dataset.available, "false");
assert.equal(cache.cacheBar.getAttribute("aria-valuenow"), null);

assert.equal(cache.row.children.length, 3, "Memory is removed so the requested usage metrics have more space");
assert.equal(cache.overlay.updateMemory, undefined);
cache.overlay.dispose();
for (const lang of ["zh-TW", "en"]) {
  const reported = fixture({ lang });
  reported.overlay.update(reported.sample({ planType: null, lastInputTokens: 1000, lastCachedInputTokens: 999,
    cacheWriteInputTokens: 0, lastCacheWriteInputTokens: 0 }));
  assert.match(reported.text, lang === "zh-TW" ? /方案 未提供/ : /Plan not provided/);
  assert.match(reported.row.title, lang === "zh-TW" ? /此對話最近一次回報/ : /latest report in this conversation/);
  assert.match(reported.cacheText, lang === "zh-TW" ? /最近快取 99.9% · 快取寫入 未確認/ : /Recent cache 99.9% · Cache written unconfirmed/);
  assert.match(reported.cacheBar.parentElement.title, lang === "zh-TW" ? /來源值為 0.*來源預設值/ : /Source value is 0.*source default/);
  assert.match(reported.cacheBar.parentElement.title, lang === "zh-TW" ? /並非檔案或磁碟寫入量/ : /not file or disk writes/);
  reported.advance(1);
  reported.overlay.update(reported.sample({ planType: "pro", lastCacheWriteInputTokens: 30, cacheWriteInputTokens: 300 }));
  assert.match(reported.text, lang === "zh-TW" ? /方案 pro/ : /Plan pro/);
  assert.match(reported.cacheText, lang === "zh-TW" ? /快取寫入 30/ : /Cache written 30/);
  assert.doesNotMatch(reported.cacheBar.parentElement.title, /來源值為 0|Source value is 0/);
  reported.advance(1);
  reported.overlay.update(reported.sample({ cacheWriteInputTokens: 0, lastCacheWriteInputTokens: 0 }));
  assert.doesNotMatch(reported.cacheText, /30/, "A zero report must never retain a previous positive write count");
  reported.advance(1);
  reported.overlay.update(reported.sample());
  assert.doesNotMatch(reported.cacheText, /快取寫入|Cache written/, "Absent write fields stay absent after a zero report");
  reported.overlay.dispose();
}
for (const surface of ["work", "dot", "other"]) {
  const absent = fixture({ surface });
  assert.equal(absent.overlay, undefined);
  assert.equal(absent.row, null);
  assert.equal(absent.timers.size, 0);
  assert.equal(absent.listeners.size, 0);
}
assert.doesNotMatch(source, /MutationObserver|requestAnimationFrame|setInterval|canvas/i);
assert.match(css, /@keyframes dream-skin-usage-spin\s*\{\s*to \{ transform: rotate\(360deg\); \}/);
assert.match(css, /prefers-reduced-motion: reduce\)\s*\{\s*html\.codex-dream-skin \.dream-skin-usage-fan svg \{ animation: none !important;/);
assert.match(css, /\.dream-skin-usage\s*\{[^}]*flex-wrap: wrap;/);
assert.match(css, /\.dream-skin-usage-cache-bar\[data-available="false"\]/);
console.log("Token overlay tests passed");
