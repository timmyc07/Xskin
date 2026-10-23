import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import { version } from "../package.json";

const frame = document.querySelector("iframe");
const report = document.getElementById("report");
const fixtureId = "11111111-1111-4111-8111-111111111111";
const imageId = "1".repeat(64);
const videoId = "2".repeat(64);
const name = "Fixture 中文 🌌 " + "long-name-".repeat(12);
const files = JSON.parse(document.getElementById("fixture-data").textContent);
const mediaBytes = Object.fromEntries(Object.entries(files).map(([key, file]) => [key,
  { mimeType: file.mimeType, bytes: Uint8Array.from(atob(file.data), char => char.charCodeAt(0)) }]));
const sample = kind => ({ name, kind, bytes: mediaBytes[kind].bytes.length,
  previewId: kind === "video" ? videoId : imageId, previewMimeType: mediaBytes[kind].mimeType });
let state = { version, platform: "macos", active: { ...sample("image"), applied: true },
  selection: { ...sample("image"), id: fixtureId }, maskOpacity: .62, autostart: false,
  autostartLoaded: false, pendingRecovery: false, language: "en", needsSetup: false };
let failNext = false;
const composerHeight = 148;
const calls = [];
const mediaCalls = [];
const reply = () => ({ content: [], _meta: { "com.xskin/studio": structuredClone(state) } });
const bridge = new AppBridge(null, { name: "Xskin fixture host", version: "1" }, { serverTools: {}, logging: {} },
  { hostContext: { theme: "dark", containerDimensions: { width: 600, height: 680 },
    safeAreaInsets: { top: 12, right: 8, bottom: composerHeight, left: 6 } } });
bridge.oncalltool = async ({ name: tool, arguments: args }) => {
  if (tool === "xskin_read_media") {
    mediaCalls.push(structuredClone(args));
    const file = args.mediaId === imageId ? mediaBytes.image : args.mediaId === videoId ? mediaBytes.video : null;
    if (!file || !Number.isInteger(args.offset) || args.offset < 0 || args.offset >= file.bytes.length) throw new Error("Invalid fixture media request");
    const chunk = file.bytes.subarray(args.offset, args.offset + 512 * 1024);
    let binary = "";
    for (const byte of chunk) binary += String.fromCharCode(byte);
    return { content: [], _meta: { "com.xskin/media": { offset: args.offset, total: file.bytes.length,
      mimeType: file.mimeType, data: btoa(binary) } } };
  }
  calls.push({ name: tool, arguments: structuredClone(args) });
  if (failNext) { failNext = false; return { isError: true, _meta: { "com.xskin/error": "operation_failed" } }; }
  state.cancelled = false;
  switch (tool) {
    case "xskin_status": break;
    case "xskin_choose_media":
      state.selection = { ...sample("image"), id: fixtureId };
      state.active ??= { ...sample("image"), applied: false };
      state.needsSetup = false;
      break;
    case "xskin_apply": state.active = { ...state.selection, applied: true }; state.selection = null; break;
    case "xskin_mask": state.maskOpacity = args.opacity; break;
    case "xskin_pause": state.active.applied = false; break;
    case "xskin_resume": state.active.applied = true; break;
    case "xskin_autostart": state.autostart = args.enabled; state.autostartLoaded = args.enabled; break;
    case "xskin_set_language": state.language = args.language; break;
    default: throw new Error("Unexpected fixture tool");
  }
  return reply();
};
bridge.addEventListener("initialized", async () => { await bridge.sendToolResult(reply()); report.textContent = "Fixture ready. No real tools or settings are used."; });
const ready = bridge.connect(new PostMessageTransport(frame.contentWindow, frame.contentWindow));
const appOrigin = frame.dataset.origin;
frame.src = `${appOrigin}/app.html?host=${encodeURIComponent(location.origin)}`;
let sequence = 0;
const pending = new Map();
window.addEventListener("message", event => {
  if (event.source !== frame.contentWindow || event.origin !== appOrigin || event.data?.fixture !== "xskin-qa") return;
  const request = pending.get(event.data.id);
  if (!request) return;
  pending.delete(event.data.id);
  clearTimeout(request.timer);
  if (event.data.error) request.reject(new Error(event.data.error));
  else request.resolve(event.data.result);
});
const qa = (command = "inspect", args = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Fixture command timed out: ${command}`)); }, 5000);
  pending.set(id, { resolve, reject, timer });
  frame.contentWindow.postMessage({ fixture: "xskin-qa", id, command, args }, appOrigin);
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (ok, description) => { if (!ok) throw new Error(description); };
const wait = async (predicate, description) => {
  for (let i = 0; i < 150; i++) { const view = await qa(); if (predicate(view)) return view; await sleep(20); }
  throw new Error(`Timed out: ${description}`);
};
const update = async () => { await bridge.sendToolResult(reply()); await sleep(40); };
const changeHost = async () => {
  const width = Number(document.getElementById("width").value);
  const theme = document.getElementById("theme").value;
  const dark = theme === "dark";
  frame.parentElement.style.width = `${width}px`;
  frame.style.colorScheme = document.getElementById("canvas").value;
  bridge.setHostContext({ theme, containerDimensions: { width, height: 680 },
    safeAreaInsets: { top: 12, right: 8, bottom: composerHeight, left: 6 }, styles: { variables: {
      "--font-sans": "system-ui, sans-serif", "--color-background-primary": dark ? "#181818" : "#ffffff",
      "--color-background-secondary": dark ? "#232323" : "#f7f7f7", "--color-background-inverse": dark ? "#ffffff" : "#171717",
      "--color-text-primary": dark ? "#f3f3f3" : "#171717", "--color-text-secondary": dark ? "#aaaaaa" : "#666666",
      "--color-text-inverse": dark ? "#171717" : "#ffffff", "--color-border-primary": dark ? "#383838" : "#dddddd",
      "--color-ring-info": dark ? "#3b82f6" : "#2563eb",
    } } });
  state.language = document.getElementById("language").value;
  await update();
};
for (const id of ["width", "theme", "language", "canvas"]) document.getElementById(id).addEventListener("change", changeHost);
document.getElementById("video").onclick = async () => { state.selection = { ...sample("video"), id: fixtureId }; await update(); };
document.getElementById("empty").onclick = async () => { state.active = state.selection = null; state.needsSetup = true; await update(); };
document.getElementById("teardown").onclick = async () => { await bridge.teardownResource({}); report.textContent = "Own fixture teardown completed."; };
document.getElementById("run").onclick = async () => {
  const lines = [];
  const receipt = { fixture: "Cross-origin MCP App over an opaque canvas, sample media only", officialAppTested: false, cases: [] };
  document.getElementById("run").disabled = true;
  try {
    await ready;
    await wait(view => !view.controls.choose.disabled, "SDK handshake");
    const initialCalls = calls.length;
    for (const width of [320, 600, 1280]) for (const canvas of ["light", "dark"]) for (const theme of ["dark", "light"]) for (const language of ["en", "zh-Hant", "zh-Hans", "ja"]) {
      for (const [id, value] of Object.entries({ width, canvas, theme, language })) document.getElementById(id).value = String(value);
      await changeHost();
      let view = await wait(view => view.lang === language && view.theme === theme && view.image.loaded && view.background.imageLoaded, "image, applied background, language and theme");
      check(view.origin !== location.origin, "app iframe must use a separate origin");
      check(view.image.src.startsWith("blob:"), "media must load from SDK chunks and a Blob, never HTTP");
      check(view.bodyBackground === "rgba(0, 0, 0, 0)", "app body must retain its background layer");
      check(view.rootBackground === "rgb(24, 24, 24)", "fixture must simulate an opaque host canvas");
      check(view.background.visible && view.background.imageLoaded && view.background.src.startsWith("blob:"), "applied image must render inside the app above the opaque canvas");
      check(view.background.bounds.height === view.height, "background must fill the iframe, independently of the scrollport");
      check(view.canvasSchemes === "light dark", "canvas must follow the embedder instead of forcing the UI theme");
      check(view.settingsBackground.includes("0.72"), "settings must retain a translucent host surface");
      check(view.primaryBackground === (theme === "dark" ? "rgb(255, 255, 255)" : "rgb(23, 23, 23)"), "host primary button token");
      check(view.overflow <= 1, `horizontal overflow ${width}/${theme}/${language}`);
      check(view.checkedLanguage === language, "language select must match saved preference");
      check(view.languageScheme === theme, "native select must use the host control theme");
      check(view.languageOptionBackground === (theme === "dark" ? "rgb(35, 35, 35)" : "rgb(247, 247, 247)"), "options must inherit explicit host surface colors");
      for (const id of ["choose", "apply", "language", "refresh", "mask", "autostart", "pause"]) {
        view = await qa("focus", { id });
        check(view.controls[id].focused, `keyboard focus ${id}`);
      }
      const positions = [];
      for (const fraction of [0, .25, .5, .75, 1]) {
        view = await qa("fraction", { fraction });
        check(view.scrollport.bottom <= view.height - composerHeight + 1, "entire scrollport must stay above composer at every scroll position");
        check(view.reservedHits.length === 0, "interactive content must never paint or receive hits inside the composer reservation");
        for (const [id, control] of Object.entries(view.controls)) {
          if (!control.hidden && control.box.width > 0 && control.box.top >= view.scrollport.top && control.box.bottom <= view.scrollport.bottom)
            check(control.hit, `visible control ${id} must stay clickable`);
        }
        positions.push({ fraction, scrollTop: view.scrollport.scrollTop, viewportBottom: view.scrollport.bottom, reservedHits: view.reservedHits.length });
      }
      view = await qa("scroll", { id: "pause" });
      check(view.controls.pause.box.bottom <= view.height - composerHeight, "last setting must scroll above host composer");
      check(view.controls.pause.hit, "last setting must be clickable");
      state.active.applied = false;
      await bridge.sendToolResult({ ...reply(), isError: true, _meta: { ...reply()._meta, "com.xskin/error": "apply_failed_restored" } });
      view = await wait(view => view.connectionHint && view.errorVisible, "localized connection guidance");
      check(view.overflow <= 1 && view.error.length > 40, "localized recovery must fit");
      state.active.applied = true;
      await qa("click", { id: "refresh" });
      await wait(view => !view.errorVisible && !view.controls.pause.disabled, "refresh");
      receipt.cases.push({ width, canvas, theme, language, safeAreaBottom: composerHeight, pauseBottom: view.controls.pause.box.bottom, viewportHeight: view.height, overflow: view.overflow, positions });
      lines.push(`PASS ${width}px canvas=${canvas} UI=${theme} ${language}: Blob preview, applied background, contained scrollport, focus, recovery`);
    }
    bridge.setHostContext({ theme: "light" });
    let view = await qa();
    check(parseFloat(view.insetBottom) === composerHeight, "partial context must preserve insets");
    bridge.setHostContext({ safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 } });
    view = await wait(view => parseFloat(view.insetBottom) === 0, "zero inset reset");
    check(view.reservedBottom === 96 && view.scrollport.bottom <= view.height - 96 + 1, "zero inset must reserve an entire 96px viewport region");
    await changeHost();
    const maskCalls = calls.length;
    await qa("focus", { id: "mask" });
    await qa("input", { id: "mask", value: "85" });
    check(calls.length === maskCalls, "slider drag must not write");
    await qa("change", { id: "mask", value: "85" });
    view = await wait(view => state.maskOpacity === .85 && !view.controls.mask.disabled, "mask commit");
    check(view.controls.mask.focused, "slider must recover keyboard focus");
    await qa("click", { id: "apply" });
    await wait(view => state.selection === null && !view.controls.pause.disabled, "apply");
    await qa("click", { id: "pause" });
    view = await wait(view => !state.active.applied && !view.controls.resume.disabled, "pause");
    check(!view.background.visible, "pause must hide the local background layer");
    await qa("click", { id: "resume" });
    await wait(view => state.active.applied && !view.controls.pause.disabled, "resume");
    failNext = true;
    await qa("click", { id: "autostart" });
    view = await wait(view => !view.controls.autostart.disabled && view.errorVisible, "failed switch");
    check(view.controls.autostart.checked === state.autostart, "failed switch must restore saved value");
    await qa("click", { id: "retry" });
    await wait(view => state.autostart && !view.controls.autostart.disabled, "retry");
    state.selection = { ...sample("video"), id: fixtureId };
    await update();
    view = await wait(view => view.video.ready >= 1 && view.video.width > 0, "real MP4 Blob metadata");
    check(view.video.src.startsWith("blob:") && view.video.paused && !view.video.autoplay, "video must decode a paused Blob preview");
    state.active = state.selection = null;
    state.needsSetup = true;
    await update();
    view = await qa();
    check(!view.controls.choose.disabled && view.controls.apply.disabled && view.controls.mask.disabled, "empty setup controls");
    await qa("click", { id: "choose" });
    await wait(view => state.selection && !view.controls.apply.disabled && !view.controls.mask.disabled && view.connectionHint, "first setup selection");
    Object.assign(receipt, { passed: true, initialExtraStatusCalls: initialCalls, mediaReadCalls: mediaCalls.length,
      checks: ["partial/zero safe area", "mask commit/focus", "apply/pause/resume", "error rollback/retry", "MP4 Blob metadata/paused", "first setup"], calls });
    lines.push("PASS dynamic/zero safe areas, mask, apply/pause/resume, rollback/retry, MP4, empty setup");
    lines.push("ALL OWN-BROWSER FIXTURE CHECKS PASSED. Official app Apply remains untested.");
    document.getElementById("width").value = "600";
    document.getElementById("theme").value = "dark";
    document.getElementById("language").value = "zh-Hant";
    await changeHost();
    await qa("top");
  } catch (error) { receipt.passed = false; receipt.error = error.message; lines.push(`FAIL ${error.message}`); }
  document.getElementById("receipt").textContent = JSON.stringify(receipt, null, 2);
  report.textContent = lines.join("\n");
  document.getElementById("run").disabled = false;
};
