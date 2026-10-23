import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import { version } from "../package.json";

const frame = document.querySelector("iframe");
const fixtureParams = new URL(location.href).searchParams;
const iframeHeight = Number(fixtureParams.get("frame")) || 680;
const visibleHeight = Number(fixtureParams.get("clip")) || iframeHeight;
const dimensionMode = fixtureParams.get("dimension") ?? "fixed";
frame.style.height = `${iframeHeight}px`;
frame.parentElement.style.height = `${visibleHeight}px`;
frame.parentElement.style.overflow = "hidden";
const dimensions = width => dimensionMode === "max" ? { width, maxHeight: visibleHeight } : { width, height: visibleHeight };
const report = document.getElementById("report");
const fixtureId = "11111111-1111-4111-8111-111111111111";
const imageId = "1".repeat(64);
const videoId = "2".repeat(64);
const appliedMedia = new Map();
let appliedSequence = 3;
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
const composerHeight = Number(fixtureParams.get("composer")) || 148;
document.querySelector(".composer").style.height = `${composerHeight}px`;
const insetMode = fixtureParams.get("insets") ?? "reported";
const safeInsets = insetMode === "absent" ? {} : { safeAreaInsets: { top: 12, right: 8, bottom: insetMode === "zero" ? 0 : composerHeight, left: 6 } };
const calls = [];
const mediaCalls = [];
const reply = (extra = {}) => ({ content: [], _meta: { "com.xskin/studio": { ...structuredClone(state), ...extra } } });
const bridge = new AppBridge(null, { name: "Xskin fixture host", version: "1" }, { serverTools: {}, logging: {} },
  { hostContext: { theme: "dark", containerDimensions: dimensions(600),
    ...safeInsets } });
bridge.oncalltool = async ({ name: tool, arguments: args }) => {
  if (tool === "xskin_read_media") {
    mediaCalls.push(structuredClone(args));
    const file = args.mediaId === imageId ? mediaBytes.image : args.mediaId === videoId ? mediaBytes.video : appliedMedia.get(args.mediaId);
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
    case "xskin_apply": {
      const selection = state.selection;
      const previewId = (++appliedSequence).toString(16).padStart(64, "0");
      appliedMedia.set(previewId, mediaBytes[selection.kind]);
      state.active = { ...selection, previewId, applied: true };
      state.selection = null;
      return reply({ appliedSelectionId: selection.id });
    }
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
const checkLayout = (view, label) => {
  check(view.internalOverflows.length === 0, `${label} inner overflow: ${JSON.stringify(view.internalOverflows)}`);
  check(view.textOverflows.length === 0, `${label} text outside card/control: ${JSON.stringify(view.textOverflows[0])}`);
  const { stage, section, media } = view.previewGeometry;
  check(Math.abs(stage.width - section.width) <= 1, `${label} preview must fill its section width`);
  if (view.previewError) {
    const error = view.previewErrorLocation.bounds;
    check(view.previewErrorLocation.withinStage && Math.abs(stage.height - error.height) <= 2, `${label} preview failure must size to its own message`);
    check(!view.videoHint, `${label} a failed player must not advertise paused playback`);
  } else {
    check(Math.abs(stage.height - stage.width * 9 / 16) <= 1, `${label} preview must retain 16:9`);
    for (const edge of ["left", "right", "top", "bottom"]) check(Math.abs(media[edge] - stage[edge]) <= 2, `${label} media bounds must fill stage ${edge}`);
  }
  check(view.settingsHeading.labelledBy === "settings-heading" && view.settingsHeading.bounds.bottom <= view.settingsHeading.fieldset.top + 1, `${label} section heading must stay outside its labelled card`);
};
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
  bridge.setHostContext({ theme, containerDimensions: dimensions(width),
    ...safeInsets, styles: { variables: {
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
document.getElementById("broken").onclick = async () => {
  state.active = { ...sample("video"), applied: true, previewId: "f".repeat(64) };
  state.selection = null;
  state.needsSetup = false;
  state.language = "zh-Hant";
  frame.parentElement.style.width = "1280px";
  document.body.classList.add("sample-mode");
  await update();
  await qa("top");
};
document.getElementById("teardown").onclick = async () => { await bridge.teardownResource({}); report.textContent = "Own fixture teardown completed."; };
document.getElementById("showcase").onclick = async () => {
  const height = iframeHeight > visibleHeight ? visibleHeight : Math.max(680, innerHeight - 90);
  frame.style.height = `${iframeHeight > visibleHeight ? iframeHeight : height}px`;
  frame.parentElement.style.height = `${height}px`;
  frame.parentElement.style.width = "1280px";
  state.active = { ...sample("image"), name: "Sample landscape.png", applied: true };
  state.selection = null;
  state.maskOpacity = .45;
  state.language = "zh-Hant";
  state.needsSetup = false;
  bridge.setHostContext({ theme: "dark", containerDimensions: { width: 1280, height } });
  document.body.classList.add("sample-mode");
  await update();
  await qa("top");
};
document.getElementById("run").onclick = async () => {
  const lines = [];
  const receipt = { fixture: "Cross-origin MCP App over an opaque canvas, sample media only", officialAppTested: false, insetMode,
    iframeHeight, visibleHeight, composerHeight, dimensionMode, cases: [] };
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
      check(view.scrollbar.width === "thin" && view.scrollbar.track === "rgba(0, 0, 0, 0)", "scrollbar must retain a thin transparent track");
      check(Math.abs(view.scrollport.right - (view.width - view.bodyPaddingRight)) <= 1, "scrollbar must stay at the viewport edge instead of the content column");
      checkLayout(view, `${width}/${theme}/${language}`);
      check(view.checkedLanguage === language, "language select must match saved preference");
      check(Math.abs((view.languageRow.label.top + view.languageRow.label.bottom) / 2 - (view.languageRow.control.top + view.languageRow.control.bottom) / 2) <= 1,
        "normal-size language label and compact selector must share one settings row");
      check(view.languageScheme === theme, "native select must use the host control theme");
      check(view.languageOptionBackground === (theme === "dark" ? "rgb(35, 35, 35)" : "rgb(247, 247, 247)"), "options must inherit explicit host surface colors");
      for (const id of ["choose", "apply", "language", "refresh", "mask", "autostart", "pause"]) {
        view = await qa("focus", { id });
        check(view.controls[id].focused, `keyboard focus ${id}`);
      }
      const positions = [];
      for (const fraction of [0, .25, .5, .75, 1]) {
        view = await qa("fraction", { fraction });
        check(view.scrollport.bottom <= visibleHeight - composerHeight + 1,
          `entire scrollport must stay above actual host clip/composer: bottom=${view.scrollport.bottom}, clip=${visibleHeight}, composer=${composerHeight}, iframe=${view.height}`);
        check(view.reservedHits.length === 0, "interactive content must never paint or receive hits inside the composer reservation");
        for (const [id, control] of Object.entries(view.controls)) {
          if (!control.hidden && control.box.width > 0 && control.box.top >= view.scrollport.top && control.box.bottom <= view.scrollport.bottom)
            check(control.hit, `visible control ${id} must stay clickable`);
        }
        positions.push({ fraction, scrollTop: view.scrollport.scrollTop, viewportBottom: view.scrollport.bottom, reservedHits: view.reservedHits.length });
      }
      view = await qa("scroll", { id: "pause" });
      check(view.controls.pause.box.bottom <= visibleHeight - composerHeight, "last setting must scroll above host composer");
      check(view.controls.pause.hit, "last setting must be clickable");
      state.active.applied = false;
      await bridge.sendToolResult({ ...reply(), isError: true, _meta: { ...reply()._meta, "com.xskin/error": "apply_failed_restored" } });
      view = await wait(view => view.connectionHint && view.errorVisible, "localized connection guidance");
      check(view.overflow <= 1 && view.error.length > 40, "localized recovery must fit");
      checkLayout(view, `error ${width}/${theme}/${language}`);
      state.active.applied = true;
      await qa("click", { id: "refresh" });
      await wait(view => !view.errorVisible && !view.controls.pause.disabled, "refresh");
      receipt.cases.push({ width, canvas, theme, language, safeAreaBottom: insetMode === "reported" ? composerHeight : 0,
        pauseBottom: view.controls.pause.box.bottom, viewportHeight: view.height, bodyHeight: view.bodyHeight, viewportCap: view.viewportCap,
        scrollbar: view.scrollbar, overflow: view.overflow, previewGeometry: view.previewGeometry, internalOverflows: view.internalOverflows, textOverflows: view.textOverflows, positions });
      lines.push(`PASS ${width}px canvas=${canvas} UI=${theme} ${language}: Blob preview, applied background, contained scrollport, focus, recovery`);
    }
    receipt.largeTextCases = [];
    state.selection.name = `Long 中文 🌌 ${"x".repeat(240)}.png`;
    for (const theme of ["dark", "light"]) for (const language of ["en", "zh-Hant", "zh-Hans", "ja"]) {
      for (const [id, value] of Object.entries({ width: 320, theme, language })) document.getElementById(id).value = String(value);
      await changeHost();
      let view = await qa("fontScale", { scale: 2 });
      checkLayout(view, `320/200%/${theme}/${language}`);
      check(view.scrollport.bottom <= visibleHeight - composerHeight + 1 && view.reservedHits.length === 0, "large text must remain inside reserved scrollport");
      receipt.largeTextCases.push({ width: 320, theme, language, scale: 2, filenameLength: state.selection.name.length, previewGeometry: view.previewGeometry, internalOverflows: view.internalOverflows, textOverflows: view.textOverflows });
    }
    await qa("fontScale", { scale: 1 });
    lines.push("PASS 8 narrow 200% text cases with a 240-character filename; inner containers and text rects stay bounded");
    failNext = true;
    await qa("click", { id: "choose" });
    let chooseError = await wait(view => view.errorVisible && !view.controls.choose.disabled, "choose failure feedback");
    check(chooseError.errorLocation.withinPreview, "choose error must stay inside preview near its actions");
    const errorGap = chooseError.errorLocation.bounds.top - chooseError.errorLocation.actions.bottom;
    check(errorGap >= -1 && errorGap <= 100, "choose error must follow its actions instead of the settings footer");
    checkLayout(chooseError, "choose error");
    receipt.chooseFailure = { withinPreview: true, gapAfterActions: errorGap, errorTextLength: chooseError.error.length };
    await qa("click", { id: "refresh" });
    await wait(view => !view.errorVisible, "clear choose error");
    bridge.setHostContext({ theme: "light" });
    let view = await qa();
    check(parseFloat(view.insetBottom) === (insetMode === "reported" ? composerHeight : 0), "partial context must preserve insets");
    const compactComposerHeight = 42;
    document.querySelector(".composer").style.height = `${compactComposerHeight}px`;
    bridge.setHostContext({ safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 } });
    view = await wait(view => parseFloat(view.insetBottom) === 0, "zero inset reset");
    check(view.reservedBottom === 96 && view.scrollport.bottom <= visibleHeight - compactComposerHeight + 1, "zero inset fallback must contain the sample compact composer");
    receipt.zeroInset = { testedComposerHeight: compactComposerHeight, reservedBottom: view.reservedBottom, viewportBottom: view.scrollport.bottom };
    document.querySelector(".composer").style.height = `${composerHeight}px`;
    await changeHost();
    const maskCalls = calls.length;
    await qa("focus", { id: "mask" });
    await qa("input", { id: "mask", value: "85" });
    check(calls.length === maskCalls, "slider drag must not write");
    await qa("change", { id: "mask", value: "85" });
    view = await wait(view => state.maskOpacity === .85 && !view.controls.mask.disabled, "mask commit");
    check(view.controls.mask.focused, "slider must recover keyboard focus");
    const beforeApply = await qa();
    const readsBeforeApply = mediaCalls.length;
    await qa("click", { id: "apply" });
    const afterApply = await wait(view => state.selection === null && !view.controls.pause.disabled, "apply");
    check(afterApply.previewGeometry && mediaCalls.length === readsBeforeApply, "confirmed Apply must promote its complete preview instead of retransferring media");
    check(afterApply.image.src === beforeApply.image.src && afterApply.background.src === beforeApply.image.src,
      "the new active capability must preserve the original preview Blob for both roles");
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
    const originalVideoUrl = view.video.src;
    const readsBeforeVideoApply = mediaCalls.length;
    await qa("click", { id: "apply" });
    view = await wait(view => state.selection === null && !view.controls.pause.disabled && view.video.ready >= 1 && view.background.videoReady >= 1, "MP4 Apply promotion");
    check(view.video.src === originalVideoUrl && view.background.videoSrc === originalVideoUrl && mediaCalls.length === readsBeforeVideoApply,
      "confirmed video Apply must retain its complete original Blob without another transfer");
    receipt.applyPromotions = { imageRetained: afterApply.image.src === beforeApply.image.src, videoRetained: view.video.src === originalVideoUrl, videoBackgroundShared: view.background.videoSrc === originalVideoUrl, videoExtraReads: mediaCalls.length - readsBeforeVideoApply };
    state.selection = { ...sample("video"), id: fixtureId, previewId: "f".repeat(64) };
    await update();
    receipt.previewErrors = [];
    for (const width of [320, 600, 1280]) for (const language of ["en", "zh-Hant", "zh-Hans", "ja"]) {
      document.getElementById("width").value = String(width);
      document.getElementById("language").value = language;
      await changeHost();
      view = await wait(view => view.previewError, "failed preview message");
      checkLayout(view, `preview error ${width}/${language}`);
      receipt.previewErrors.push({ width, language, stage: view.previewGeometry.stage, message: view.previewErrorLocation.bounds, videoHint: view.videoHint });
    }
    lines.push("PASS 12 failed-preview layouts: compact in-stage message and no paused-player hint");
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
