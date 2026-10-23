import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { build } from "esbuild";
import { createStudioController, LANGUAGES, STUDIO_META } from "../ui/controller.mjs";
import { mediaIdentity, releaseVideo } from "../ui/media.mjs";
import { translate, translations } from "../ui/strings.mjs";

const selectionId = "11111111-1111-4111-8111-111111111111";
const state = changes => ({ version: "1.9.0", platform: "macos", active: null,
  selection: { id: selectionId, name: "中文 🌌.mp4", kind: "video", bytes: 1024,
    previewId: "1".repeat(64), previewMimeType: "video/mp4" },
  maskOpacity: .62, autostart: false, autostartLoaded: false, needsSetup: false,
  pendingRecovery: false, language: "en", ...changes });
const result = value => ({ content: [], _meta: { [STUDIO_META]: value } });

test("UI uses only private studio metadata, preserves selection after failure and retries the exact apply", async () => {
  const calls = [];
  let failing = true;
  const controller = createStudioController({ async callServerTool(request) {
    calls.push(request);
    if (failing) return { isError: true, content: [{ type: "text", text: "private backend detail must not be shown" }] };
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

test("an unconfirmed change refreshes status once and retries only status", async () => {
  const calls = [];
  const controller = createStudioController({ async callServerTool(request) {
    calls.push(request);
    if (request.name === "xskin_apply") throw new Error("transport timeout");
    return result(state({ pendingRecovery: true }));
  } }, () => {});
  controller.receive(result(state()));
  assert.equal(await controller.apply(), false);
  assert.equal(controller.view.state.pendingRecovery, true);
  assert.equal(controller.view.state.selection.id, selectionId);
  assert.equal(controller.view.error, "unconfirmed");
  await controller.view.retry();
  assert.deepEqual(calls.map(call => call.name), ["xskin_apply", "xskin_status", "xskin_status"]);
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

test("teardown cancels only its own file picker while confirmed Apply continues", async () => {
  for (const action of ["choose", "apply"]) {
    let signal;
    let finish;
    const calls = [];
    const controller = createStudioController({ callServerTool(request, options) {
      calls.push(request);
      signal = options.signal;
      return new Promise((resolve, reject) => {
        finish = resolve;
        signal?.addEventListener("abort", () => reject(new Error("picker cancelled")), { once: true });
      });
    } }, () => {});
    controller.receive(result(state()));
    const pending = controller[action]();
    controller.dispose();
    if (action === "choose") assert.equal(signal.aborted, true);
    else {
      assert.equal(signal, undefined, "An accepted Apply transaction must retain its backend lifecycle");
      finish(result(state({ selection: null })));
    }
    assert.equal(await pending, false);
    assert.equal(calls.length, 1, "A closed UI never resends or refreshes a change");
  }
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

test("expired selections refresh state and never retry the rejected media ID", async () => {
  for (const code of ["select_media", "invalid_selection", "missing_selection", "invalid_local_file", "source_changed"]) {
    const calls = [];
    const controller = createStudioController({ async callServerTool(request) {
      calls.push(request);
      return request.name === "xskin_apply" ? { isError: true, _meta: { "com.xskin/error": code } }
        : result(state({ selection: null }));
    } }, () => {});
    controller.receive(result(state()));
    assert.equal(await controller.apply(), false);
    assert.equal(controller.view.state.selection, null);
    assert.equal(controller.view.error, "chooseAgain");
    await controller.view.retry();
    assert.deepEqual(calls.map(call => call.name), ["xskin_apply", "xskin_status", "xskin_status"]);
  }
});

test("failed selection refresh clears only the rejected pending selection", async () => {
  const controller = createStudioController({ async callServerTool(request) {
    if (request.name === "xskin_status") throw new Error("status unavailable");
    return { isError: true, _meta: { "com.xskin/error": "missing_selection" } };
  } }, () => {});
  controller.receive(result(state({ active: { name: "Saved", applied: true } })));
  await controller.apply();
  assert.equal(controller.view.state.selection, null);
  assert.equal(controller.view.state.active.name, "Saved");
  assert.equal(controller.view.error, "chooseAgain");
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

test("failed file selection reports a specific translated cause while preserving the saved and pending media", async () => {
  const previous = state({ active: { name: "Saved", kind: "video", applied: true } });
  for (const [code, key] of Object.entries({ video_size_limit: "videoTooLarge", image_size_limit: "imageTooLarge",
    unsupported_format: "supportedFormats", invalid_video: "invalidVideo", invalid_image: "invalidImage",
    image_dimensions: "imageDimensions", image_conversion: "imageConversion", file_access_denied: "fileAccessDenied" })) {
    const calls = [];
    const controller = createStudioController({ async callServerTool(request) {
      calls.push(request.name);
      return { isError: true, _meta: { "com.xskin/error": code } };
    } }, () => {});
    controller.receive(result(previous));
    assert.equal(await controller.choose(), false);
    assert.equal(controller.view.error, key);
    assert.equal(controller.view.state, previous);
    assert.equal(controller.view.notice, null);
    assert.deepEqual(calls, ["xskin_choose_media"]);
    for (const language of LANGUAGES) assert.ok(translate(key, language).length > 15);
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
  assert.match(html, /<label[^>]+for="language"/);
  assert.match(html, /<select id="language"/);
  assert.equal([...html.matchAll(/<option value="(?:en|zh-Hant|zh-Hans|ja)"/g)].length, 4);
  assert.match(html, /<video[^>]+controls[^>]+muted/);
  assert.doesNotMatch(html, /\bautoplay\b/);
});

test("preview accepts only bounded media identities and releases media on hide or teardown", () => {
  assert.equal(mediaIdentity(state().selection), `video:${"1".repeat(64)}`);
  for (const changes of [{ previewId: "private/path" }, { previewId: "a".repeat(63) }, { previewMimeType: "text/html" },
    { bytes: 0 }, { bytes: 257 * 1024 * 1024 }, { kind: "image" }, { bytes: Infinity }]) {
    assert.equal(mediaIdentity({ ...state().selection, ...changes }), null);
  }
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

async function uiFixture(initialState, initialHostContext = { theme: "dark", styles: { variables: {} } }) {
  class Node {
    constructor(attributes) {
      this.attributes = new Map([...attributes.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
      this.id = this.attributes.get("id");
      this.dataset = { text: this.attributes.get("data-text") };
      this.value = this.attributes.get("value") ?? "";
      this.listeners = new Map();
      this.style = { setProperty(key, value) { this[key] = value; } };
      this.textContent = "";
      this.mediaEvents = [];
      this.paused = true;
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
    matches(selector) { return selector === ":disabled" ? Boolean(this.disabled) : ["choose", "apply", "refresh", "mask", "autostart", "pause", "resume", "recover", "retry", "language"].includes(this.id); }
    focus() { document.activeElement = this; }
    pause() { this.paused = true; this.mediaEvents.push("pause"); }
    load() { this.mediaEvents.push("load"); }
    play() {
      if (this.id !== "background-video") throw new Error("Preview must never autoplay");
      this.paused = false;
      this.mediaEvents.push("play");
      return Promise.resolve();
    }
  }
  const html = await fs.readFile(new URL("../ui/studio.html", import.meta.url), "utf8");
  const nodes = [...html.matchAll(/<[a-z][\w-]*\s([^>]+)>/g)].map(match => new Node(match[1]));
  const elements = Object.fromEntries(nodes.filter(node => node.id).map(node => [node.id, node]));
  const document = new Node("");
  document.documentElement = new Node("");
  document.body = new Node("");
  document.activeElement = document.body;
  document.hasFocus = () => true;
  document.querySelectorAll = selector => nodes.filter(node => selector === "[id]" ? node.id : node.dataset.text);
  document.hidden = false;
  const calls = [];
  const mediaCalls = [];
  const revoked = [];
  const blobs = [];
  let currentState = initialState;
  let response = async () => result(initialState);
  let mediaResponse = request => {
    const media = [currentState.selection, currentState.active].find(media => media?.previewId === request.arguments.mediaId);
    const offset = request.arguments.offset;
    return { _meta: { "com.xskin/media": { offset, total: media.bytes, mimeType: media.previewMimeType,
      data: Buffer.alloc(Math.min(512 * 1024, media.bytes - offset)).toString("base64") } } };
  };
  class FixtureURL extends URL {
    static createObjectURL(blob) { blobs.push(blob); return `blob:https://fixture.invalid/${blobs.length}`; }
    static revokeObjectURL(url) { revoked.push(url); }
  }
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
    getHostContext() { return initialHostContext; }
    async callServerTool(request, options) {
      assert.equal(this.connected, true, "Never call server tools before the host handshake");
      if (request.name === "xskin_read_media") {
        assert.equal(options.timeout, 30000);
        mediaCalls.push(request);
        return mediaResponse(request, options);
      }
      assert.equal(options.timeout, 210000, "Wait beyond the backend's bounded operation deadline");
      calls.push(request);
      const reply = await response(request);
      currentState = reply?._meta?.[STUDIO_META] ?? currentState;
      return reply;
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
  const motionQuery = new Node("");
  motionQuery.matches = false;
  window.matchMedia = () => motionQuery;
  vm.runInNewContext(bundle.outputFiles[0].text, { document, window, MockApp, URL: FixtureURL, Intl, console,
    Blob, atob, AbortController });
  await new Promise(resolve => setImmediate(resolve));
  return { elements, document, calls, mediaCalls, revoked, blobs, app, motionQuery,
    setResponse(next) { response = next; }, setMediaResponse(next) { mediaResponse = next; } };
}

test("initial and changing host safe areas preserve partial updates and allow zero reset", async () => {
  const ui = await uiFixture(state(), { safeAreaInsets: { top: 12, right: 8, bottom: 164, left: 6 } });
  const styles = ui.document.documentElement.style;
  assert.equal(styles["--studio-safe-top"], "12px");
  assert.equal(styles["--studio-safe-right"], "8px");
  assert.equal(styles["--studio-safe-bottom"], "164px");
  assert.equal(styles["--studio-safe-left"], "6px");
  ui.app.handlers.get("hostcontextchanged")({ theme: "light" });
  assert.equal(styles["--studio-safe-bottom"], "164px");
  ui.app.handlers.get("hostcontextchanged")({ safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 } });
  assert.equal(styles["--studio-safe-bottom"], "0px");
  ui.app.handlers.get("hostcontextchanged")({ safeAreaInsets: { top: -1, right: Infinity, bottom: NaN, left: "12" } });
  assert.equal(styles["--studio-safe-top"], "0px");
  assert.equal(styles["--studio-safe-right"], "0px");
  assert.equal(styles["--studio-safe-bottom"], "0px");
  assert.equal(styles["--studio-safe-left"], "0px");
});

test("language select stays available during first setup, prevents busy changes and restores a failed choice", async () => {
  const ui = await uiFixture(state({ language: "zh-Hant", needsSetup: true, active: null }));
  assert.equal(ui.elements.language.value, "zh-Hant");
  assert.equal(ui.elements.language.disabled, false);
  assert.equal(ui.elements.settings.disabled, true);
  let finish;
  ui.setResponse(() => new Promise(resolve => { finish = resolve; }));
  ui.elements.language.value = "ja";
  const changing = ui.elements.language.emit("change");
  assert.equal(ui.elements.language.disabled, true);
  await ui.elements.choose.emit("click");
  assert.deepEqual(ui.calls.map(call => JSON.parse(JSON.stringify(call))), [{ name: "xskin_set_language", arguments: { language: "ja" } }]);
  finish({ isError: true });
  await changing;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.elements.language.disabled, false);
  assert.equal(ui.elements.language.value, "zh-Hant");
});

test("interrupted changes require explicit recovery, retry safely, and never resend Apply", async () => {
  const initial = state({ pendingRecovery: true, active: { name: "Saved", kind: "image", applied: true } });
  const ui = await uiFixture(initial);
  assert.equal(ui.elements.recover.hidden, false);
  assert.equal(ui.elements.recover.disabled, false);
  for (const id of ["choose", "apply", "settings", "language"]) assert.equal(ui.elements[id].disabled, true, id);
  await ui.elements.refresh.emit("click");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.elements.recover.hidden, false, "Read-only Refresh must not recover a journal");
  assert.deepEqual(ui.calls.map(call => call.name), ["xskin_status"]);
  let finish;
  ui.setResponse(() => new Promise(resolve => { finish = resolve; }));
  const recovering = ui.elements.recover.emit("click");
  assert.equal(ui.elements.recover.disabled, true);
  finish({ isError: true });
  await recovering;
  assert.equal(ui.elements.recover.disabled, false);
  assert.equal(ui.elements.apply.disabled, true);
  assert.equal(ui.elements["error-box"].hidden, false);
  ui.setResponse(async request => {
    assert.equal(request.name, "xskin_recover");
    assert.deepEqual(JSON.parse(JSON.stringify(request.arguments)), {});
    return result({ ...initial, pendingRecovery: false });
  });
  await ui.elements.retry.emit("click");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.elements.recover.hidden, true);
  assert.equal(ui.elements.recover.disabled, true);
  assert.equal(ui.elements.recovery.hidden, true);
  for (const id of ["choose", "apply", "settings", "language"]) assert.equal(ui.elements[id].disabled, false, id);
  assert.equal(ui.elements["media-name"].textContent, initial.selection.name);
  assert.equal(ui.elements.status.textContent, translate("recovered"));
  assert.deepEqual(ui.calls.map(call => call.name), ["xskin_status", "xskin_recover", "xskin_recover"]);
});

test("real UI events commit mask only on release, prevent overlap, and restore mask/checkbox after failure", async () => {
  const ui = await uiFixture(state({ active: { name: "Saved", kind: "image", bytes: 1024, applied: true },
    selection: { ...state().selection, kind: "image", previewMimeType: "image/png" } }));
  const { elements, calls } = ui;
  assert.equal(calls.length, 0, "An initial host result avoids another status request");
  assert.equal(elements.apply.disabled, false, "Preview readiness must not block applying the validated original file");
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
  const initial = state();
  const ui = await uiFixture(initial);
  const { video, apply } = ui.elements;
  await video.emit("loadedmetadata");
  assert.equal(apply.disabled, false);
  ui.document.hidden = true;
  await ui.document.emit("visibilitychange");
  assert.equal(video.hasAttribute("src"), false);
  assert.equal(apply.disabled, false, "Hidden previews do not invalidate the pending file");
  ui.document.hidden = false;
  await ui.document.emit("visibilitychange");
  await new Promise(resolve => setImmediate(resolve));
  assert.match(video.src, /^blob:/);
  assert.equal(apply.disabled, false, "Preview resume must not block applying the original file");
  await video.emit("loadedmetadata");
  assert.equal(apply.disabled, false);
  ui.app.onteardown();
  assert.equal(video.hasAttribute("src"), false);
  assert.equal(ui.revoked.length, 2);
  assert.ok(video.mediaEvents.includes("pause") && video.mediaEvents.includes("load"));
  assert.equal(ui.calls.length, 0, "Preview lifecycle must not apply or mutate settings");
});

test("preview failures preserve Apply and explicit Refresh reloads the same media identity", async () => {
  const initial = state({ selection: { ...state().selection, kind: "image", previewMimeType: "image/png" } });
  const ui = await uiFixture(initial);
  const firstUrl = ui.elements.image.src;
  const firstReads = ui.mediaCalls.length;
  await ui.elements.refresh.emit("click");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.elements.image.src, firstUrl);
  assert.equal(ui.mediaCalls.length, firstReads, "A successful Blob must survive a state-only refresh without another full media transfer");
  await ui.elements.image.emit("error");
  assert.equal(ui.elements["preview-error"].hidden, false);
  assert.equal(ui.elements.apply.disabled, false, "Decode failure does not invalidate the original file");
  ui.setMediaResponse(async () => { throw new Error("preview unavailable"); });
  await ui.elements.refresh.emit("click");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.elements["preview-error"].hidden, false);
  assert.equal(ui.elements.apply.disabled, false);
  assert.ok(ui.revoked.includes(firstUrl));
  ui.setMediaResponse(async () => ({ _meta: { "com.xskin/media": { offset: 0, total: 1024,
    mimeType: "image/png", data: Buffer.alloc(1024).toString("base64") } } }));
  await ui.elements.refresh.emit("click");
  await new Promise(resolve => setImmediate(resolve));
  assert.notEqual(ui.elements.image.src, firstUrl);
  assert.match(ui.elements.image.src, /^blob:/);
  await ui.elements.image.emit("load");
  assert.equal(ui.elements["preview-error"].hidden, true);
  assert.equal(ui.elements["media-name"].textContent, initial.selection.name);
});

test("hiding an unfinished preview aborts its read and a late chunk cannot recreate its Blob", async () => {
  const ui = await uiFixture(state());
  let finish;
  let signal;
  ui.setMediaResponse((request, options) => {
    signal = options.signal;
    return new Promise(resolve => { finish = resolve; });
  });
  ui.app.handlers.get("toolresult")(result(state({ selection: { ...state().selection, previewId: "2".repeat(64) } })));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.elements["preview-status"].hidden, false);
  ui.document.hidden = true;
  await ui.document.emit("visibilitychange");
  assert.equal(signal.aborted, true);
  finish({ _meta: { "com.xskin/media": { offset: 0, total: 1024,
    mimeType: "video/mp4", data: Buffer.alloc(1024).toString("base64") } } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.blobs.length, 1, "An aborted response must never create a Blob");
  assert.equal(ui.elements.video.hasAttribute("src"), false);
  assert.equal(ui.elements.apply.disabled, false);
  ui.app.onteardown();
});

test("resume restores the saved background without applying or losing a different pending selection", async () => {
  const initial = state({ active: { name: "Saved background", kind: "image", applied: false, bytes: 1024 },
    selection: { ...state().selection } });
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

test("active background shares one original preview, preserves it across pending changes and releases only its last owner", async () => {
  const active = { ...state().selection, applied: true };
  const initial = state({ active, selection: null });
  const ui = await uiFixture(initial);
  await new Promise(resolve => setImmediate(resolve));
  const background = ui.elements["background-video"];
  const originalUrl = background.src;
  assert.equal(ui.elements.video.src, originalUrl);
  assert.equal(ui.mediaCalls.length, 1);
  assert.equal(ui.blobs.length, 1);
  assert.equal(background.paused, false);
  assert.equal(ui.elements.video.paused, true, "The explicit preview never autoplays");
  assert.equal(ui.elements["background-mask"].style.opacity, "0.62");
  ui.motionQuery.matches = true;
  await ui.motionQuery.emit("change");
  assert.equal(background.paused, true);
  ui.motionQuery.matches = false;
  await ui.motionQuery.emit("change");
  assert.equal(background.paused, false);
  const pending = { ...state().selection, previewId: "2".repeat(64) };
  ui.setResponse(async () => result({ ...initial, selection: pending }));
  await ui.elements.choose.emit("click");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(background.src, originalUrl, "Choosing another file retains the active background");
  assert.notEqual(ui.elements.video.src, originalUrl);
  assert.equal(ui.mediaCalls.filter(call => call.arguments.mediaId === active.previewId).length, 1);
  assert.equal(ui.revoked.includes(originalUrl), false);
  const pendingUrl = ui.elements.video.src;
  ui.setResponse(async () => result(initial));
  await ui.elements.refresh.emit("click");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.elements.video.src, originalUrl, "Removing pending media reuses the saved Blob");
  assert.equal(background.src, originalUrl);
  assert.ok(ui.revoked.includes(pendingUrl));
  assert.equal(ui.mediaCalls.length, 2);
  await ui.app.onteardown();
  assert.equal(ui.revoked.filter(url => url === originalUrl).length, 1);
  assert.equal(background.hasAttribute("src"), false);
  assert.equal(background.paused, true);
});

test("background decoding failures are visible, Refresh retries, and pause removes only the active background", async () => {
  const active = { ...state().selection, applied: true, previewId: "3".repeat(64) };
  const initial = state({ active });
  const ui = await uiFixture(initial);
  await new Promise(resolve => setImmediate(resolve));
  await ui.elements["background-video"].emit("error");
  assert.equal(ui.elements["background-error"].hidden, false);
  assert.equal(ui.elements.apply.disabled, false);
  const oldBackground = ui.elements["background-video"].src;
  await ui.elements.refresh.emit("click");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.elements["background-error"].hidden, true);
  assert.ok(ui.revoked.includes(oldBackground));
  assert.notEqual(ui.elements["background-video"].src, oldBackground);
  const pendingUrl = ui.elements.video.src;
  ui.setResponse(async () => result({ ...initial, active: { ...active, applied: false } }));
  await ui.elements.pause.emit("click");
  assert.equal(ui.elements["studio-background"].hidden, true);
  assert.equal(ui.elements["background-video"].hasAttribute("src"), false);
  assert.equal(ui.elements.video.src, pendingUrl);
  assert.equal(ui.revoked.includes(pendingUrl), false);
  await ui.app.onteardown();
});
