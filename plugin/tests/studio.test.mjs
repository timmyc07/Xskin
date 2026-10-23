import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createStudio } from "../studio.mjs";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "xskin-plugin-studio-"));
const home = path.join(root, "使用者 中文 🌙 with spaces");
const runtime = path.join(root, "runtime");
const stateRoot = path.join(home, "Library/Application Support/CodexDreamSkinStudio");
const theme = path.join(stateRoot, "theme");
const backend = path.join(home, ".codex/codex-dream-skin-studio/scripts/background-studio.mjs");
const id = "11111111-2222-4333-8444-555555555555";
await fs.mkdir(runtime, { recursive: true });
await fs.writeFile(path.join(runtime, "VERSION"), "1.8.5\n");
const image = await fs.readFile(new URL("../../macos/assets/portal-hero.png", import.meta.url));
const calls = [];
let language = "ja";
let chosen = "";
let holdPicker;
let pickerSignals = [];
let failure = null;
let recoveryBlocked = false;
let raw;
const execute = async (file, args, options) => {
  calls.push({ file, args });
  assert.equal(options.env.HOME, home, "Every child uses the explicitly isolated home");
  if (file === "/usr/bin/defaults") {
    assert.equal(options.timeout, 5000);
    assert.deepEqual(args.slice(1, 3), ["com.xskin.studio", "xskin.language"]);
    if (args[0] === "write") language = args[4];
    return { stdout: `${language}\n` };
  }
  if (file === "/usr/bin/osascript") {
    assert.equal(options.timeout, 0, "An open native chooser waits for the user or its cancellation signal");
    assert.equal(args[0], "-e");
    assert.match(args[1], /choose file/);
    pickerSignals.push(options.signal);
    if (holdPicker) await new Promise((resolve, reject) => {
      const abort = () => reject(new Error("Fixture picker aborted"));
      options.signal.addEventListener("abort", abort, { once: true });
      holdPicker.then(resolve).finally(() => options.signal.removeEventListener("abort", abort));
    });
    return { stdout: chosen ? `${chosen}\n` : "\n" };
  }
  if (failure) throw Object.assign(new Error("PRIVATE_CHILD_ERROR"), { stdout: failure, stderr: home });
  if (file === process.execPath) {
    assert.deepEqual(args, [backend, "status"], "Read-only status calls the installed backend directly");
    assert.equal(options.timeout, 15000);
  }
  else {
    assert.equal(file, "/bin/bash");
    assert.equal(args[0], path.join(runtime, "scripts/studio-command-macos.sh"));
    assert.equal(args[1], "--embedded", "In-app mutations keep the existing official session and startup preference");
    const [, , command, value] = args;
    assert.equal(options.timeout, command === "apply" || command === "mask" ? 0 : 200000,
      "Only confirmed apply/mask transactions delegate their deadline to the bounded backend");
    if (command === "import") {
      assert.equal(value, chosen);
      const pending = path.join(stateRoot, "studio", `import-${id}`);
      await fs.mkdir(pending, { recursive: true });
      const selected = path.join(pending, "pending.png");
      await fs.writeFile(selected, image);
      raw.selection = { id, name: path.basename(value), kind: "image", path: selected, bytes: image.length };
    } else if (command === "mask") raw.maskOpacity = Number(value);
    else if (command === "status") { if (!recoveryBlocked) raw.pendingRecovery = false; }
    else if (command === "autostart") { raw.autostart = value === "true"; raw.autostartLoaded = raw.autostart; }
    else if (command === "pause") raw.active.applied = false;
    else if (command === "resume") raw.active.applied = true;
    else if (command === "apply") {
      assert.equal(value, raw.selection.id);
      raw.active = { ...raw.active, name: raw.selection.name, applied: true };
      raw.selection = null;
    } else assert.fail(`Unexpected mutation ${command}`);
  }
  return { stdout: JSON.stringify(raw) };
};

const studio = await createStudio(runtime, { home, execute, platform: "darwin" });
try {
  const unconfigured = await studio.status();
  assert.equal(unconfigured.needsSetup, true);
  assert.equal(unconfigured.language, "ja");
  await assert.rejects(studio.resume(), { errorCode: "resume_unavailable" });
  assert.equal(calls.every(call => call.file === "/usr/bin/defaults"), true, "Unconfigured read-only status never installs or recovers an engine");
  await fs.mkdir(path.dirname(backend), { recursive: true });
  await fs.writeFile(backend, "// isolated fake engine\n");
  await fs.mkdir(theme, { recursive: true });
  await fs.writeFile(path.join(theme, "theme.json"), "{}\n");
  const file = path.join(theme, "active.png");
  await fs.writeFile(file, image);
  raw = { version: "1.8.5", active: { name: "原本背景", kind: "image", path: file, bytes: image.length, applied: true },
    selection: null, maskOpacity: 0.62, autostart: false, autostartLoaded: false, pendingRecovery: true };
  const first = await studio.status();
  assert.equal(first.needsSetup, false);
  assert.equal(first.pendingRecovery, true, "Reading pending recovery never invokes the recovery command");
  assert.equal(first.platform, "macos");
  assert.equal(first.active.name, "原本背景");
  assert.equal(first.active.applied, true);
  assert.match(first.active.previewId, /^[a-f0-9]{64}$/);
  assert.equal(first.active.previewMimeType, "image/png");
  assert.equal(first.active.previewError, false);
  assert.doesNotMatch(JSON.stringify(first), /Application Support|\.codex|active\.png|使用者/);
  assert.equal(Object.hasOwn(first.active, "path"), false);
  const mutationsBefore = calls.filter(call => call.file === "/bin/bash").length;
  assert.equal((await studio.choose()).cancelled, true);
  assert.equal(calls.filter(call => call.file === "/bin/bash").length, mutationsBefore, "Cancelling the native picker never imports or applies");
  chosen = path.join(root, "新背景 中文 🌙.png");
  const imported = await studio.choose();
  assert.equal(imported.selection.id, id);
  assert.equal(imported.active.name, first.active.name, "Choosing media only prepares a pending selection");
  assert.equal(imported.selection.name, path.basename(chosen));
  raw.active.applied = false;
  const recoveryState = structuredClone(raw);
  const recoveryCalls = calls.length;
  assert.equal((await studio.status()).pendingRecovery, true);
  assert.equal(calls.slice(recoveryCalls).filter(call => call.file === "/bin/bash").length, 0,
    "Ordinary Refresh never starts recovery");
  recoveryBlocked = true;
  await assert.rejects(studio.recover(), { errorCode: "operation_busy" },
    "A wrapper that cannot acquire the active transaction lock must not report recovery as completed");
  assert.deepEqual(raw, recoveryState);
  recoveryBlocked = false;
  failure = JSON.stringify({ errorCode: "invalid_background", error: home });
  await assert.rejects(studio.recover(), error => error.errorCode === "invalid_background" && !error.message.includes(home));
  assert.deepEqual(raw, recoveryState, "A rejected recovery preserves the saved state and pending selection");
  failure = null;
  const recovered = await studio.recover();
  assert.equal(recovered.pendingRecovery, false);
  assert.equal(recovered.active.applied, false, "Recovery never resumes a paused background");
  assert.equal(recovered.active.name, first.active.name);
  assert.equal(recovered.selection.id, imported.selection.id, "Recovery never applies or discards the pending media");
  assert.equal(recovered.maskOpacity, recoveryState.maskOpacity);
  assert.equal(recovered.autostart, recoveryState.autostart);
  assert.equal(recovered.language, language);
  assert.deepEqual(calls.slice(recoveryCalls).filter(call => call.file === "/bin/bash").map(call => call.args), [0, 1, 2].map(() => [
    path.join(runtime, "scripts/studio-command-macos.sh"), "--embedded", "status",
  ]), "Only explicit recovery uses the existing bounded wrapper status/recover path, never Apply or Resume");
  assert.equal((await studio.mask(0.27)).maskOpacity, 0.27);
  assert.equal((await studio.autostart(true)).autostartLoaded, true);
  assert.equal((await studio.pause()).active.applied, false);
  const resumed = await studio.resume();
  assert.equal(resumed.active.applied, true, "Resume applies the saved background without requiring a new selection");
  assert.equal(resumed.active.name, first.active.name);
  assert.equal(resumed.selection.id, id, "Resume preserves a separate pending selection instead of applying it");
  assert.equal(resumed.maskOpacity, 0.27);
  assert.equal(resumed.autostart, true, "Resume never changes the automatic apply preference");
  const appliedSelection = await studio.apply(id);
  assert.equal(appliedSelection.active.applied, true);
  assert.equal(appliedSelection.appliedSelectionId, id, "Only a confirmed Apply identifies the selection it promoted");
  const afterApply = await studio.status();
  assert.equal(afterApply.selection, null);
  assert.equal(Object.hasOwn(afterApply, "appliedSelectionId"), false, "The successful operation relation is not persisted or inferred by later status reads");
  const peer = await createStudio(runtime, { home, execute, platform: "darwin" });
  try {
    const peerState = await peer.status();
    assert.notEqual(peerState.active.previewId, first.active.previewId, "Separate MCP sessions issue separate preview capabilities");
    await assert.rejects(peer.readMedia(first.active.previewId, 0), { errorCode: "invalid_media" });
    const firstChunk = await studio.readMedia(first.active.previewId, 0);
    assert.equal(firstChunk.offset, 0);
    assert.equal(firstChunk.total, image.length);
    assert.deepEqual(Buffer.from(firstChunk.data, "base64"), image.subarray(0, 512 * 1024));
    const cancelledRead = new AbortController();
    cancelledRead.abort();
    await assert.rejects(studio.readMedia(first.active.previewId, 0, cancelledRead.signal), "Cancelled preview reads never deliver media bytes");
    await peer.close();
    assert.deepEqual(Buffer.from((await studio.readMedia(first.active.previewId, 0)).data, "base64"), image.subarray(0, 512 * 1024),
      "Closing a different MCP session does not revoke this session's media");
  } finally { await peer.close(); }
  await fs.rename(file, `${file}.saved`);
  try {
    const unavailable = await studio.status();
    assert.equal(unavailable.active.name, raw.active.name);
    assert.equal(unavailable.active.previewId, null);
    assert.equal(unavailable.active.previewMimeType, null);
    assert.equal(unavailable.active.previewError, true, "Unavailable optional previews never hide the saved settings");
    const importedWithoutOldPreview = await studio.choose();
    assert.equal(importedWithoutOldPreview.active.previewError, true);
    assert.equal(importedWithoutOldPreview.selection.id, id);
    assert.equal(importedWithoutOldPreview.selection.previewError, false,
      "A new import succeeds even when the previous background cannot be previewed");
    const committedWithoutPreview = await studio.apply(id);
    assert.equal(committedWithoutPreview.active.applied, true);
    assert.equal(committedWithoutPreview.selection, null);
    assert.equal(committedWithoutPreview.active.previewError, true,
      "An already committed apply is not reported as failed because its optional preview is unavailable");
  } finally { await fs.rename(`${file}.saved`, file); }
  const transactionEvents = [];
  const transactionStudio = await createStudio(runtime, { home, platform: "darwin", execute: async (file, args, options) => {
    const name = args[2];
    if (file !== "/bin/bash" || !["apply", "mask"].includes(name)) return execute(file, args, options);
    return new Promise((resolve, reject) => {
      let rollback;
      const forward = setTimeout(() => {
        transactionEvents.push(`${name}:forward-failed`);
        rollback = setTimeout(() => {
          clearTimeout(deadline);
          transactionEvents.push(`${name}:rollback-complete`);
          reject(Object.assign(new Error("Fixture transaction restored"), {
            stdout: JSON.stringify({ errorCode: `${name}_failed_restored` }),
          }));
        }, 120);
      }, 120);
      // Scale the old 200-second adapter deadline to 200 ms around two 120 ms phases.
      const deadline = options.timeout ? setTimeout(() => {
        clearTimeout(forward);
        clearTimeout(rollback);
        transactionEvents.push(`${name}:outer-timeout`);
        reject(new Error("Fixture adapter deadline interrupted rollback"));
      }, options.timeout / 1000) : null;
    });
  } });
  try {
    await assert.rejects(transactionStudio.apply(id), { errorCode: "apply_failed_restored" });
    await assert.rejects(transactionStudio.mask(0.45), { errorCode: "mask_failed_restored" });
    assert.deepEqual(transactionEvents, ["apply:forward-failed", "apply:rollback-complete", "mask:forward-failed", "mask:rollback-complete"],
      "The adapter returns the completed rollback result instead of cutting a confirmed transaction short");
  } finally { await transactionStudio.close(); }
  for (const value of ["en", "zh-Hant", "zh-Hans", "ja"]) assert.equal((await studio.setLanguage(value)).language, value);
  for (const value of [-0.1, 1.01, 0.001, NaN, Infinity, "0.5"]) await assert.rejects(studio.mask(value), { errorCode: "invalid_mask" });
  await assert.rejects(studio.autostart("true"), { errorCode: "invalid_autostart" });
  await assert.rejects(studio.apply("../escape"), { errorCode: "select_media" });
  await assert.rejects(studio.setLanguage("fr"), { errorCode: "invalid_language" });
  let release;
  holdPicker = new Promise(resolve => { release = resolve; });
  chosen = "";
  const picking = studio.choose();
  await assert.rejects(studio.pause(), { errorCode: "operation_busy" });
  await assert.rejects(studio.resume(), { errorCode: "operation_busy" });
  await assert.rejects(studio.recover(), { errorCode: "operation_busy" });
  release();
  await picking;
  holdPicker = null;
  const cancelled = new AbortController();
  cancelled.abort();
  const beforeCancelled = calls.length;
  await assert.rejects(studio.choose(cancelled.signal), { errorCode: "cancelled" });
  assert.equal(calls.length, beforeCancelled, "An already-cancelled request never launches a picker");
  const completionCancellation = new AbortController();
  const completionStudio = await createStudio(runtime, { home, platform: "darwin", execute: async (...args) => {
    const result = await execute(...args);
    if (args[0] === "/usr/bin/osascript") completionCancellation.abort();
    return result;
  } });
  const beforeCompletion = structuredClone(raw);
  const importsBeforeCompletion = calls.filter(call => call.file === "/bin/bash" && call.args[2] === "import").length;
  chosen = path.join(root, "完成時取消的 影片 🌙.mp4");
  try {
    await assert.rejects(completionStudio.choose(completionCancellation.signal), { errorCode: "cancelled" });
    assert.equal(calls.filter(call => call.file === "/bin/bash" && call.args[2] === "import").length, importsBeforeCompletion,
      "Cancellation when the native picker completes must not dispatch an import from its resolved stdout.");
    assert.deepEqual(raw, beforeCompletion, "A picker completion/cancellation race preserves the current and pending media.");
  } finally {
    chosen = "";
    await completionStudio.close();
  }
  const cancellation = new AbortController();
  holdPicker = new Promise(resolve => { release = resolve; });
  const aborted = studio.choose(cancellation.signal);
  cancellation.abort();
  await assert.rejects(aborted, { errorCode: "cancelled" });
  assert.equal(pickerSignals.at(-1).aborted, true, "Request cancellation targets only its owned chooser");
  release();
  holdPicker = null;
  failure = JSON.stringify({ errorCode: "operation_busy", error: home });
  await assert.rejects(studio.pause(), error => error.errorCode === "operation_busy" && !error.message.includes(home));
  failure = "PRIVATE_CHILD_STDOUT";
  await assert.rejects(studio.pause(), error => error.errorCode === "operation_failed" && !error.message.includes("PRIVATE_CHILD"));
  await assert.rejects(studio.status(), error => error.errorCode === "operation_failed" && !error.message.includes("PRIVATE_CHILD"),
    "A failing status with no intervening mutation preserves its safe backend error");
  failure = JSON.stringify({ errorCode: "invalid_background", error: home });
  await assert.rejects(studio.status(), error => error.errorCode === "invalid_background" && !error.message.includes(home));
  failure = null;
  const validRaw = raw;
  raw = null;
  try { await assert.rejects(studio.status(), { errorCode: "invalid_response" }); }
  finally { raw = validRaw; }
  for (const stage of ["beforeMutation", "duringMutation", "afterApproval", "commandFailure", "invalidResponse"]) {
    const duringMutation = stage === "duringMutation";
    let releaseOldStatus;
    const oldStatusHeld = new Promise(resolve => { releaseOldStatus = resolve; });
    let statusStarted;
    const oldStatusStarted = new Promise(resolve => { statusStarted = resolve; });
    let statusReads = 0;
    let releaseCommit;
    const commitHeld = new Promise(resolve => { releaseCommit = resolve; });
    let applyStarted;
    const applyStart = new Promise(resolve => { applyStarted = resolve; });
    let releaseLanguage;
    const languageHeld = new Promise(resolve => { releaseLanguage = resolve; });
    let languageStarted;
    const languageStart = new Promise(resolve => { languageStarted = resolve; });
    let holdLanguage = duringMutation || stage === "afterApproval";
    const pendingPath = path.join(stateRoot, "studio", `import-${id}`, "pending.png");
    await fs.mkdir(path.dirname(pendingPath), { recursive: true });
    await fs.writeFile(pendingPath, image);
    const raceRaw = { ...structuredClone(raw), selection: { id, name: "新背景", kind: "image", path: pendingPath, bytes: image.length } };
    const raceStudio = await createStudio(runtime, { home, platform: "darwin", execute: async (file, args) => {
      if (file === "/usr/bin/defaults") {
        if (holdLanguage) { holdLanguage = false; languageStarted(); await languageHeld; }
        return { stdout: "ja\n" };
      }
      if (file === process.execPath) {
        const stdout = JSON.stringify(raceRaw);
        if (++statusReads === 1) {
          statusStarted();
          if (stage !== "afterApproval") await oldStatusHeld;
          if (stage === "commandFailure") throw Object.assign(new Error("PRIVATE_FIXTURE_ERROR"), {
            stdout: JSON.stringify({ errorCode: "invalid_background" }), stderr: home,
          });
          if (stage === "invalidResponse") return { stdout: "PRIVATE_INVALID_JSON" };
        }
        return { stdout };
      }
      assert.equal(file, "/bin/bash");
      assert.deepEqual(args.slice(1), ["--embedded", "apply", id]);
      applyStarted();
      if (duringMutation) await commitHeld;
      const appliedPath = path.join(theme, "promoted.png");
      await fs.copyFile(pendingPath, appliedPath);
      raceRaw.active = { ...raceRaw.selection, path: appliedPath, applied: true };
      raceRaw.selection = null;
      await fs.rm(path.dirname(pendingPath), { recursive: true });
      return { stdout: JSON.stringify(raceRaw) };
    } });
    try {
      let applying;
      if (duringMutation) { applying = raceStudio.apply(id); await applyStart; }
      const oldStatus = raceStudio.status();
      await oldStatusStarted;
      let applied;
      if (duringMutation) { releaseCommit(); await languageStart; }
      else {
        if (stage === "afterApproval") await languageStart;
        applied = await raceStudio.apply(id);
        releaseLanguage();
      }
      releaseOldStatus();
      const refreshed = await oldStatus;
      if (duringMutation) { releaseLanguage(); applied = await applying; }
      assert.equal(refreshed.active.previewId, applied.active.previewId,
        `${stage}: a delayed status must not publish stale media or revoke a newer Apply capability`);
      assert.equal(refreshed.selection, null);
      assert.equal(applied.appliedSelectionId, id);
      assert.equal(Object.hasOwn(refreshed, "appliedSelectionId"), false);
      assert.equal(statusReads, 2, "A stale read refreshes the committed state instead of publishing its former snapshot");
      assert.deepEqual(Buffer.from((await raceStudio.readMedia(applied.active.previewId, 0)).data, "base64"), image.subarray(0, 512 * 1024));
    } finally {
      releaseOldStatus();
      releaseCommit();
      releaseLanguage();
      await raceStudio.close();
    }
  }
  let repeatedReads = 0;
  let changeDuringRead = true;
  const changingStudio = await createStudio(runtime, { home, platform: "darwin", execute: async (file, args) => {
    if (file === "/usr/bin/defaults") return { stdout: "ja\n" };
    if (file === process.execPath) {
      repeatedReads += 1;
      if (changeDuringRead) await changingStudio.mask(0.31);
    } else assert.deepEqual(args.slice(1), ["--embedded", "mask", "0.31"]);
    return { stdout: JSON.stringify(raw) };
  } });
  try {
    await assert.rejects(changingStudio.status(), { errorCode: "operation_busy" });
    assert.equal(repeatedReads, 2, "A second overlapping change returns busy instead of retrying indefinitely");
    changeDuringRead = false;
    assert.equal((await changingStudio.status()).active.name, raw.active.name);
  } finally { await changingStudio.close(); }
  holdPicker = new Promise(resolve => { release = resolve; });
  const closingPicker = studio.choose();
  const pickerRejected = assert.rejects(closingPicker, { errorCode: "cancelled" });
  await studio.close();
  await pickerRejected;
  assert.equal(pickerSignals.at(-1).aborted, true, "Closing the studio cancels its pending chooser without touching engine processes");
  release();
  holdPicker = null;
  await studio.close();
  await assert.rejects(studio.status(), { errorCode: "closed" });
  await assert.rejects(studio.recover(), { errorCode: "closed" });
  console.log("PASS: Embedded studio preserves native backend semantics, language preferences, pending imports and read-only status without exposing local paths.");
} finally {
  await studio.close();
  await fs.rm(root, { recursive: true, force: true });
}
