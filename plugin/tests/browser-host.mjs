import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";

const frame = document.querySelector("iframe");
const report = document.getElementById("report");
const fixtureId = "11111111-1111-4111-8111-111111111111";
const name = "Fixture 中文 🌌 " + "long-name-".repeat(12);
const sample = kind => ({ name, kind, bytes: 4096,
  previewUrl: `${location.origin}/sample.${kind === "video" ? "mp4" : "svg"}` });
let state = { version: "1.9.0", platform: "macos", active: { ...sample("image"), applied: true },
  selection: { ...sample("image"), id: fixtureId }, maskOpacity: .62, autostart: false,
  autostartLoaded: false, pendingRecovery: false, language: "en", needsSetup: false };
let failNext = false;
const calls = [];
const reply = () => ({ content: [], _meta: { "com.xskin/studio": structuredClone(state) } });
const bridge = new AppBridge(null, { name: "Xskin fixture host", version: "1" }, { serverTools: {}, logging: {} },
  { hostContext: { theme: "dark", containerDimensions: { width: 600, maxHeight: 1600 } } });
bridge.oncalltool = async ({ name: tool, arguments: args }) => {
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
frame.src = "/app.html";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const element = id => frame.contentDocument.getElementById(id);
const check = (ok, description) => { if (!ok) throw new Error(description); };
const wait = async (predicate, description) => {
  for (let i = 0; i < 150; i++) { if (predicate()) return; await sleep(20); }
  throw new Error(`Timed out: ${description}`);
};
const update = async () => { await bridge.sendToolResult(reply()); await sleep(40); };
const changeHost = async () => {
  const width = Number(document.getElementById("width").value);
  const theme = document.getElementById("theme").value;
  const dark = theme === "dark";
  frame.style.width = `${width}px`;
  bridge.setHostContext({ theme, containerDimensions: { width, maxHeight: 1600 }, styles: { variables: {
    "--font-sans": "system-ui, sans-serif",
    "--color-background-primary": dark ? "#181818" : "#ffffff",
    "--color-background-secondary": dark ? "#232323" : "#f7f7f7",
    "--color-background-inverse": dark ? "#ffffff" : "#171717",
    "--color-text-primary": dark ? "#f3f3f3" : "#171717",
    "--color-text-secondary": dark ? "#aaaaaa" : "#666666",
    "--color-text-inverse": dark ? "#171717" : "#ffffff",
    "--color-border-primary": dark ? "#383838" : "#dddddd",
    "--color-ring-info": dark ? "#3b82f6" : "#2563eb",
  } } });
  state.language = document.getElementById("language").value;
  await update();
};
for (const id of ["width", "theme", "language"]) document.getElementById(id).addEventListener("change", changeHost);
document.getElementById("video").onclick = async () => {
  state.selection = { ...sample("video"), id: fixtureId };
  await update();
  report.textContent = "Video sample loaded. It must remain paused until Play is selected.";
};
document.getElementById("empty").onclick = async () => {
  state.active = state.selection = null;
  state.needsSetup = true;
  await update();
  report.textContent = "Empty setup fixture; choosing media is simulated and never opens a real picker.";
};
document.getElementById("teardown").onclick = async () => {
  await bridge.teardownResource({});
  report.textContent = "Teardown completed using the real SDK.";
};
document.getElementById("run").onclick = async () => {
  const lines = [];
  const runButton = document.getElementById("run");
  runButton.disabled = true;
  try {
    await ready;
    await wait(() => element("choose") && !element("choose").disabled, "initial SDK handshake");
    const initialCalls = calls.length;
    for (const width of [320, 600, 1280]) {
      for (const theme of ["dark", "light"]) {
        for (const language of ["en", "zh-Hant", "zh-Hans", "ja"]) {
          document.getElementById("width").value = String(width);
          document.getElementById("theme").value = theme;
          document.getElementById("language").value = language;
          await changeHost();
          await wait(() => element("image").complete && element("image").naturalWidth > 0 && !element("apply").disabled, "image preview");
          const doc = frame.contentDocument;
          check(doc.documentElement.lang === language, "language must match saved state");
          check(doc.documentElement.dataset.theme === theme, "host theme must apply");
          check(frame.contentWindow.getComputedStyle(doc.body).backgroundColor === (theme === "dark" ? "rgb(24, 24, 24)" : "rgb(255, 255, 255)"), "host surface token must apply");
          check(frame.contentWindow.getComputedStyle(element("apply")).backgroundColor === (theme === "dark" ? "rgb(255, 255, 255)" : "rgb(23, 23, 23)"), "host inverse button token must apply");
          check(doc.documentElement.scrollWidth <= doc.documentElement.clientWidth + 1, `horizontal overflow ${width}/${theme}/${language}`);
          check(doc.querySelectorAll("img").length === 1, "preview must not turn names into HTML");
          for (const id of ["choose", "apply", "language", "refresh", "mask", "autostart", "pause"]) {
            const control = element(id);
            control.focus();
            check(doc.activeElement === control, `focus ${id}`);
          }
          state.active.applied = false;
          await bridge.sendToolResult({ ...reply(), isError: true, _meta: { ...reply()._meta, "com.xskin/error": "apply_failed_restored" } });
          await wait(() => !element("connection-hint").hidden && !element("error-box").hidden, "connection guidance");
          check(doc.documentElement.scrollWidth <= doc.documentElement.clientWidth + 1, `error overflow ${width}/${theme}/${language}`);
          check(element("error").textContent.length > 40, "actionable localized error must be visible");
          state.active.applied = true;
          element("refresh").click();
          await wait(() => element("error-box").hidden && !element("pause").disabled, "refresh after guidance");
          lines.push(`PASS ${width}px ${theme} ${language}: layout, preview, focus, connection guidance`);
        }
      }
    }
    const maskCalls = calls.length;
    element("mask").focus();
    element("mask").value = "85";
    element("mask").dispatchEvent(new Event("input", { bubbles: true }));
    check(calls.length === maskCalls, "mask drag must not write");
    element("mask").dispatchEvent(new Event("change", { bubbles: true }));
    await wait(() => state.maskOpacity === .85 && !element("settings").disabled, "mask commit");
    check(frame.contentDocument.activeElement === element("mask"), "mask must keep keyboard focus after commit");
    lines.push("PASS mask preview, commit and keyboard focus recovery");
    element("apply").click();
    await wait(() => state.selection === null && !element("pause").disabled, "apply");
    element("pause").click();
    await wait(() => !state.active.applied && !element("resume").disabled, "pause");
    element("resume").click();
    await wait(() => state.active.applied && !element("pause").disabled, "resume");
    lines.push("PASS apply, pause and resume");
    failNext = true;
    element("autostart").click();
    await wait(() => !element("settings").disabled && !element("error-box").hidden, "failed setting");
    check(element("autostart").checked === state.autostart, "failed checkbox must restore saved value");
    element("retry").click();
    await wait(() => state.autostart && !element("settings").disabled, "retry");
    lines.push("PASS failed setting rollback and retry");
    state.selection = { ...sample("video"), id: fixtureId };
    await update();
    await wait(() => element("video").readyState >= 1 && !element("apply").disabled, "MP4 metadata");
    check(element("video").paused && !element("video").autoplay, "video must not autoplay");
    check(element("video").videoWidth > 0, "real MP4 must decode metadata");
    lines.push("PASS real MP4 metadata, controls, paused preview");
    state.active = state.selection = null;
    state.needsSetup = true;
    await update();
    check(!element("choose").disabled && element("apply").disabled && element("settings").disabled, "empty setup controls");
    element("choose").click();
    await wait(() => state.selection && !element("apply").disabled && !element("settings").disabled, "first setup media");
    check(!element("connection-hint").hidden, "first setup must explain connection requirements");
    lines.push("PASS empty setup, first media selection, connection requirements");
    state.selection = { ...sample("image"), id: fixtureId };
    state.language = "zh-Hant";
    document.getElementById("width").value = "320";
    document.getElementById("theme").value = "dark";
    document.getElementById("language").value = "zh-Hant";
    await changeHost();
    lines.push(`Initial extra status calls: ${initialCalls}`);
    lines.push("ALL OWN-BROWSER FIXTURE CHECKS PASSED. Official More placement is not tested.");
  } catch (error) { lines.push(`FAIL ${error.message}`); }
  report.textContent = lines.join("\n");
  runButton.disabled = false;
};
