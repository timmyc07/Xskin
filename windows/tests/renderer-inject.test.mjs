import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { detectSurface } from "../scripts/injector.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const macosRoot = path.resolve(here, "..");
const template = await fs.readFile(path.join(macosRoot, "assets", "renderer-inject.js"), "utf8");
const css = await fs.readFile(path.join(macosRoot, "assets", "dream-skin.css"), "utf8");

assert.match(css,
  /data-dream-wallpaper="true"\] main\[data-app-shell-main-surface\] \.messaging-root\.messaging-embedded,\s*html\.codex-dream-skin\[data-dream-wallpaper="true"\] main\[data-app-shell-main-surface\] \.messaging-root\.messaging-embedded \.thread-pane\s*\{\s*background: transparent !important;/,
  "Native Your dot must reveal the shared wallpaper through every nested messaging root and thread pane.",
);
assert.doesNotMatch(css, /html\.codex-dream-skin[^{}]*\barticle\s*[,\{]/,
  "Generic article panels must exclude Dot message rows so they do not frame the existing native bubbles twice.",
);

assert.doesNotMatch(
  css,
  /main\[data-app-shell-main-surface\]\s*>\s*header\.app-header-tint\s*\{[^}]*\b(?:position|z-index)\s*:/,
  "The skin must preserve Codex's native fixed header so the side-panel toggle remains reachable.",
);
assert.doesNotMatch(
  css,
  /main\[data-app-shell-main-surface\]:not\(\.dream-skin-home-shell\)\s*>\s*\*\s*\{[^}]*\bposition\s*:/,
  "Task-route child layering must not overwrite the native header position.",
);

assert.doesNotMatch(
  css,
  /background-image:\s*var\(--dream-skin-art\),\s*var\(--dream-skin-art\)/,
  "The home hero must not stack duplicate copies of the selected image.",
);
assert.match(
  css,
  /data-dream-art-safe="left"[\s\S]{0,140}--ds-art-position:\s*100% var\(--ds-focus-y\);/,
  "A left text-safe image must preserve its right-side subject on narrower windows.",
);
assert.doesNotMatch(
  css,
  /background-size:\s*auto 100% !important;/,
  "Wide home artwork must not leave an unpainted half-card by fitting only to height.",
);
assert.doesNotMatch(
  css,
  /background-size:\s*100% 100%,\s*100% 100%,\s*100% auto;/,
  "Wide task artwork must cover the full route instead of ending above the composer.",
);
assert.match(
  css,
  /data-dream-art-task-mode="ambient"[\s\S]{0,500}body\s*\{[\s\S]{0,500}background-image:\s*var\(--dream-skin-art\) !important;[\s\S]{0,200}background-size:\s*cover !important;/,
  "Wide ambient task artwork should cover the full application window.",
);
assert.match(
  css,
  /data-dream-task-mode="banner"[\s\S]{0,900}body\s*\{[\s\S]{0,500}background-image:\s*var\(--dream-skin-art\) !important;[\s\S]{0,200}background-size:\s*cover !important;/,
  "Wide banner task artwork should use the same full-window wallpaper contract as ambient routes.",
);
assert.match(
  css,
  /data-dream-art-wide="true"\]:has\(main\[data-app-shell-main-surface\]\.dream-skin-home-shell\)[\s\S]{0,100}body\s*\{[\s\S]{0,300}background-image:\s*var\(--dream-skin-art\) !important;/,
  "Wide home artwork should use the same full-window image as utility routes.",
);
assert.match(
  css,
  /data-dream-art-wide="true"\]:has\(main\[data-app-shell-main-surface\]\.dream-skin-home-shell\)[\s\S]{0,120}body\s*\{[\s\S]{0,260}background-position:\s*var\(--ds-art-position\) !important;/,
  "Wide home artwork must honor the configured focal point instead of forcing a centered crop.",
);
assert.match(
  css,
  /data-dream-art-task-mode="ambient"[\s\S]{0,260}data-dream-art-wide="true"\]:has\(main\[data-app-shell-main-surface\]:not\(\.dream-skin-home-shell\)\)[\s\S]{0,120}body\s*\{[\s\S]{0,260}background-position:\s*var\(--ds-art-position\) !important;/,
  "Wide task artwork must retain the same focal point as the home route.",
);
assert.match(
  css,
  /data-dream-art-wide="true"\]\s+\[data-composer-body\]\s*\{[\s\S]{0,500}backdrop-filter:\s*none !important;/,
  "Wide artwork should use one uniform composer surface without a split blur layer.",
);
assert.match(
  css,
  /--ds-composer-surface:\s*rgb\(var\(--ds-panel-rgb\) \/ \.70\);/,
  "The light composer should retain enough transparency to reveal the selected artwork.",
);
assert.match(
  css,
  /data-dream-shell="light"\]\[data-dream-art-wide="true"\][\s\S]{0,100}\[data-composer-body\]\s*\{[\s\S]{0,400}backdrop-filter:\s*blur\(8px\) saturate\(102%\) !important;/,
  "The translucent light composer should softly separate text from detailed artwork.",
);
assert.match(
  template,
  /\[class\*="_homeUtilityBar_"\][\s\S]{0,500}dream-skin-home-utility/,
  "The renderer should give the current native home utility bar a stable theme class.",
);
assert.doesNotMatch(
  css,
  /\.dream-skin-home-utility\s*\{[^}]*(?:top|width|margin-inline|padding-inline|border-radius):/,
  "Toolbar styling must preserve its native placement, size and corner shape.",
);
assert.match(css, /--ds-composer-surface:\s*rgb\(var\(--ds-panel-rgb\) \/ \.58\);/,
  "The dark composer/toolbar material must reveal the wallpaper.");
assert.match(css, /data-dream-wallpaper="true"\] #root \.dream-skin-home-utility,[^}]*background:\s*rgb\(0 0 0 \/ \.38\)/,
  "Video toolbar material must match the translucent composer instead of hiding the video.");
assert.match(
  css,
  /\[data-composer-body\] button:not\(\[class~="bg-token-foreground"\]\)[\s\S]{0,100}color:\s*var\(--ds-muted\) !important;/,
  "Composer controls must remain readable when Codex native tokens lag behind a forced dark appearance.",
);
assert.match(
  css,
  /\[data-composer-body\] button:not\(\[class~="bg-token-foreground"\]\) \*\s*\{[\s\S]{0,80}color:\s*currentColor !important;/,
  "Nested labels inside composer controls must inherit the corrected theme color.",
);
assert.match(
  css,
  /\[data-composer-body\] p\.placeholder::after\s*\{[\s\S]{0,120}color:\s*rgb\(var\(--ds-muted-rgb\) \/ \.82\) !important;[\s\S]{0,80}opacity:\s*1 !important;/,
  "Composer placeholder text must not inherit a stale native color with double opacity.",
);
assert.match(
  css,
  /header\.app-header-tint\s*\{[\s\S]{0,180}background:\s*transparent !important;/,
  "Wide artwork should not paint a separate opaque header band.",
);
assert.match(
  css,
  /\.thread-scroll-container \.bg-gradient-to-t\.from-token-main-surface-primary\s*\{[\s\S]{0,100}background:\s*transparent !important;/,
  "Wide artwork should remove the native opaque fade behind the sticky composer.",
);
assert.match(
  css,
  /div\.sticky:has\(input\[type="text"\]\)[\s\S]{0,100}background:\s*transparent !important;/,
  "Search routes should not retain the native opaque sticky band.",
);
assert.match(
  css,
  /\[class~="bg-token-main-surface-primary"\]\[class~="h-full"\]\[class~="w-full"\][\s\S]{0,100}background:\s*transparent !important;/,
  "Full-size utility route wrappers should not hide the selected artwork.",
);

assert.doesNotMatch(css + template, /main\.main-surface|composer-surface-chrome/, "Retired shell selectors must not remain in the shared renderer.");
assert.match(css, /data-dream-wallpaper="true"\] #app-shell-sidebar \.sidebar-navigation\s*\{\s*background: transparent !important;/, "The native conversation list must reveal the playing video.");
assert.match(css, /data-dream-wallpaper="true"\] \[data-app-shell-page-surface\]\s*\{\s*background: transparent !important;/, "Native page surfaces must not cover the video.");
assert.match(css, /data-dream-wallpaper="true"\] main\[data-app-shell-main-surface\]::before\s*\{\s*content: none !important;/, "Static artwork scrims must not cover the playing video.");
assert.match(css, /data-dream-wallpaper="true"\] body::before\s*\{[^}]*position: fixed;[^}]*inset: 0;[^}]*z-index: -1;[^}]*background: rgb\(0 0 0 \/ var\(--dream-skin-mask-opacity, \.62\)\);[^}]*pointer-events: none;/, "One fixed decorative scrim must cover the whole video background.");
assert.match(css, /#codex-dream-skin-video\s*\{[^}]*z-index: -2;/, "The original video must remain behind the full-window scrim.");
assert.match(css, /data-dream-wallpaper="true"\] #root main\[data-app-shell-main-surface\]\s*\{\s*background: transparent !important;/, "The main surface must not apply the scrim a second time.");
assert.match(css, /#root \[data-composer-body\]\s*\{\s*background: rgb\(0 0 0 \/ \.38\) !important;/, "Composer and summary surfaces should use the same translucent black material.");

function createStyleDeclaration() {
  const values = new Map();
  return {
    values,
    getPropertyValue(name) { return values.get(name) ?? ""; },
    setProperty(name, value) { values.set(name, value); },
    removeProperty(name) { values.delete(name); },
  };
}

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    values,
    add(...names) { for (const name of names) values.add(name); },
    remove(...names) { for (const name of names) values.delete(name); },
    contains(name) { return values.has(name); },
    toggle(name, enabled) {
      if (enabled) values.add(name);
      else values.delete(name);
    },
  };
}

function createFixture(theme, {
  surface = "codex",
  nativeShell = "light",
  analysisFixture = null,
  analysisCache = null,
  homeRoute = false,
  activePageMarker = true,
} = {}) {
  let fixtureShell = nativeShell;
  const nodes = new Map();
  const attributes = new Map();
  const bodyAttributes = new Map();
  const observers = [];
  const resizeObservers = [];
  const timers = new Map();
  let nextTimer = 1;
  let nextBlob = 1;
  const documentListeners = new Map();
  const windowListeners = new Map();
  const motionListeners = new Map();
  const motionQuery = {
    matches: false,
    addEventListener(name, callback) { motionListeners.set(name, callback); },
    removeEventListener(name) { motionListeners.delete(name); },
  };
  const rootStyle = createStyleDeclaration();
  const root = {
    className: nativeShell === "dark" ? "electron-dark" : "electron-light",
    classList: createClassList(),
    style: rootStyle,
    appendChild(node) {
      node.parentElement = root;
      if (node.id) nodes.set(node.id, node);
    },
    getAttribute(name) { return attributes.get(name) ?? null; },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
  };
  const body = {
    className: "",
    appendChild(node) {
      node.parentElement = body;
      if (node.id) nodes.set(node.id, node);
    },
    getAttribute(name) { return bodyAttributes.get(name) ?? null; },
    setAttribute(name, value) { bodyAttributes.set(name, String(value)); },
  };
  const dotCards = [{left:480,top:560,width:320,height:56}, {left:680,top:740,width:120,height:40}]
    .map(bounds => ({
      bounds, visible:true, parentElement:body,
      get offsetWidth() { return bounds.width; },
      get offsetHeight() { return bounds.height; },
      checkVisibility() { return this.visible; },
      getBoundingClientRect() { return {...bounds,x:bounds.left,y:bounds.top,
        right:bounds.left+bounds.width,bottom:bounds.top+bounds.height}; },
      contains(node) { return node === this; },
      dotStyle:{borderTopLeftRadius:"9999px",borderTopRightRadius:"9999px",
        borderBottomRightRadius:"9999px",borderBottomLeftRadius:"9999px"},
    }));
  const shellBox = { left: 280, top: 36, width: 1000, height: 764 };
  const shellMain = {
    parentElement: body,
    classList: createClassList(),
    querySelector(selector) { return activePage.querySelector(selector); },
    getBoundingClientRect() {
      return { ...shellBox };
    },
  };

  const homeSurface = {
    classList: createClassList(),
    querySelector(selector) {
      if (selector === '[data-feature="game-source"]' || selector === '[class~="group/home-suggestions"]') return {};
      throw new SyntaxError(`Unexpected home selector: ${selector}`);
    },
    querySelectorAll() { return []; },
  };
  const activePage = {
    classList: createClassList(),
    parentElement: shellMain,
    querySelector(selector) {
      if (homeRoute && selector === '[data-feature="game-source"]') return { closest: () => homeSurface };
      return null;
    },
    querySelectorAll() { return homeRoute ? [homeSurface] : []; },
  };

  const createElement = (tagName) => {
    if (tagName === "canvas" && analysisFixture) {
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            drawImage() {},
            getImageData() { return { data: analysisFixture.pixels }; },
          };
        },
      };
    }
    const childNodes = new Map();
    const element = {
      id: "",
      dataset: {},
      style: createStyleDeclaration(),
      classList: createClassList(),
      parentElement: null,
      textContent: "",
      innerHTML: "",
      setAttribute() {},
      removeAttribute() {},
      addEventListener(name, callback) { childNodes.set(name, callback); },
      removeEventListener(name) { childNodes.delete(name); },
      dispatchEvent(name) { childNodes.get(name)?.(); },
      readyState: 2,
      videoWidth: 3840,
      videoHeight: 2160,
      paused: true,
      currentTime: 0,
      play() { element.paused = false; element.dispatchEvent("playing"); return Promise.resolve(); },
      pause() { element.paused = true; },
      load() {},
      querySelector(selector) {
        if (!childNodes.has(selector)) childNodes.set(selector, { textContent: "" });
        return childNodes.get(selector);
      },
      remove() { if (element.id) nodes.delete(element.id); },
    };
    return element;
  };

  const document = {
    documentElement: root,
    head: root,
    body,
    createElement,
    hidden: false,
    addEventListener(name, callback) { documentListeners.set(name, callback); },
    removeEventListener(name) { documentListeners.delete(name); },
    getElementById(id) { return nodes.get(id) ?? null; },
    querySelector(selector) {
      if (selector === '[data-app-shell-active-page="true"]') return activePageMarker ? activePage : null;
      if (selector === 'main[data-app-shell-main-surface]:not([data-app-shell-active-page="false"] *)') return surface === 'codex' ? shellMain : null;
      if (selector === 'aside.app-shell-left-panel') return surface === 'codex' ? {} : null;
      if (surface === 'work' && selector === 'main#main') return shellMain;
      if (surface === 'work' && ['main#main #thread', '#thread'].includes(selector)) return activePage;
      if (surface === 'work' && selector === '#prompt-textarea') return {};
      if (surface === 'dot' && ['.codex-avatar-root', '[data-avatar-overlay-native-surface-id="composer"]'].includes(selector)) return {};
      return null;
    },
    querySelectorAll(selector) {
      if (selector.includes('[data-avatar-overlay-native-surface-id="composer"]')) return surface === 'dot' ? dotCards : [];
      if (selector === '.dream-skin-work-surface') {
        return [activePage, shellMain].filter(node => node.classList.contains('dream-skin-work-surface'));
      }
      return [];
    },
    getAnimations() { return []; },
  };
  const mediaQuery = {
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  };
  const revokedUrls = [];
  const window = {
    addEventListener(name, callback) { windowListeners.set(name, callback); },
    removeEventListener(name) { windowListeners.delete(name); },
    dispatchEvent(event) { windowListeners.get(event.type)?.(); },
    matchMedia(query) {
      if (query.includes("prefers-reduced-motion")) return motionQuery;
      mediaQuery.matches = fixtureShell === "dark";
      return mediaQuery;
    },
  };
  if (analysisCache) window.__CODEX_DREAM_SKIN_ANALYSIS_CACHE__ = analysisCache;
  if (analysisFixture) {
    window.Image = class {
      naturalWidth = analysisFixture.naturalWidth;
      naturalHeight = analysisFixture.naturalHeight;
      set src(_) { this.onload(); }
    };
  }
  const context = {
    location: new URL(surface === 'work' ? 'https://chatgpt.com/?source=codex_app_embedded' :
      surface === 'dot' ? 'app://-/index.html?initialRoute=%2Favatar-overlay' : 'app://codex/'),
    URLSearchParams,
    innerWidth: 1280,
    innerHeight: 800,
    Event,
    window,
    document,
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe() {}
      disconnect() {}
    },
    ResizeObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.target = null;
        this.observeCalls = 0;
        resizeObservers.push(this);
      }
      observe(target) { this.target = target; this.observeCalls++; }
      disconnect() { this.target = null; }
    },
    URL: class extends URL {
      static createObjectURL() { return `blob:fixture-${nextBlob++}`; }
      static revokeObjectURL(value) { revokedUrls.push(value); }
    },
    Blob,
    Uint8Array,
    atob,
    getComputedStyle(node) {
      if (node?.dotStyle) return node.dotStyle;
      const skinShell = root.classList.contains("codex-dream-skin")
        ? (attributes.get("data-dream-shell") || "dark") : fixtureShell;
      return {
        colorScheme: skinShell,
        backgroundColor: fixtureShell === "dark" ? "rgb(24, 24, 27)" : "rgb(250, 250, 250)",
      };
    },
    setInterval: () => 1,
    clearInterval() {},
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    cancelAnimationFrame() {},
  };
  const payloadFor = (nextTheme, cssText = ".fixture { color: blue; }") => template
    .replace("__DREAM_SKIN_DETECT_SURFACE__", detectSurface.toString())
    .replace("__DREAM_SKIN_CSS_JSON__", JSON.stringify(cssText))
    .replace("__DREAM_SKIN_ART_JSON__", JSON.stringify("data:image/png;base64,AA=="))
    .replace("__DREAM_SKIN_THEME_JSON__", JSON.stringify(nextTheme))
    .replace("__DREAM_SKIN_VERSION_JSON__", JSON.stringify("test"))
    .replace("__DREAM_SKIN_STYLE_REVISION_JSON__", JSON.stringify(cssText));
  const flushTimers = (maximumDelay = Infinity) => {
    const pending = [...timers.entries()].filter(([, timer]) => timer.delay <= maximumDelay);
    for (const [id, timer] of pending) {
      timers.delete(id);
      timer.callback();
    }
  };

  return {
    attributes,
    body,
    bodyAttributes,
    context,
    document,
    documentListeners,
    dotCards,
    motionQuery,
    motionListeners,
    flushTimers,
    nodes,
    observers,
    payload: payloadFor(theme),
    payloadFor,
    revokedUrls,
    resizeObservers,
    root,
    rootStyle,
    shellBox,
    shellMain,
    homeSurface,
    timers,
    window,
    windowListeners,
    setNativeShell(value) { fixtureShell = value; },
  };
}

for (const activePageMarker of [true, false]) {
  const freshHome = createFixture({ id: "fresh-home" }, { homeRoute: true, activePageMarker });
  assert.doesNotThrow(() => vm.runInNewContext(freshHome.payload, freshHome.context), "A cold shell must detect Home with or without an active-page wrapper.");
  assert.ok(freshHome.homeSurface.classList.contains("dream-skin-home"));
  assert.ok(freshHome.shellMain.classList.contains("dream-skin-home-shell"));
}
const videoHome = createFixture({ id: "video-home", video: "background.mp4" }, { homeRoute: true });
videoHome.homeSurface.classList.add("dream-skin-home");
vm.runInNewContext(videoHome.payload, videoHome.context);
assert.ok(videoHome.homeSurface.classList.contains("dream-skin-video-home"));
assert.equal(videoHome.homeSurface.classList.contains("dream-skin-home"), false, "Video Home must remove legacy banner sizing, borders, and decorative tagline styles.");
assert.ok(videoHome.shellMain.classList.contains("dream-skin-home-shell"));
assert.match(css, /data-dream-wallpaper="true"\] #root main\[data-app-shell-main-surface\]\s*\{[^}]*border: 0 !important;[^}]*border-radius: 0 !important;[^}]*box-shadow: none !important;/, "Video must not retain a decorative frame around the main native surface.");

const defaults = createFixture({
  id: "default-contract",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
});
const defaultResult = vm.runInNewContext(defaults.payload, defaults.context);
assert.equal(defaultResult.installed, true);
assert.equal(defaults.attributes.get("data-dream-shell"), "light");
assert.equal(defaults.attributes.get("data-dream-art-safe-area"), "center");
assert.equal(defaults.attributes.get("data-dream-art-task-mode"), "ambient");
assert.equal(defaults.attributes.get("data-dream-art-ready"), "false");
assert.equal(defaults.rootStyle.values.get("--dream-art-position"), "50.00% 50.00%");
assert.equal(defaults.rootStyle.values.get("--dream-skin-mask-opacity"), "0.62");
const customMask = createFixture({ id: "custom-mask", layout: "wallpaper", maskOpacity: 0.85 });
vm.runInNewContext(customMask.payload, customMask.context);
assert.equal(customMask.rootStyle.values.get("--dream-skin-mask-opacity"), "0.85");
customMask.window.__CODEX_DREAM_SKIN_STATE__.cleanup();
assert.equal(customMask.rootStyle.values.has("--dream-skin-mask-opacity"), false);
const defaultMetrics = defaults.window.__CODEX_DREAM_SKIN_STATE__.metrics;
assert.equal(defaultMetrics.rootPasses, 1);
assert.equal(defaultMetrics.routePasses, 1);
assert.equal(defaultMetrics.layoutReads, 1);
let skinClassWrites = 0;
const addRootClass = defaults.root.classList.add.bind(defaults.root.classList);
defaults.root.classList.add = (...names) => {
  if (names.includes("codex-dream-skin")) skinClassWrites += 1;
  addRootClass(...names);
};
defaults.window.__CODEX_DREAM_SKIN_STATE__.ensure({ route: false, layout: false });
assert.equal(skinClassWrites, 0, "An unchanged root class must not write a mutation that schedules another root pass.");
const rootPassesBeforeMutations = defaultMetrics.rootPasses;
const structuralMutation = [{
  type: "childList", addedNodes: [{nodeType: 1, matches: () => true}], removedNodes: [],
}];
const contentMutation = [{
  type: "childList", addedNodes: [{nodeType: 1, matches: () => false, querySelector: () => null}, {nodeType: 3}], removedNodes: [],
}];
for (let index = 0; index < 100; index += 1) defaults.observers[0].callback(contentMutation);
assert.equal(defaults.timers.size, 0, "Streaming content must not schedule full-document route scans.");
for (let index = 0; index < 50; index += 1) defaults.observers[0].callback(structuralMutation);
assert.equal(defaults.timers.size, 1, "Mutation bursts should coalesce into one scheduled ensure.");
defaults.flushTimers(64);
assert.equal(defaultMetrics.rootPasses, rootPassesBeforeMutations, "Subtree mutations must not recompute root theme tokens.");
assert.equal(defaultMetrics.routePasses, 2);
assert.equal(defaultMetrics.layoutReads, 1, "Subtree mutations must not force shell layout reads.");
defaults.observers[0].callback([{type: "childList", addedNodes: [], removedNodes: [{nodeType: 1, matches: () => false, querySelector: () => ({})}]}]);
assert.equal(defaults.timers.size, 1, "Removing a subtree containing home markers must refresh the route.");
defaults.flushTimers(64);
defaults.observers[0].callback([{type: "attributes"}]);
assert.equal(defaults.timers.size, 1, "Activating an existing page must refresh the route.");
defaults.flushTimers(64);
assert.equal(defaults.resizeObservers.length, 1);
assert.ok(defaults.resizeObservers[0].target);
defaults.shellBox.left = 196;
defaults.shellBox.width = 1084;
defaults.resizeObservers[0].callback([]);
defaults.flushTimers(64);
assert.equal(defaultMetrics.layoutReads, 2, "Shell ResizeObserver changes must refresh chrome geometry.");
const defaultChrome = defaults.nodes.get("codex-dream-skin-chrome");
assert.equal(defaultChrome.style.values.get("left"), "196px");
assert.equal(defaultChrome.style.values.get("width"), "1084px");

// Auto appearance must continue following the native shell after the skin is
// already installed. The fixture makes the injected root color-scheme win
// whenever our class remains on <html>, so a temporary native probe is needed
// for each light → dark → light transition.
const shellFollow = createFixture({
  id: "shell-follow",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
});
shellFollow.root.className = "";
vm.runInNewContext(shellFollow.payload, shellFollow.context);
assert.equal(shellFollow.attributes.get("data-dream-shell"), "light");
shellFollow.setNativeShell("dark");
shellFollow.window.__CODEX_DREAM_SKIN_STATE__.ensure();
assert.equal(shellFollow.attributes.get("data-dream-shell"), "dark");
shellFollow.setNativeShell("light");
shellFollow.window.__CODEX_DREAM_SKIN_STATE__.ensure();
assert.equal(shellFollow.attributes.get("data-dream-shell"), "light");

defaults.root.className = "";
defaults.body.setAttribute("data-theme", "dark");
defaults.observers[1].callback([{ type: "attributes", target: defaults.body }]);
defaults.flushTimers(64);
assert.equal(defaults.attributes.get("data-dream-shell"), "dark", "Body theme changes must apply without the fallback interval.");

const synchronousWide = createFixture({
  id: "synchronous-wide",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
  artKey: "wide-art",
  artMetadata: {
    width: 2400,
    height: 1350,
    ratio: 2400 / 1350,
    wide: true,
    aspect: "wide",
    taskMode: "ambient",
  },
});
vm.runInNewContext(synchronousWide.payload, synchronousWide.context);
assert.equal(synchronousWide.attributes.get("data-dream-art-wide"), "true");
assert.equal(synchronousWide.attributes.get("data-dream-art-aspect"), "wide");
assert.equal(synchronousWide.attributes.get("data-dream-art-task-mode"), "ambient");
assert.equal(synchronousWide.attributes.get("data-dream-art-ready"), "false");

const cachedAnalysis = {
  width: 2400,
  height: 1350,
  ratio: 2400 / 1350,
  wide: true,
  aspect: "wide",
  taskMode: "ambient",
  safeArea: "left",
  focusX: 0.72,
  focusY: 0.48,
  accentRgb: { r: 180, g: 90, b: 110 },
};
const cached = createFixture({
  id: "cached-wide",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
  artKey: "cached-art",
  artMetadata: synchronousWide.window.__CODEX_DREAM_SKIN_STATE__.artMetadata,
}, { analysisCache: new Map([["cached-art", cachedAnalysis]]) });
vm.runInNewContext(cached.payload, cached.context);
assert.equal(cached.attributes.get("data-dream-art-ready"), "true");
assert.equal(cached.attributes.get("data-dream-art-safe-area"), "left");
assert.equal(cached.window.__CODEX_DREAM_SKIN_STATE__.metrics.analysisCacheHits, 1);
assert.equal(cached.window.__CODEX_DREAM_SKIN_STATE__.metrics.analysisRuns, 0);

const previousWideState = synchronousWide.window.__CODEX_DREAM_SKIN_STATE__;
const stableStyle = synchronousWide.nodes.get("codex-dream-skin-style");
vm.runInNewContext(synchronousWide.payloadFor({
  id: "switched-wide",
  appearance: "dark",
  art: { safeArea: "right", taskMode: "ambient" },
  artKey: "switched-art",
  artMetadata: {
    width: 2400,
    height: 1350,
    ratio: 2400 / 1350,
    wide: true,
    aspect: "wide",
    taskMode: "ambient",
  },
}, ".fixture { color: red; }"), synchronousWide.context);
assert.equal(synchronousWide.nodes.get("codex-dream-skin-style"), stableStyle);
assert.equal(stableStyle.textContent, ".fixture { color: red; }");
assert.equal(stableStyle.dataset.dreamSkinVersion, "test");
assert.equal(synchronousWide.rootStyle.values.get("--dream-skin-art"), 'url("blob:fixture-2")');
assert.deepEqual(synchronousWide.revokedUrls, ["blob:fixture-1"]);
assert.equal(previousWideState.cleanup(), false, "An old async cleanup must not remove the new theme.");

const usageLifecycle = createFixture({id: "usage-lifecycle"});
vm.runInNewContext(usageLifecycle.payload, usageLifecycle.context);
const usageLifecycleState = usageLifecycle.window.__CODEX_DREAM_SKIN_STATE__;
let usageRequests = 0;
let usageDisposals = 0;
usageLifecycleState.usageOverlay = {
  request() { usageRequests++; },
  dispose() { usageDisposals++; },
};
usageLifecycleState.ensure();
assert.equal(usageRequests, 1, "Route repair must keep the usage overlay attached to the current composer.");
vm.runInNewContext(usageLifecycle.payload, usageLifecycle.context);
assert.equal(usageDisposals, 1, "Reinjection must dispose the old overlay before replacing renderer state.");
usageLifecycle.window.__CODEX_DREAM_SKIN_STATE__.usageOverlay = {dispose() { usageDisposals++; }};
assert.equal(usageLifecycleState.cleanup(), false);
assert.equal(usageDisposals, 1, "Stale cleanup must not dispose the current overlay.");
assert.equal(usageLifecycle.window.__CODEX_DREAM_SKIN_STATE__.cleanup(), true);
assert.equal(usageDisposals, 2, "Pause and restore cleanup must dispose the current overlay.");

const brightPixels = new Uint8ClampedArray(96 * 32 * 4);
for (let offset = 0; offset < brightPixels.length; offset += 4) {
  brightPixels[offset] = 245;
  brightPixels[offset + 1] = 224;
  brightPixels[offset + 2] = 224;
  brightPixels[offset + 3] = 255;
}
const nativeDark = createFixture({
  id: "native-dark-contract",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
}, {
  nativeShell: "dark",
  analysisFixture: { naturalWidth: 2400, naturalHeight: 800, pixels: brightPixels },
});
vm.runInNewContext(nativeDark.payload, nativeDark.context);
await Promise.resolve();
await Promise.resolve();
nativeDark.window.__CODEX_DREAM_SKIN_STATE__.ensure();
assert.equal(nativeDark.window.__CODEX_DREAM_SKIN_STATE__.analysis.shell, "light");
assert.equal(nativeDark.attributes.get("data-dream-shell"), "dark");
assert.match(nativeDark.rootStyle.values.get("--ds-bg"), /^#[0-9a-f]{6}$/);
assert.ok(Number.parseInt(nativeDark.rootStyle.values.get("--ds-bg").slice(1), 16) < 0x303030);

const explicit = createFixture({
  id: "explicit-contract",
  appearance: "dark",
  art: { focusX: 0.15, focusY: 0.8, safeArea: "none", taskMode: "off" },
});
const explicitResult = vm.runInNewContext(explicit.payload, explicit.context);
assert.equal(explicitResult.shell, "dark");
assert.equal(explicit.attributes.get("data-dream-shell"), "dark");
assert.equal(explicit.attributes.get("data-dream-art-safe-area"), "none");
assert.equal(explicit.attributes.get("data-dream-art-safe"), "none");
assert.equal(explicit.attributes.get("data-dream-art-task-mode"), "off");
assert.equal(explicit.rootStyle.values.get("--dream-art-position"), "15.00% 80.00%");
assert.equal(explicit.window.__CODEX_DREAM_SKIN_STATE__.analysis, null);

const banner = createFixture({
  id: "banner-contract",
  appearance: "auto",
  art: { safeArea: "left", taskMode: "banner" },
  artMetadata: {
    width: 2560,
    height: 1440,
    ratio: 2560 / 1440,
    wide: true,
    aspect: "ultrawide",
    taskMode: "banner",
    safeArea: "left",
    focusX: 0.72,
    focusY: 0.44,
  },
});
vm.runInNewContext(banner.payload, banner.context);
assert.equal(banner.attributes.get("data-dream-art-wide"), "true");
assert.equal(banner.attributes.get("data-dream-art-task-mode"), "banner");
assert.equal(banner.attributes.get("data-dream-task-mode"), "banner");

assert.equal(explicit.window.__CODEX_DREAM_SKIN_STATE__.cleanup(), true);
assert.equal(explicit.root.classList.contains("codex-dream-skin"), false);
assert.equal(explicit.attributes.has("data-dream-shell"), false);
assert.equal(explicit.attributes.has("data-dream-art-safe-area"), false);
assert.equal(explicit.attributes.has("data-dream-art-task-mode"), false);
assert.equal(explicit.rootStyle.values.has("--dream-art-position"), false);
assert.equal(explicit.nodes.has("codex-dream-skin-style"), false);
assert.equal(explicit.nodes.has("codex-dream-skin-chrome"), false);
assert.deepEqual(explicit.revokedUrls, ["blob:fixture-1"]);
await Promise.resolve();
await Promise.resolve();
assert.equal(explicit.root.classList.contains("codex-dream-skin"), false);
assert.equal(explicit.nodes.has("codex-dream-skin-style"), false);
assert.equal(explicit.window.__CODEX_DREAM_SKIN_STATE__, undefined);

console.log("PASS: renderer honors adaptive art metadata, fallback, and cleanup behavior.");

const videoFixture = createFixture({ id: "video", video: "background.mp4", videoKey: "fixture", videoBytes: 1 });
vm.runInNewContext(videoFixture.payload, videoFixture.context);
assert.equal(videoFixture.window.__CODEX_DREAM_SKIN_STATE__.videoStatus().ready, false, "A theme awaiting its file must not verify as an image-only success");
assert.throws(() => videoFixture.window.__CODEX_DREAM_SKIN_STATE__.setVideo({ name: "wrong.mp4", size: 1 }), /does not match/);
videoFixture.window.__CODEX_DREAM_SKIN_STATE__.setVideo({ name: "background.mp4", size: 1 });
assert.equal(videoFixture.window.__CODEX_DREAM_SKIN_STATE__.videoStatus().width, 3840);
assert.equal(videoFixture.window.__CODEX_DREAM_SKIN_STATE__.videoStatus().height, 2160);
const videoNode = videoFixture.nodes.get("codex-dream-skin-video");
const videoState = videoFixture.window.__CODEX_DREAM_SKIN_STATE__;
assert.equal(videoState.videoStatus().quality, null, "An unavailable quality API must not fabricate zero frame counts.");
const qualityTimers = videoFixture.timers.size;
const qualityObservers = videoFixture.observers.length + videoFixture.resizeObservers.length;
videoNode.getVideoPlaybackQuality = () => ({ creationTime: 1250.5, totalVideoFrames: 120, droppedVideoFrames: 3 });
assert.deepEqual(JSON.parse(JSON.stringify(videoState.videoStatus().quality)),
  { sampledAtMs: 1250.5, totalFrames: 120, droppedFrames: 3 });
videoNode.getVideoPlaybackQuality = () => ({ creationTime: 0, totalVideoFrames: 0, droppedVideoFrames: 0 });
assert.deepEqual(JSON.parse(JSON.stringify(videoState.videoStatus().quality)),
  { sampledAtMs: 0, totalFrames: 0, droppedFrames: 0 }, "Actual zero counters remain distinct from an unavailable API.");
for (const invalid of [null, {}, { creationTime: NaN, totalVideoFrames: 10, droppedVideoFrames: 0 },
  { creationTime: -1, totalVideoFrames: 10, droppedVideoFrames: 0 },
  { creationTime: 1, totalVideoFrames: 1.5, droppedVideoFrames: 0 },
  { creationTime: 1, totalVideoFrames: -1, droppedVideoFrames: 0 },
  { creationTime: 1, totalVideoFrames: 10, droppedVideoFrames: -1 },
  { creationTime: 1, totalVideoFrames: 10, droppedVideoFrames: 11 },
  { creationTime: 1, totalVideoFrames: Number.MAX_SAFE_INTEGER + 1, droppedVideoFrames: 0 }]) {
  videoNode.getVideoPlaybackQuality = () => invalid;
  assert.equal(videoState.videoStatus().quality, null, "Invalid quality snapshots must remain unavailable.");
}
videoNode.getVideoPlaybackQuality = () => { throw new Error("quality unavailable"); };
assert.equal(videoState.videoStatus().quality, null, "A quality API failure cannot break playback status.");
delete videoNode.getVideoPlaybackQuality;
assert.equal(videoFixture.timers.size, qualityTimers);
assert.equal(videoFixture.observers.length + videoFixture.resizeObservers.length, qualityObservers,
  "Reading self-owned video counters must add no timers or observers.");
assert.ok(videoNode.muted && videoNode.defaultMuted && videoNode.loop && videoNode.autoplay && videoNode.playsInline);
assert.equal(videoNode.controls, false);
assert.equal(videoFixture.attributes.get("data-dream-video-ready"), "true");
assert.equal(videoFixture.rootStyle.values.get("--dream-skin-art"), "none");
videoFixture.document.hidden = true;
videoFixture.documentListeners.get("visibilitychange")();
assert.equal(videoNode.paused, true);
assert.ok(videoFixture.window.__CODEX_DREAM_SKIN_STATE__.videoStatus().suspended);
assert.equal(videoFixture.attributes.get("data-dream-video-ready"), "true", "Hidden windows keep a decoded paused frame ready for their next presentation.");
videoFixture.document.hidden = false;
videoFixture.documentListeners.get("visibilitychange")();
assert.equal(videoNode.paused, false);
videoFixture.motionQuery.matches = true;
videoFixture.motionListeners.get("change")();
assert.equal(videoNode.paused, true);
videoFixture.motionQuery.matches = false;
videoFixture.motionListeners.get("change")();
videoNode.dispatchEvent("error");
assert.equal(videoNode.paused, true);
assert.ok(videoFixture.window.__CODEX_DREAM_SKIN_STATE__.videoStatus().failed);
assert.notEqual(videoFixture.rootStyle.values.get("--dream-skin-art"), "none");
vm.runInNewContext(videoFixture.payloadFor({ id: "image" }), videoFixture.context);
assert.equal(videoFixture.nodes.has("codex-dream-skin-video"), false);
assert.equal(videoFixture.documentListeners.size, 0);
assert.equal(videoFixture.motionListeners.size, 0);
assert.ok(videoFixture.revokedUrls.includes("blob:fixture-2"));
assert.equal(videoFixture.window.__CODEX_DREAM_SKIN_STATE__.videoStatus, undefined);
console.log("PASS: video loops silently, suspends, falls back on error, and releases resources on image switch.");

const preparedVideo = createFixture({ id: "prepared-video", video: "background.mp4", videoKey: "prepared", videoBytes: 1 });
preparedVideo.document.hidden = true;
vm.runInNewContext(preparedVideo.payload, preparedVideo.context);
preparedVideo.window.__CODEX_DREAM_SKIN_STATE__.setVideo({ name: "background.mp4", size: 1 });
const preparedNode = preparedVideo.nodes.get("codex-dream-skin-video");
preparedNode.dispatchEvent("loadeddata");
assert.equal(preparedNode.preload, "auto");
assert.equal(preparedNode.paused, true);
assert.equal(preparedVideo.window.__CODEX_DREAM_SKIN_STATE__.videoStatus().decoded, true);
assert.equal(preparedVideo.attributes.get("data-dream-video-ready"), "true");
assert.ok(preparedVideo.window.__CODEX_DREAM_SKIN_STATE__.metrics.videoFrameReadyAt > 0);
assert.ok(preparedVideo.window.__CODEX_DREAM_SKIN_STATE__.metrics.maskReadyAt > 0);
preparedVideo.window.__CODEX_DREAM_SKIN_STATE__.cleanup();
console.log("PASS: a hidden launch prepares its original video frame and overlay before presentation.");

for (const surface of ['work', 'dot']) {
  const fixture = createFixture({id: surface, video:'background.mp4', videoKey:'same-original', videoBytes:1}, {surface});
  vm.runInNewContext(fixture.payload, fixture.context);
  const state = fixture.window.__CODEX_DREAM_SKIN_STATE__;
  assert.equal(state.surface, surface);
  assert.equal(state.videoKey, 'same-original');
  state.setVideo({name:'background.mp4',size:1});
  if (surface === 'work') {
    assert.equal(state.videoStatus().width, 3840);
    assert.equal(state.videoStatus().height, 2160);
    assert.ok(fixture.shellMain.classList.contains('dream-skin-work-surface'));
  } else {
    assert.equal(state.videoStatus().width, 3840);
    assert.equal(state.videoStatus().height, 2160);
    assert.equal(fixture.nodes.has('codex-dream-skin-video'), true);
    assert.equal(fixture.attributes.has('data-dream-wallpaper'), false, 'The floating desktop must stay transparent.');
    const video = fixture.nodes.get('codex-dream-skin-video');
    assert.equal(video.style.values.get('left'), '480px');
    assert.equal(video.style.values.get('top'), '560px');
    assert.equal(video.style.values.get('width'), '320px');
    assert.equal(video.style.values.get('height'), '220px');
    assert.equal((video.style.values.get('clip-path').match(/M/g)||[]).length,2,'One player must cover both clipped cards.');
    assert.ok(!video.style.values.get('clip-path').includes('NaN'));
    const observes = fixture.resizeObservers[1].observeCalls;
    state.ensure();
    assert.equal(fixture.resizeObservers[1].observeCalls, observes,'Unchanged cards must not restart ResizeObserver notifications.');
    fixture.dotCards[0].bounds.left = 460;
    fixture.dotCards[0].bounds.width = 340;
    fixture.observers[2].callback();
    assert.equal(video.style.values.get('left'),'460px');
    assert.equal(video.style.values.get('width'),'340px');
    fixture.dotCards.forEach(card => {card.visible=false;});
    state.ensure();
    assert.equal(video.paused,true);
    assert.equal(video.style.values.get('clip-path'),'path("M0 0Z")');
    fixture.dotCards[0].visible=true;
    state.ensure();
    assert.equal(video.paused,false);
    video.dispatchEvent('error');
    assert.equal(state.videoStatus().failed,true);
    assert.equal(fixture.attributes.has('data-dream-video-ready'),false);
    assert.ok(fixture.rootStyle.values.get('--dream-skin-art').includes('blob:'));
  }
  state.cleanup();
  assert.equal(fixture.attributes.has('data-dream-surface'), false);
  assert.equal(fixture.shellMain.classList.contains('dream-skin-work-surface'), false);
  assert.equal(fixture.nodes.has('codex-dream-skin-video'),false);
  assert.equal(fixture.documentListeners.has('transitionrun'),false);
}

const animatedDot = createFixture({id:"animated-dot",video:"background.mp4",videoKey:"original",videoBytes:1}, {surface:"dot"});
const dotFrames = new Map();
let dotFrameId = 0;
animatedDot.context.requestAnimationFrame = callback => {dotFrames.set(++dotFrameId,callback);return dotFrameId;};
animatedDot.context.cancelAnimationFrame = id => dotFrames.delete(id);
vm.runInNewContext(animatedDot.payload, animatedDot.context);
const animatedState = animatedDot.window.__CODEX_DREAM_SKIN_STATE__;
animatedState.setVideo({name:"background.mp4",size:1});
animatedDot.dotCards[0].dotStyle.borderTopLeftRadius = "40% 20%";
animatedDot.document.getAnimations = () => [{playState:"running",effect:{target:animatedDot.dotCards[0]}}];
animatedDot.documentListeners.get("animationstart")();
assert.equal(dotFrames.size,1);
animatedDot.dotCards[0].bounds.left = 450;
const [frameId,frameCallback] = dotFrames.entries().next().value;
dotFrames.delete(frameId);frameCallback();
assert.equal(animatedDot.nodes.get("codex-dream-skin-video").style.values.get("left"),"450px");
assert.ok(!animatedDot.nodes.get("codex-dream-skin-video").style.values.get("clip-path").includes("NaN"));
assert.equal(dotFrames.size,1,"A moving card must keep its clip aligned through the animation.");
animatedState.cleanup();
assert.equal(dotFrames.size,0,"Removal must cancel the clipping animation callback.");

const workFixture = createFixture({id:"hosted-work",video:"background.mp4",videoKey:"original",videoBytes:1}, {surface:"work"});
workFixture.window.__CODEX_DREAM_SKIN_HOST_VISIBLE__ = false;
vm.runInNewContext(workFixture.payload, workFixture.context);
workFixture.window.__CODEX_DREAM_SKIN_STATE__.setVideo({name:"background.mp4",size:1});
const workVideo = workFixture.nodes.get("codex-dream-skin-video");
assert.equal(workVideo.paused, true, "A hidden embedder must suspend video even when document.hidden is false.");
assert.equal(workFixture.window.__CODEX_DREAM_SKIN_STATE__.videoStatus().hostHidden, true);
const hostFixture = createFixture({id:"work-host",video:"background.mp4",videoKey:"original",videoBytes:1});
let hostVisible = false;
let viewUrl = "https://chatgpt.com/?source=codex_app_embedded";
let handoffs = 0;
const viewListeners = new Map();
const view = {
  parentElement: null,
  getURL: () => viewUrl,
  checkVisibility: () => hostVisible,
  getBoundingClientRect: () => ({width:1280,height:800}),
  addEventListener(name, callback) { viewListeners.set(name, callback); },
  removeEventListener(name) { viewListeners.delete(name); },
  async executeJavaScript(expression) { handoffs++; vm.runInNewContext(expression, workFixture.context); },
};
const queryAll = hostFixture.document.querySelectorAll;
hostFixture.document.querySelectorAll = selector => selector === "webview" ? [view] : queryAll(selector);
vm.runInNewContext(hostFixture.payload, hostFixture.context);
const hostState = hostFixture.window.__CODEX_DREAM_SKIN_STATE__;
hostState.setVideo({name:"background.mp4",size:1});
const hostVideo = hostFixture.nodes.get("codex-dream-skin-video");
assert.equal(hostVideo.paused, false);
hostVisible = true;
hostFixture.observers[2].callback();
assert.equal(workVideo.paused, false, "Showing Work must resume its original video.");
assert.equal(hostVideo.paused, true, "A full-window Work view must suspend the covered Codex video.");
hostState.ensure();
assert.equal(handoffs, 2, "Unchanged host visibility must not repeatedly execute guest JavaScript.");
viewListeners.get("did-finish-load")();
assert.equal(handoffs, 3, "A reloaded guest must receive the native visibility again.");
hostVisible = false;
hostFixture.observers[2].callback();
assert.equal(workVideo.paused, true);
assert.equal(hostVideo.paused, false);
viewUrl = "https://example.com/";
hostVisible = true;
hostState.ensure();
assert.equal(handoffs, 4, "Foreign navigations must receive no visibility script.");
hostState.cleanup();
workFixture.window.__CODEX_DREAM_SKIN_STATE__.cleanup();
assert.equal(viewListeners.size, 0);
assert.equal(workFixture.windowListeners.has("codex-dream-skin-host-visibility"), false);
console.log("PASS: native Work visibility switches the active decoder and cleans up its hooks.");
