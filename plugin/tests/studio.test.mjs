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
let raw;
const execute = async (file, args, options) => {
  calls.push({ file, args });
  assert.equal(options.env.HOME, home, "Every child uses the explicitly isolated home");
  if (file === "/usr/bin/defaults") {
    assert.deepEqual(args.slice(1, 3), ["com.xskin.studio", "xskin.language"]);
    if (args[0] === "write") language = args[4];
    return { stdout: `${language}\n` };
  }
  if (file === "/usr/bin/osascript") {
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
  if (file === process.execPath) assert.deepEqual(args, [backend, "status"], "Read-only status calls the installed backend directly");
  else {
    assert.equal(file, "/bin/bash");
    assert.equal(args[0], path.join(runtime, "scripts/studio-command-macos.sh"));
    assert.equal(args[1], "--embedded", "In-app mutations keep the existing official session and startup preference");
    const [, , command, value] = args;
    if (command === "import") {
      assert.equal(value, chosen);
      const pending = path.join(stateRoot, "studio", `import-${id}`);
      await fs.mkdir(pending, { recursive: true });
      const selected = path.join(pending, "pending.png");
      await fs.writeFile(selected, image);
      raw.selection = { id, name: path.basename(value), kind: "image", path: selected, bytes: image.length };
    } else if (command === "mask") raw.maskOpacity = Number(value);
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
  assert.ok(first.active.previewUrl.startsWith(`${studio.previewOrigin}/media/`));
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
  assert.equal((await studio.mask(0.27)).maskOpacity, 0.27);
  assert.equal((await studio.autostart(true)).autostartLoaded, true);
  assert.equal((await studio.pause()).active.applied, false);
  const resumed = await studio.resume();
  assert.equal(resumed.active.applied, true, "Resume applies the saved background without requiring a new selection");
  assert.equal(resumed.active.name, first.active.name);
  assert.equal(resumed.selection.id, id, "Resume preserves a separate pending selection instead of applying it");
  assert.equal(resumed.maskOpacity, 0.27);
  assert.equal(resumed.autostart, true, "Resume never changes the automatic apply preference");
  assert.equal((await studio.apply(id)).active.applied, true);
  assert.equal((await studio.status()).selection, null);
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
  release();
  await picking;
  holdPicker = null;
  const cancelled = new AbortController();
  cancelled.abort();
  const beforeCancelled = calls.length;
  await assert.rejects(studio.choose(cancelled.signal), { errorCode: "cancelled" });
  assert.equal(calls.length, beforeCancelled, "An already-cancelled request never launches a picker");
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
  failure = null;
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
  console.log("PASS: Embedded studio preserves native backend semantics, language preferences, pending imports and read-only status without exposing local paths.");
} finally {
  await studio.close();
  await fs.rm(root, { recursive: true, force: true });
}
