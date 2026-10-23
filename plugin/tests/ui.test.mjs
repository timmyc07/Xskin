import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { build } from "esbuild";
import { createStudioController, LANGUAGES, STUDIO_META } from "../ui/controller.mjs";
import { safePreviewUrl, releaseVideo } from "../ui/media.mjs";
import { translate, translations } from "../ui/strings.mjs";

const selectionId = "11111111-1111-4111-8111-111111111111";
const state = changes => ({ version: "1.9.0", platform: "macos", active: null,
  selection: { id: selectionId, name: "中文 🌌.mp4", kind: "video", bytes: 1024 },
  maskOpacity: .62, autostart: false, autostartLoaded: false, needsSetup: false,
  pendingRecovery: false, language: "en", ...changes });
const result = value => ({ content: [], _meta: { [STUDIO_META]: value } });

test("UI uses only private studio metadata, preserves selection after failure and retries the exact apply", async () => {
  const calls = [];
  let failing = true;
  const controller = createStudioController({ async callServerTool(request) {
    calls.push(request);
    if (failing) throw new Error("private backend detail must not be shown");
    return result(state({ active: { name: "saved", applied: true }, selection: null }));
  } }, () => {});
  assert.equal(controller.receive({ structuredContent: state(), content: [] }), false);
  assert.equal(controller.view.state, null);
  controller.receive(result(state()));
  assert.equal(await controller.apply(), false);
  assert.equal(controller.view.state.selection.id, selectionId);
  assert.equal(controller.view.error, "failed");
  assert.equal(controller.view.busy, null);
  failing = false;
  assert.equal(await controller.view.retry(), true);
  assert.deepEqual(calls, [0, 1].map(() => ({ name: "xskin_apply", arguments: { selectionId } })));
  assert.equal(controller.view.state.selection, null);
  assert.equal(controller.view.notice, "applied");
  assert.equal(controller.view.retry, null);
});

test("cancelled native selection never applies or loses saved preferences", async () => {
  const calls = [];
  const controller = createStudioController({ async callServerTool(request) {
    calls.push(request);
    return result(state({ cancelled: true, language: "zh-Hant" }));
  } }, () => {});
  controller.receive(result(state()));
  assert.equal(await controller.choose(), true);
  assert.equal(controller.view.state.selection.id, selectionId);
  assert.equal(controller.view.notice, "cancelled");
  assert.equal(controller.view.state.language, "zh-Hant");
  assert.deepEqual(calls, [{ name: "xskin_choose_media", arguments: {} }]);
});

test("mask commits are bounded and rounded; unchanged mask and invalid language do not write", async () => {
  const calls = [];
  const controller = createStudioController({ async callServerTool(request) {
    calls.push(request);
    return result(state({ maskOpacity: request.arguments.opacity ?? .62 }));
  } }, () => {});
  controller.receive(result(state()));
  for (const value of [NaN, Infinity, -1, 101]) assert.equal(await controller.mask(value), false);
  assert.equal(await controller.mask(62), true);
  assert.equal(await controller.language("not-a-language"), false);
  assert.equal(calls.length, 0);
  assert.equal(await controller.mask(87.4), true);
  assert.deepEqual(calls[0], { name: "xskin_mask", arguments: { opacity: .87 } });
});

test("busy actions cannot overlap and a disposed panel ignores late replies", async () => {
  let finish;
  const calls = [];
  const renders = [];
  const controller = createStudioController({ callServerTool(request) {
    calls.push(request);
    return new Promise(resolve => { finish = resolve; });
  } }, view => renders.push(view.busy));
  controller.receive(result(state()));
  const pending = controller.choose();
  assert.equal(await controller.apply(), false);
  assert.equal(calls.length, 1);
  controller.dispose();
  const rendered = renders.length;
  finish(result(state({ selection: null })));
  assert.equal(await pending, false);
  assert.equal(renders.length, rendered);
  assert.equal(controller.view.state.selection.id, selectionId);
  assert.equal(await controller.refresh(), false);
});

test("failed tool results can reconcile restored state without discarding pending media", async () => {
  const restored = state({ maskOpacity: .35 });
  const controller = createStudioController({ async callServerTool() {
    return { ...result(restored), isError: true };
  } }, () => {});
  controller.receive(result(state()));
  assert.equal(await controller.mask(80), false);
  assert.equal(controller.view.state.maskOpacity, .35);
  assert.equal(controller.view.state.selection.id, selectionId);
  assert.equal(controller.view.notice, null);
  for (const changes of [{ platform: "windows" }, { maskOpacity: NaN }, { language: "unknown" }]) {
    assert.equal(controller.receive(result(state(changes))), false);
    assert.equal(controller.view.state, restored);
  }
});

test("known failures give a localized recovery path without exposing backend messages", async () => {
  const controller = createStudioController({ async callServerTool() {
    return { isError: true, content: [{ type: "text", text: "/private/never-display" }],
      _meta: { "com.xskin/error": "apply_failed_unrestored" } };
  } }, () => {});
  controller.receive(result(state()));
  assert.equal(await controller.apply(), false);
  assert.equal(controller.view.error, "restoreFailed");
  assert.equal(controller.view.state.selection.id, selectionId);
  assert.doesNotMatch(translate(controller.view.error), /private/);
  for (const code of ["__proto__", "constructor", "/private/backend-message"]) {
    controller.receive({ isError: true, _meta: { "com.xskin/error": code } });
    assert.equal(controller.view.error, "failed", "Only explicit error codes choose UI copy");
  }
  for (const code of ["apply_failed_restored", "mask_failed_restored", "resume_unavailable"]) {
    controller.receive({ isError: true, _meta: { "com.xskin/error": code } });
    assert.equal(controller.view.error, code === "resume_unavailable" ? "connectionNeeded" : "changeRestored");
    for (const language of LANGUAGES) assert.ok(translate(controller.view.error, language).length > 30);
  }
});

test("all four languages cover UI controls and announcements", async () => {
  const html = await fs.readFile(new URL("../ui/studio.html", import.meta.url), "utf8");
  for (const [key, values] of Object.entries(translations)) {
    assert.equal(values.length, LANGUAGES.length, key);
    for (const language of LANGUAGES) assert.ok(translate(key, language).trim(), `${key}/${language}`);
  }
  for (const match of html.matchAll(/data-text="([^"]+)"/g)) assert.ok(translations[match[1]], match[1]);
  assert.match(html, /<label[^>]+for="mask"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /id="autostart" type="checkbox" role="switch"/);
  assert.match(html, /<video[^>]+controls[^>]+muted/);
  assert.doesNotMatch(html, /\bautoplay\b/);
});

test("preview accepts only credential-free loopback HTTP and releases media on hide or teardown", () => {
  assert.equal(safePreviewUrl("http://127.0.0.1:1234/preview?token=example"), "http://127.0.0.1:1234/preview?token=example");
  for (const url of [undefined, "javascript:alert(1)", "file:///private/image.png", "https://example.com/media", "http://user:secret@127.0.0.1/media", "http://127.0.0.1.evil.test/media", "http://[::1]:1234/video", "http://localhost:1234/video", "http://127.0.0.1/media", "http://127.0.0.1:0/media"]) assert.equal(safePreviewUrl(url), null);
  let source = true;
  const events = [];
  const video = { pause() { events.push("pause"); }, hasAttribute() { return source; },
    removeAttribute(key) { assert.equal(key, "src"); source = false; events.push("remove"); },
    load() { events.push("load"); } };
  releaseVideo(video);
  assert.deepEqual(events, ["pause", "remove", "load"]);
  releaseVideo(video);
  assert.deepEqual(events, ["pause", "remove", "load", "pause"]);
});

async function uiFixture(initialState) {
  class Node {
    constructor(attributes) {
      this.attributes = new Map([...attributes.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
      this.id = this.attributes.get("id");
      this.dataset = { text: this.attributes.get("data-text") };
      this.listeners = new Map();
      this.style = {};
      this.textContent = "";
      this.mediaEvents = [];
    }
    set src(value) { this.setAttribute("src", value); }
    get src() { return this.getAttribute("src"); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    hasAttribute(key) { return this.attributes.has(key); }
    removeAttribute(key) { this.attributes.delete(key); }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    removeEventListener(name) { this.listeners.delete(name); }
    async emit(name) { return this.listeners.get(name)?.(); }
    matches(selector) { return selector === ":disabled" ? Boolean(this.disabled) : ["choose", "apply", "language", "refresh", "mask", "autostart", "pause", "resume", "retry"].includes(this.id); }
    focus() { document.activeElement = this; }
    pause() { this.mediaEvents.push("pause"); }
    load() { this.mediaEvents.push("load"); }
    play() { throw new Error("Preview must never autoplay"); }
  }
  const html = await fs.readFile(new URL("../ui/studio.html", import.meta.url), "utf8");
  const nodes = [...html.matchAll(/<[a-z][\w-]*\s([^>]+)>/g)].map(match => new Node(match[1]));
  const elements = Object.fromEntries(nodes.filter(node => node.id).map(node => [node.id, node]));
  const document = new Node("");
  document.documentElement = {};
  document.body = new Node("");
  document.activeElement = document.body;
  document.hasFocus = () => true;
  document.querySelectorAll = selector => nodes.filter(node => selector === "[id]" ? node.id : node.dataset.text);
  document.hidden = false;
  const calls = [];
  let response = async () => result(initialState);
  let app;
  class MockApp {
    constructor() { app = this; this.handlers = new Map(); }
    addEventListener(name, handler) { this.handlers.set(name, handler); }
    async connect() {
      assert.ok(this.handlers.has("toolresult"), "Register the initial result handler before connecting");
      assert.ok(this.onteardown, "Register teardown before connecting");
      this.connected = true;
      setImmediate(() => this.handlers.get("toolresult")(result(initialState)));
    }
    getHostContext() { return { theme: "dark", styles: { variables: {} } }; }
    async callServerTool(request, options) {
      assert.equal(this.connected, true, "Never call server tools before the host handshake");
      assert.equal(options.timeout, 210000, "Wait beyond the backend's bounded operation deadline");
      calls.push(request);
      return response(request);
    }
  }
  const bundle = await build({
    entryPoints: [new URL("../ui/index.mjs", import.meta.url).pathname], bundle: true, write: false,
    format: "iife", platform: "browser", target: "es2022", logLevel: "silent",
    plugins: [{ name: "mock-app-sdk", setup(build) {
      build.onResolve({ filter: /^@modelcontextprotocol\/ext-apps$/ }, () => ({ path: "sdk", namespace: "mock-sdk" }));
      build.onLoad({ filter: /.*/, namespace: "mock-sdk" }, () => ({
        contents: "export const App = globalThis.MockApp; export const applyDocumentTheme = () => {}; export const applyHostStyleVariables = () => {};",
        loader: "js",
      }));
    } }],
  });
  const window = new Node("");
  window.location = { reload() {} };
  vm.runInNewContext(bundle.outputFiles[0].text, { document, window, MockApp, URL, Intl, console });
  await new Promise(resolve => setImmediate(resolve));
  return { elements, document, calls, app, setResponse(next) { response = next; } };
}

test("real UI events commit mask only on release, prevent overlap, and restore mask/checkbox after failure", async () => {
  const ui = await uiFixture(state({ active: { name: "Saved", kind: "image", bytes: 1024, applied: true },
    selection: { ...state().selection, kind: "image", previewUrl: "http://127.0.0.1:1234/preview/token" } }));
  const { elements, calls } = ui;
  assert.equal(calls.length, 0, "An initial host result avoids another status request");
  assert.equal(elements.apply.disabled, true, "A pending preview cannot be applied before loading");
  await elements.image.emit("load");
  assert.equal(elements.apply.disabled, false);
  let finish;
  ui.setResponse(() => new Promise(resolve => { finish = resolve; }));
  elements.mask.value = "80";
  await elements.mask.emit("input");
  assert.equal(calls.length, 0);
  assert.equal(elements["preview-mask"].style.opacity, "0.8");
  const changing = elements.mask.emit("change");
  assert.deepEqual(calls.map(call => JSON.parse(JSON.stringify(call))), [{ name: "xskin_mask", arguments: { opacity: .8 } }]);
  assert.equal(elements.settings.disabled, true);
  assert.equal(elements.choose.disabled, true);
  await elements.choose.emit("click");
  assert.equal(calls.length, 1, "A second action cannot overlap even if its handler is invoked");
  finish({ isError: true, _meta: { "com.xskin/error": "operation_failed" } });
  await changing;
  assert.equal(elements.mask.value, "62");
  assert.equal(elements["preview-mask"].style.opacity, "0.62");
  assert.equal(elements["media-name"].textContent, "中文 🌌.mp4");
  assert.equal(elements["error-box"].hidden, false);
  ui.setResponse(async () => ({ isError: true }));
  elements.autostart.checked = true;
  await elements.autostart.emit("change");
  assert.equal(elements.autostart.checked, false);
  assert.equal(elements.settings.disabled, false);
});

test("busy controls restore keyboard focus after completion without stealing a moved focus", async () => {
  const ui = await uiFixture(state({ active: { name: "Saved", kind: "image", bytes: 1024, applied: true } }));
  let finish;
  ui.setResponse(() => new Promise(resolve => { finish = resolve; }));
  for (const moveFocus of [false, true]) {
    ui.elements.mask.focus();
    ui.elements.mask.value = "80";
    const changing = ui.elements.mask.emit("change");
    ui.document.activeElement = moveFocus ? ui.elements.refresh : ui.document.body;
    finish(result(state({ active: { name: "Saved", kind: "image", bytes: 1024, applied: true } })));
    await changing;
    assert.equal(ui.document.activeElement, moveFocus ? ui.elements.refresh : ui.elements.mask);
  }
});

test("real UI video visibility and teardown release sources, recover metadata and never play automatically", async () => {
  const initial = state({ selection: { ...state().selection, previewUrl: "http://127.0.0.1:1234/preview/token" } });
  const ui = await uiFixture(initial);
  const { video, apply } = ui.elements;
  await video.emit("loadedmetadata");
  assert.equal(apply.disabled, false);
  ui.document.hidden = true;
  await ui.document.emit("visibilitychange");
  assert.equal(video.hasAttribute("src"), false);
  assert.equal(apply.disabled, true);
  ui.document.hidden = false;
  await ui.document.emit("visibilitychange");
  assert.equal(video.src, initial.selection.previewUrl);
  assert.equal(apply.disabled, true, "Resume must load preview metadata again");
  await video.emit("loadedmetadata");
  assert.equal(apply.disabled, false);
  ui.app.onteardown();
  assert.equal(video.hasAttribute("src"), false);
  assert.ok(video.mediaEvents.includes("pause") && video.mediaEvents.includes("load"));
  assert.equal(ui.calls.length, 0, "Preview lifecycle must not apply or mutate settings");
});

test("resume restores the saved background without applying or losing a different pending selection", async () => {
  const initial = state({ active: { name: "Saved background", kind: "image", applied: false, bytes: 1024 },
    selection: { ...state().selection, previewUrl: "http://127.0.0.1:1234/preview/token" } });
  const ui = await uiFixture(initial);
  assert.equal(ui.elements.resume.hidden, false);
  assert.equal(ui.elements.resume.disabled, false);
  assert.equal(ui.elements.pause.hidden, true);
  ui.setResponse(async () => result({ ...initial, active: { ...initial.active, applied: true } }));
  await ui.elements.resume.emit("click");
  assert.deepEqual(ui.calls.map(call => JSON.parse(JSON.stringify(call))), [{ name: "xskin_resume", arguments: {} }]);
  assert.equal(ui.elements.resume.hidden, true);
  assert.equal(ui.elements.pause.hidden, false);
  assert.equal(ui.elements["media-name"].textContent, initial.selection.name);
  assert.equal(ui.elements.status.textContent, translate("resumed"));
});
