import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createStudio } from "../studio.mjs";
import { PREVIEW_CHUNK_BYTES } from "../media-preview.mjs";

const selectionId = "11111111222243338444555555555555";
const publicId = "11111111-2222-4333-8444-555555555555";
const image = await fs.readFile(new URL("../../macos/assets/portal-hero.png", import.meta.url));
const video = Buffer.alloc(PREVIEW_CHUNK_BYTES * 2 + 37, 73);
Buffer.from("000000186674797069736f6d0000000069736f6d6d703432", "hex").copy(video);

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "xskin-windows-studio-"));
  const home = path.join(root, "使用者 中文 🌙");
  const runtime = path.join(root, "runtime 中文 🌙");
  const stateRoot = path.join(home, "CodexDreamSkin");
  const active = path.join(stateRoot, "active-theme");
  const source = path.join(root, "原始 中文 🌙 $& '; 影片.mp4");
  await fs.mkdir(runtime, { recursive: true });
  await fs.mkdir(active, { recursive: true });
  await fs.writeFile(path.join(runtime, "VERSION"), "1.9.4\n");
  await fs.writeFile(path.join(active, "initial.png"), image);
  await fs.writeFile(source, video);
  let raw = { stateRoot, version: "1.9.4", activeImagePath: path.join(active, "initial.png"),
    activeVideoPath: null, activeBytes: image.length, activeName: "原本背景 🌙", applied: true,
    pending: false, selectionId: null, imagePath: null, videoPath: null, bytes: 0, name: null,
    maskOpacity: 0.62, autostart: false, autostartLoaded: false, pendingRecovery: true,
    language: "ja", needsSetup: false };
  const calls = [];
  const controls = { chosen: source, failure: null, pickerFailure: null, holdPicker: false,
    pickerSignal: null, pickerStarted: null, releasePicker: null };
  const execute = async (file, args, options) => {
    assert.equal(path.basename(file).toLowerCase(), "powershell.exe");
    assert.equal(options.env.HOME, home);
    assert.equal(options.env.PSModulePath, path.join(path.dirname(file), "Modules"),
      "The fixed Windows PowerShell child must not load incompatible inherited PowerShell 7 modules");
    assert.equal(options.windowsHide, true, "Native commands must not open a console window");
    assert.deepEqual(args.slice(0, 7), ["-NoProfile", "-NonInteractive", "-Sta", "-ExecutionPolicy", "Bypass", "-File",
      path.join(runtime, "scripts", args[6].endsWith("choose-media.ps1") ? "choose-media.ps1" : "xskin-command.ps1")]);
    if (args[6].endsWith("choose-media.ps1")) {
      assert.equal(options.timeout, 0);
      controls.pickerSignal = options.signal;
      controls.pickerStarted?.();
      if (controls.pickerFailure) throw controls.pickerFailure;
      if (controls.holdPicker) await new Promise((resolve, reject) => {
        controls.releasePicker = resolve;
        const abort = () => reject(new Error(`PRIVATE_PICKER_ABORT ${home}`));
        options.signal.addEventListener("abort", abort, { once: true });
      });
      return { stdout: JSON.stringify(controls.chosen) };
    }
    assert.equal(args[7], "-Embedded", "In-app operations may only use the existing embedded backend");
    const action = args[args.indexOf("-Action") + 1];
    const requestPath = args[args.indexOf("-RequestPath") + 1];
    const request = JSON.parse(await fs.readFile(requestPath, "utf8"));
    if (args.includes("-StateRoot")) assert.equal(args[args.indexOf("-StateRoot") + 1], stateRoot,
      "Every operation keeps the initial canonical state root");
    const call = { action, request, requestPath, timeout: options.timeout };
    calls.push(call);
    if (controls.failure) return { stdout: `PRIVATE_LOG ${home}\nXSKIN_RESULT:${JSON.stringify({ ok: false,
      errorCode: controls.failure, message: home })}\n` };
    if (action === "import") {
      assert.deepEqual(request, { path: controls.chosen }, "Unicode and shell metacharacters travel in JSON, never shell code");
      const pending = path.join(stateRoot, "imports", selectionId);
      await fs.mkdir(pending, { recursive: true });
      const pendingVideo = path.join(pending, "pending.mp4");
      const pendingImage = path.join(pending, "poster.png");
      await fs.copyFile(request.path, pendingVideo);
      await fs.writeFile(pendingImage, image);
      raw = { ...raw, pending: true, selectionId, imagePath: pendingImage, videoPath: pendingVideo,
        bytes: video.length, name: path.basename(request.path) };
    } else if (action === "apply") {
      assert.deepEqual(request, { selectionId, imagePath: raw.imagePath, maskOpacity: raw.maskOpacity });
      const applied = path.join(active, "applied.mp4");
      await fs.copyFile(raw.videoPath, applied);
      raw = { ...raw, activeVideoPath: applied, activeBytes: raw.bytes, activeName: raw.name,
        applied: true, pending: false, selectionId: null, imagePath: null, videoPath: null };
      await fs.rm(path.join(stateRoot, "imports", selectionId), { recursive: true });
    } else if (action === "mask") raw.maskOpacity = request.maskOpacity;
    else if (action === "preferences") raw.language = request.language;
    else if (action === "autostart") raw.autostart = raw.autostartLoaded = request.enabled;
    else if (action === "pause") raw.applied = false;
    else if (action === "resume") raw.applied = true;
    else if (action === "recover") raw.pendingRecovery = false;
    else assert.equal(action, "status", "No launch, install or official process control is available in this adapter");
    return { stdout: `PRIVATE_LOG ${home}\r\nXSKIN_RESULT:${JSON.stringify({ ok: true, state: raw })}\r\n` };
  };
  const studio = await createStudio(runtime, { home, execute, platform: "win32" });
  t.after(async () => {
    controls.releasePicker?.();
    await studio.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const safe = value => {
    assert.doesNotMatch(JSON.stringify(value), /PRIVATE|xskin-windows-studio-|CodexDreamSkin|request\.json/);
    return value;
  };
  const rejectSafe = (operation, errorCode) => assert.rejects(operation, error => {
    assert.equal(error.errorCode, errorCode);
    safe({ message: error.message });
    return true;
  });
  const cleaned = async () => {
    for (const call of calls) await assert.rejects(fs.access(call.requestPath), { code: "ENOENT" });
  };
  return { studio, calls, controls, root, home, runtime, stateRoot, source, safe, rejectSafe, cleaned,
    get raw() { return raw; }, set raw(value) { raw = value; } };
}

test("Windows studio keeps status read-only and privately imports, streams and applies original Unicode media", async t => {
  const f = await fixture(t);
  const initial = f.safe(await f.studio.status());
  assert.equal(initial.platform, "windows");
  assert.equal(initial.language, "ja");
  assert.equal(initial.pendingRecovery, true);
  assert.equal(initial.active.previewMimeType, "image/png");
  assert.equal(f.calls.every(call => call.action === "status"), true);
  const imported = f.safe(await f.studio.choose());
  assert.equal(imported.selection.id, publicId);
  assert.equal(imported.selection.name, path.basename(f.source));
  assert.equal(imported.selection.previewMimeType, "video/mp4");
  assert.equal(imported.selection.previewError, false);
  assert.deepEqual(imported.active, initial.active, "Pending imports cannot replace the active background");
  const chunks = [];
  for (let offset = 0; offset < video.length; offset += PREVIEW_CHUNK_BYTES) {
    const chunk = f.safe(await f.studio.readMedia(imported.selection.previewId, offset));
    const bytes = Buffer.from(chunk.data, "base64");
    assert.equal(bytes.length, Math.min(PREVIEW_CHUNK_BYTES, video.length - offset));
    chunks.push(bytes);
  }
  assert.deepEqual(Buffer.concat(chunks), video);
  assert.deepEqual(await f.studio.status(), imported, "Unchanged status keeps the same private capabilities");
  const mutationCount = f.calls.filter(call => call.action !== "status").length;
  await f.rejectSafe(f.studio.apply("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"), "select_media");
  assert.equal(f.calls.filter(call => call.action !== "status").length, mutationCount,
    "A mismatched pending ID must fail before any Apply mutation");
  const applied = f.safe(await f.studio.apply(publicId));
  assert.equal(applied.appliedSelectionId, publicId);
  assert.equal(applied.selection, null);
  assert.equal(applied.active.name, path.basename(f.source));
  assert.notEqual(applied.active.previewId, imported.selection.previewId);
  await f.rejectSafe(f.studio.readMedia(imported.selection.previewId, 0), "invalid_media");
  assert.deepEqual(Buffer.from((await f.studio.readMedia(applied.active.previewId, 0)).data, "base64"),
    video.subarray(0, PREVIEW_CHUNK_BYTES));
  assert.equal(f.calls.find(call => call.action === "apply").timeout, 0);
  assert.equal((await f.studio.mask(0.31)).maskOpacity, 0.31);
  assert.equal(f.calls.find(call => call.action === "mask").timeout, 0);
  for (const invalid of [-0.01, 1.01, 0.125, NaN]) await f.rejectSafe(f.studio.mask(invalid), "invalid_mask");
  assert.equal((await f.studio.setLanguage("zh-Hant")).language, "zh-Hant");
  assert.equal((await f.studio.autostart(true)).autostart, true);
  assert.equal((await f.studio.pause()).active.applied, false);
  assert.equal((await f.studio.resume()).active.applied, true);
  assert.equal((await f.studio.recover()).pendingRecovery, false);
  await f.cleaned();
});

test("Windows studio initializes on demand and recovers from a busy or failed first status", async t => {
  const f = await fixture(t);
  assert.deepEqual(f.calls, [], "Creating the studio must not depend on a backend command or its operation lock");
  await f.rejectSafe(f.studio.readMedia("a".repeat(64), 0), "invalid_media");
  assert.deepEqual(f.calls, [], "An unknown media capability cannot initialize or read the backend");
  for (const [failure, code] of [["operationBusy", "operation_busy"], ["PRIVATE_TEMPORARY", "operation_failed"]]) {
    f.controls.failure = failure;
    await f.rejectSafe(f.studio.status(), code);
  }
  f.controls.failure = null;
  const statuses = await Promise.all([f.studio.status(), f.studio.status()]);
  assert.deepEqual(statuses[0], statuses[1], "Concurrent first statuses share a single media-capability store");
  assert.equal(statuses[0].active.previewError, false);
  assert.deepEqual(Buffer.from((await f.studio.readMedia(statuses[0].active.previewId, 0)).data, "base64"),
    image.subarray(0, PREVIEW_CHUNK_BYTES));
  await f.cleaned();
});

test("closing a Windows studio before initialization performs no backend request", async t => {
  const f = await fixture(t);
  await f.studio.close();
  await f.studio.close();
  assert.deepEqual(f.calls, []);
  await f.rejectSafe(f.studio.status(), "closed");
  await f.rejectSafe(f.studio.choose(), "closed");
  await f.rejectSafe(f.studio.readMedia("a".repeat(64), 0), "invalid_media");
  assert.deepEqual(f.calls, []);
});

test("Windows chooser cancellation preserves pending media and rejects late picker results", async t => {
  const f = await fixture(t);
  const imported = await f.studio.choose();
  const imports = () => f.calls.filter(call => call.action === "import").length;
  f.controls.chosen = "";
  const cancelled = await f.studio.choose();
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.selection.id, imported.selection.id);
  assert.equal(imports(), 1);
  const alreadyCancelled = new AbortController();
  alreadyCancelled.abort();
  await f.rejectSafe(f.studio.choose(alreadyCancelled.signal), "cancelled");
  f.controls.chosen = f.source;
  f.controls.holdPicker = true;
  const started = new Promise(resolve => { f.controls.pickerStarted = resolve; });
  const controller = new AbortController();
  const pending = f.rejectSafe(f.studio.choose(controller.signal), "cancelled");
  await started;
  await f.rejectSafe(f.studio.mask(0.31), "operation_busy");
  controller.abort();
  await pending;
  f.controls.releasePicker();
  assert.equal(f.controls.pickerSignal.aborted, true);
  assert.equal(imports(), 1);
  assert.equal((await f.studio.status()).selection.id, imported.selection.id);
  f.controls.holdPicker = false;
  f.controls.pickerStarted = null;
  f.controls.chosen = "";
  assert.equal((await f.studio.choose()).cancelled, true, "A cancelled picker releases the mutation lock");
  await f.cleaned();
});

test("Windows bridge maps private backend and chooser failures to public codes", async t => {
  const f = await fixture(t);
  for (const [backend, publicCode] of [["fileAccessDenied", "file_access_denied"],
    ["imageConversion", "image_conversion"], ["imageSizeLimit", "image_size_limit"],
    ["videoSizeLimit", "video_size_limit"], ["applyFailedRestored", "apply_failed_restored"],
    ["PRIVATE_UNKNOWN", "operation_failed"]]) {
    f.controls.failure = backend;
    await f.rejectSafe(f.studio.status(), publicCode);
  }
  f.controls.failure = null;
  f.controls.pickerFailure = new Error(`PRIVATE_CHOOSER ${f.home}`);
  await f.rejectSafe(f.studio.choose(), "operation_failed");
  f.controls.pickerFailure = null;
  f.controls.chosen = "relative.mp4";
  await f.rejectSafe(f.studio.choose(), "invalid_local_file");
  f.controls.chosen = path.join(f.root, "embedded\nnewline.mp4");
  await f.rejectSafe(f.studio.choose(), "invalid_local_file");
  assert.equal(f.calls.some(call => call.action === "import"), false);
  await f.cleaned();
});

test("a rejected Windows state root cannot redirect a later backend operation", async t => {
  const f = await fixture(t);
  await f.studio.status();
  f.raw = { ...f.raw, stateRoot: path.join(f.root, "unrelated-private-folder") };
  await f.rejectSafe(f.studio.status(), "invalid_setup");
  f.raw = { ...f.raw, stateRoot: f.stateRoot };
  assert.equal((await f.studio.status()).platform, "windows");
  await f.cleaned();
});

test("Windows previews require exact canonical active and pending roots without reading rejected paths", async t => {
  const f = await fixture(t);
  const initial = await f.studio.status();
  await f.studio.choose();
  const valid = structuredClone(f.raw);
  const lstat = fs.lstat;
  const inspected = [];
  fs.lstat = async (filename, ...args) => { inspected.push(filename); return lstat(filename, ...args); };
  try {
    for (const activeVideoPath of [f.source,
      path.join(f.stateRoot, "ACTIVE-THEME", "applied.mp4"),
      path.join(f.stateRoot, "active-theme-extra", "applied.mp4")]) {
      f.raw = { ...valid, activeVideoPath, activeBytes: video.length };
      const status = f.safe(await f.studio.status());
      assert.equal(status.active.previewId, null);
      assert.equal(status.active.previewError, true);
      assert.equal(inspected.includes(activeVideoPath), false,
        "A path outside the exact approved active root must fail before any media filesystem access");
    }
    const wrongPending = path.join(f.stateRoot, "imports", "a".repeat(32), "pending.mp4");
    f.raw = { ...valid, videoPath: wrongPending };
    const wrongSelection = f.safe(await f.studio.status());
    assert.equal(wrongSelection.selection.previewError, true);
    assert.equal(inspected.includes(wrongPending), false, "A selection may read only its own exact import ID");
  } finally { fs.lstat = lstat; }
  f.raw = valid;
  const restored = await f.studio.status();
  assert.equal(restored.active.name, initial.active.name);
  assert.equal(restored.active.previewError, false);
  assert.equal(restored.selection.previewError, false);
  f.raw = { ...valid, language: `PRIVATE_LANGUAGE ${f.home}` };
  assert.equal(f.safe(await f.studio.status()).language, "en", "Unknown backend languages use the same safe default as macOS");
  await f.cleaned();
});

test("Windows media capabilities reject a junction replacing their approved media directory", async t => {
  const f = await fixture(t);
  const initial = await f.studio.status();
  const active = path.join(f.stateRoot, "active-theme");
  const foreign = path.join(f.root, "foreign-media");
  await fs.mkdir(foreign);
  await fs.writeFile(path.join(foreign, "initial.png"), image);
  await fs.rename(active, path.join(f.stateRoot, "retained-theme"));
  await fs.symlink(foreign, active, process.platform === "win32" ? "junction" : "dir");
  const rejected = f.safe(await f.studio.status());
  assert.equal(rejected.active.previewError, true);
  assert.equal(rejected.active.previewId, null);
  await f.rejectSafe(f.studio.readMedia(initial.active.previewId, 0), "invalid_media");
});

test("adding Windows support preserves the macOS read-only setup path", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "xskin-mac-studio-"));
  await fs.writeFile(path.join(directory, "VERSION"), "1.9.4\n");
  const calls = [];
  const studio = await createStudio(directory, { home: path.join(directory, "home"), platform: "darwin",
    execute: async (file, args) => { calls.push({ file, args }); return { stdout: "zh-Hant\n" }; } });
  t.after(async () => { await studio.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const status = await studio.status();
  assert.equal(status.platform, "macos");
  assert.equal(status.needsSetup, true);
  assert.equal(status.language, "zh-Hant");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, "/usr/bin/defaults");
});
