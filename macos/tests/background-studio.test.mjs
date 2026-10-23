import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile, execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { readImageMetadata } from "../scripts/image-metadata.mjs";
import { loadTheme } from "../scripts/injector.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "dream-skin-studio-test-"));
const home = path.join(temporary, "家目錄 中文 🌙 with spaces");
const engine = path.join(temporary, "engine");
const state = path.join(home, "Library/Application Support/CodexDreamSkinStudio");
const theme = path.join(state, "theme");
const studio = path.join(state, "studio");
const configPath = path.join(theme, "theme.json");
const transactionPath = path.join(theme, ".studio-transaction.json");
const entry = path.join(engine, "scripts/background-studio.mjs");
const environment = { ...process.env, HOME: home };
const execute = promisify(execFile);
const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const stages = async () => (await fs.readdir(studio)).filter((name) => name.startsWith("import-"));
let blocked;

async function call(...args) {
  try {
    const result = await execute(process.execPath, [entry, ...args], { env: environment, timeout: 30000 });
    assert.equal(result.stderr, "", "The native backend must not leak child output");
    return { code: 0, value: JSON.parse(result.stdout) };
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    assert.equal(error.stderr, "", "Failures return only a structured English error");
    return { code: error.code, value: JSON.parse(error.stdout) };
  }
}

async function success(...args) {
  const result = await call(...args);
  assert.equal(result.code, 0, JSON.stringify(result.value));
  const messageCode = { import: "imported", apply: "applied", mask: "mask_updated", pause: "paused", resume: "resumed", autostart: args[1] === "true" ? "autostart_enabled" : "autostart_disabled" }[args[0]];
  if (messageCode) {
    assert.equal(result.value.messageCode, messageCode);
    assert.match(result.value.message, /^[\x20-\x7e]+$/u, "Successful operations have English default messages");
  }
  return result.value;
}

async function rejects(args, errorCode) {
  const result = await call(...args);
  assert.equal(result.code, 1);
  assert.equal(result.value.errorCode, errorCode);
  assert.match(result.value.error, /^[\x20-\x7e]+$/u, "Failures have English default messages");
  assert.doesNotMatch(JSON.stringify(result.value), /PRIVATE_CHILD_(?:STDOUT|STDERR)/u, "Failures must not reveal internal child output");
  assert.deepEqual(Object.keys(result.value), ["error", "errorCode"]);
}

try {
  await fs.mkdir(theme, { recursive: true });
  await fs.cp(path.join(root, "scripts"), path.join(engine, "scripts"), { recursive: true });
  // Replace every runtime mutation before starting the native CLI.
  await fs.writeFile(path.join(engine, "scripts/status-dream-skin-macos.sh"), '#!/bin/bash\nprintf \'{"session":"active"}\\n\'\n');
  await fs.writeFile(path.join(engine, "scripts/pause-dream-skin-macos.sh"), '#!/bin/bash\nprintf "pause\\n" >> "$HOME/pause-calls"\n');
  await fs.writeFile(path.join(engine, "scripts/start-dream-skin-macos.sh"), `#!/bin/bash
set -eu
printf '%s\\n' "$*" >> "$HOME/start-calls"
if [ -f "$HOME/fail-next-apply" ]; then
  /bin/rm "$HOME/fail-next-apply"
  printf 'PRIVATE_CHILD_STDOUT\\n'
  printf 'PRIVATE_CHILD_STDERR\\n' >&2
  exit 1
fi
if [ -f "$HOME/block-apply" ]; then
  printf '%s' "$PPID" > "$HOME/apply-worker"
  : > "$HOME/apply-started"
  while [ -f "$HOME/block-apply" ]; do /bin/sleep 0.05; done
fi
`);
  await fs.writeFile(path.join(engine, "scripts/autostart-dream-skin-macos.sh"), `#!/bin/bash
set -eu
if [ -f "$HOME/fail-autostart" ]; then
  printf 'PRIVATE_CHILD_STDOUT\\n'
  printf 'PRIVATE_CHILD_STDERR\\n' >&2
  exit 1
fi
case "$1" in
  enable) : > "$HOME/autostart-enabled" ;;
  disable) /bin/rm -f "$HOME/autostart-enabled" ;;
  status)
    if [ -f "$HOME/autostart-enabled" ]; then
      printf 'enabled=true\\nloaded=true\\n'
    else
      printf 'enabled=false\\nloaded=false\\n'
    fi
    ;;
  *) exit 1 ;;
esac
`);
  const image = await fs.readFile(path.join(root, "assets/portal-hero.png"));
  const source = path.join(temporary, "測試桌布.png");
  await fs.writeFile(source, image);
  const initial = { schemaVersion: 1, id: "studio-fixture", name: "原本背景", image: "initial.png" };
  await fs.writeFile(path.join(theme, initial.image), image);
  await fs.writeFile(configPath, JSON.stringify(initial));
  await assert.rejects(loadTheme(theme, "../escape.json"), /Theme config must be a filename/u);
  const initialStatus = await success("status");
  assert.equal(initialStatus.version, "1.9.1");
  assert.equal(initialStatus.active.path, path.join(theme, initial.image));
  assert.equal(initialStatus.active.applied, true);
  assert.equal(initialStatus.selection, null);
  assert.equal(initialStatus.autostart, false);
  assert.equal(initialStatus.autostartLoaded, false);
  assert.equal(initialStatus.maskOpacity, 0.62, "Existing themes use the default full-window mask");
  await fs.writeFile(configPath, JSON.stringify({ ...initial, maskOpacity: 0.37 }));
  assert.equal((await success("status")).maskOpacity, 0.37, "Status returns a saved mask value");
  await fs.writeFile(configPath, JSON.stringify(initial));

  await rejects(["import", "relative.png"], "invalid_local_file");
  await rejects(["apply", "missing"], "select_media");
  await rejects(["autostart", "yes"], "invalid_autostart");
  await rejects(["status", "extra"], "invalid_command");
  await rejects(["recover", "extra"], "invalid_command");
  await rejects(["pause", "extra"], "invalid_command");
  await rejects(["resume", "extra"], "invalid_command");
  assert.equal((await success("pause")).active.path, initialStatus.active.path);
  assert.equal(await fs.readFile(path.join(home, "pause-calls"), "utf8"), "pause\n");
  assert.deepEqual(await readJson(configPath), initial, "Pausing never rewrites the saved theme or starts Codex");
  await assert.rejects(fs.access(path.join(home, "start-calls")), { code: "ENOENT" });
  assert.equal((await success("recover")).recovered, false);
  await rejects(["--locked-worker", "autostart", "true"], "invalid_worker");
  for (const value of [undefined, "", "-0.1", "1.01", "0.001", "NaN", "Infinity", "-Infinity", "1e-2", "0x1", " 0.5", ".5"]) {
    await rejects(["mask", ...(value === undefined ? [] : [value])], "invalid_mask");
  }
  await rejects(["mask", "0.5", "extra"], "invalid_command");
  await rejects(["--locked-worker", "mask", "0.5"], "invalid_worker");
  const symlink = path.join(temporary, "連結.png");
  await fs.symlink(source, symlink);
  await rejects(["import", symlink], "invalid_local_file");
  const invalid = path.join(temporary, "broken.png");
  await fs.writeFile(invalid, "not an image");
  await rejects(["import", invalid], "invalid_image");
  const wrong = path.join(temporary, "wrong.txt");
  await fs.writeFile(wrong, image);
  await rejects(["import", wrong], "unsupported_format");
  const oversized = path.join(temporary, "oversized.png");
  const handle = await fs.open(oversized, "w");
  await handle.truncate(50 * 1024 * 1024 + 1);
  await handle.close();
  await rejects(["import", oversized], "image_size_limit");
  const brokenVideo = path.join(temporary, "broken.mp4");
  await fs.writeFile(brokenVideo, "not an MP4 container");
  await rejects(["import", brokenVideo], "invalid_video");
  const oversizedVideo = path.join(temporary, "oversized.mp4");
  const videoHandle = await fs.open(oversizedVideo, "w");
  await videoHandle.truncate(256 * 1024 * 1024 + 1);
  await videoHandle.close();
  await rejects(["import", oversizedVideo], "video_size_limit");
  assert.deepEqual(await readJson(configPath), initial);
  assert.deepEqual(await stages(), []);

  const largeImage = path.join(temporary, "large.png");
  execFileSync("/usr/bin/sips", ["-z", "2", "4097", source, "--out", largeImage], { stdio: "ignore" });
  const large = await success("import", largeImage);
  assert.equal(readImageMetadata(await fs.readFile(large.selection.path), ".jpg").width, 4096, "Large images are capped at 4096 pixels");
  const namedSource = path.join(temporary, `${"長".repeat(30)} ${"n".repeat(70)} 🌙.png`);
  await fs.copyFile(source, namedSource);
  const named = await success("import", namedSource);
  assert.equal(named.selection.name, path.basename(namedSource));
  assert.equal((await readJson(path.join(path.dirname(named.selection.path), "theme.json"))).name, path.basename(namedSource),
    "Stored display names retain the complete original basename, independently of generated media filenames");
  const imported = await success("import", source);
  assert.equal(imported.selection.kind, "image");
  assert.equal(imported.selection.name, path.basename(source));
  const preview = await fs.readFile(imported.selection.path);
  assert.equal(imported.selection.bytes, preview.length);
  assert.deepEqual(readImageMetadata(preview, ".jpg"), readImageMetadata(image, ".png"), "Small images must not be upscaled");
  assert.deepEqual(await readJson(configPath), initial, "Import must never apply a background");
  await assert.rejects(fs.access(path.join(home, "start-calls")), { code: "ENOENT" });
  assert.deepEqual((await success("status")).selection, imported.selection, "Pending imports survive a completely new CLI process");
  await rejects(["apply", named.selection.id], "select_media");
  assert.deepEqual((await success("status")).selection, imported.selection, "A replaced import from an older session cannot apply or remove the newer pending media");
  await rejects(["import", invalid], "invalid_image");
  assert.deepEqual((await success("status")).selection, imported.selection, "A failed replacement import keeps the existing pending media available for retry");
  assert.deepEqual(await stages(), [`import-${imported.selection.id}`]);
  await rejects(["apply", "wrong-id"], "select_media");
  const imageApplied = await success("apply", imported.selection.id);
  assert.equal(imageApplied.selection, null);
  assert.equal(imageApplied.active.kind, "image");
  assert.equal(imageApplied.active.name, path.basename(source), "Applying preserves the original file label and extension rather than a generated UUID");
  assert.deepEqual(await fs.readFile(imageApplied.active.path), preview);
  assert.equal((await readJson(configPath)).layout, "wallpaper");
  assert.deepEqual(await stages(), []);
  assert.equal(await fs.readFile(path.join(home, "start-calls"), "utf8"), "\n");
  for (const value of ["0", "1.00", "0.43"]) {
    const masked = await success("mask", value);
    assert.equal(masked.maskOpacity, Number(value));
    assert.equal(masked.active.path, imageApplied.active.path, "Changing the mask preserves the active media");
    assert.equal(masked.selection, null);
    assert.equal((await readJson(configPath)).maskOpacity, Number(value));
  }

  // This fixture proves byte preservation; a live test must prove 4K decoding.
  const mp4 = Buffer.from("000000186674797069736f6d0000020069736f6d6d703431", "hex");
  const largeVideoSource = path.join(temporary, "96 MiB 原始影片 🌙.mp4");
  const largeVideoFile = await fs.open(largeVideoSource, "wx");
  await largeVideoFile.write(mp4);
  await largeVideoFile.truncate(96 * 1024 * 1024);
  await largeVideoFile.close();
  const largeVideo = await success("import", largeVideoSource);
  assert.equal(largeVideo.selection.bytes, 96 * 1024 * 1024, "A 96 MiB original MP4 is accepted without a smaller preview-size limit");
  assert.equal((await fs.stat(largeVideo.selection.path)).size, 96 * 1024 * 1024);
  assert.equal(largeVideo.selection.name, path.basename(largeVideoSource));
  assert.deepEqual((await success("status")).selection, largeVideo.selection, "Large pending video survives a new backend process");
  assert.equal((await readJson(configPath)).video, undefined, "A large video import remains pending without changing the current image");
  const videoSource = path.join(temporary, "4K 原始影片.mp4");
  await fs.writeFile(videoSource, mp4);
  const video = await success("import", videoSource);
  assert.equal(video.selection.kind, "video");
  assert.equal(video.selection.bytes, mp4.length);
  assert.deepEqual(await fs.readFile(video.selection.path), mp4);
  assert.equal((await readJson(configPath)).video, undefined, "A video import does not replace the current image");
  const stagedConfigPath = path.join(path.dirname(video.selection.path), "theme.json");
  assert.equal((await readJson(stagedConfigPath)).maskOpacity, 0.43);
  const adjusted = await success("mask", "0.27");
  assert.equal(adjusted.maskOpacity, 0.27);
  assert.equal(adjusted.active.path, imageApplied.active.path, "A mask change never applies pending media");
  assert.deepEqual(adjusted.selection, video.selection, "A mask change preserves the pending import");
  assert.equal((await readJson(stagedConfigPath)).maskOpacity, 0.43, "A mask change does not rewrite pending media settings");
  const videoApplied = await success("apply", video.selection.id);
  assert.equal(videoApplied.active.kind, "video");
  assert.equal(videoApplied.active.name, path.basename(videoSource));
  assert.equal(videoApplied.maskOpacity, 0.27, "Applying old pending media keeps the current active mask");
  assert.deepEqual(await fs.readFile(videoApplied.active.path), mp4);
  const previous = await readJson(configPath);
  assert.deepEqual(await fs.readFile(path.join(theme, previous.image)), preview, "The existing image remains the video fallback poster");

  const pending = await success("import", source);
  const beforeResumeConfig = await fs.readFile(configPath);
  for (const enabled of [false, true]) {
    await success("autostart", String(enabled));
    const resumed = await success("resume");
    assert.deepEqual(resumed.selection, pending.selection, "Resume never applies or drops a pending import");
    assert.equal(resumed.autostart, enabled, "Resume preserves either automatic-start preference");
    assert.equal(resumed.active.path, videoApplied.active.path);
    assert.deepEqual(await fs.readFile(configPath), beforeResumeConfig, "Resume reuses the exact saved theme");
  }
  assert.match(await fs.readFile(path.join(home, "start-calls"), "utf8"), /--existing-only\n--existing-only\n$/u);
  await fs.writeFile(path.join(home, "fail-next-apply"), "");
  await rejects(["resume"], "resume_unavailable");
  assert.deepEqual(await fs.readFile(configPath), beforeResumeConfig);
  assert.deepEqual((await success("status")).selection, pending.selection);
  await fs.writeFile(path.join(home, "fail-next-apply"), "");
  await rejects(["mask", "0.11"], "mask_failed_restored");
  assert.deepEqual(await readJson(configPath), previous, "A failed mask Verify restores the exact previous theme");
  const maskRestored = await success("status");
  assert.equal(maskRestored.maskOpacity, 0.27);
  assert.deepEqual(maskRestored.selection, pending.selection, "A failed mask change preserves pending media");
  assert.deepEqual(await fs.readFile(videoApplied.active.path), mp4);
  assert.match(await fs.readFile(path.join(home, "start-calls"), "utf8"), /\n\n$/u, "Mask rollback reapplies the original settings once");
  await fs.writeFile(path.join(home, "fail-next-apply"), "");
  await rejects(["apply", pending.selection.id], "apply_failed_restored");
  assert.deepEqual(await readJson(configPath), previous, "A failed Verify restores the previous settings");
  assert.deepEqual(await fs.readFile(videoApplied.active.path), mp4);
  assert.deepEqual((await success("status")).selection, pending.selection, "A failed apply retains the selection for retry");
  assert.deepEqual((await fs.readdir(theme)).sort(), [previous.image, previous.video, "initial.png", "theme.json"].sort(), "Rollback removes only the newly published assets");
  assert.match(await fs.readFile(path.join(home, "start-calls"), "utf8"), /\n\n$/u, "Rollback starts the original theme once without another restart prompt");
  assert.equal((await success("apply", pending.selection.id)).active.kind, "image");
  assert.equal((await readJson(configPath)).video, undefined);
  await assert.rejects(fs.access(path.join(theme, previous.video)), { code: "ENOENT" });
  await assert.rejects(fs.access(path.join(theme, previous.image)), { code: "ENOENT" });

  const replacement = await success("import", videoSource);
  await fs.writeFile(path.join(home, "block-apply"), "");
  blocked = spawn(process.execPath, [entry, "apply", replacement.selection.id], { env: environment, stdio: ["ignore", "pipe", "pipe"] });
  const blockedExit = once(blocked, "exit");
  let output = "";
  blocked.stdout.on("data", (chunk) => { output += chunk; });
  blocked.stderr.on("data", (chunk) => { output += chunk; });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await fs.access(path.join(home, "apply-started")).then(() => true, () => false)) break;
    if (attempt === 99) throw Error("The isolated apply stub did not start");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await rejects(["import", source], "operation_busy");
  await rejects(["apply", replacement.selection.id], "operation_busy");
  await rejects(["autostart", "true"], "operation_busy");
  await rejects(["mask", "0.5"], "operation_busy");
  await rejects(["pause"], "operation_busy");
  await rejects(["resume"], "operation_busy");
  const currentConfig = await fs.readFile(configPath);
  assert.equal((await call("recover")).code, 75, "Recovery never rolls back another live operation holding the lock");
  assert.equal((await success("status")).selection.id, replacement.selection.id, "Status remains readable while another process owns the mutation lock");
  assert.equal((await success("status")).pendingRecovery, true);
  assert.deepEqual(await fs.readFile(configPath), currentConfig, "Status never mutates a pending transaction");
  await fs.unlink(path.join(home, "block-apply"));
  assert.deepEqual(await blockedExit, [0, null]);
  assert.equal(JSON.parse(output).selection, null);
  blocked = null;
  assert.equal((await fs.stat(path.join(studio, "operation.lock"))).isFile(), true, "The kernel lock inode is retained for concurrent callers");
  await fs.writeFile(path.join(studio, "operation.lock"), "");
  assert.equal((await success("autostart", "true")).autostartLoaded, true, "An old empty file is not an active kernel lock");
  const beforeInterrupted = await readJson(configPath);
  const beforeInterruptedMedia = await fs.readFile(path.join(theme, beforeInterrupted.video));
  const interrupted = await success("import", source);
  await fs.unlink(path.join(home, "apply-started"));
  await fs.writeFile(path.join(home, "block-apply"), "");
  blocked = spawn(process.execPath, [entry, "apply", interrupted.selection.id], { env: environment, stdio: ["ignore", "ignore", "ignore"] });
  const interruptedExit = once(blocked, "exit");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await fs.access(path.join(home, "apply-started")).then(() => true, () => false)) break;
    if (attempt === 99) throw Error("The interrupted apply stub did not start");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const workerPid = Number(await fs.readFile(path.join(home, "apply-worker"), "utf8"));
  assert.ok(workerPid > 1 && workerPid !== process.pid);
  process.kill(workerPid, "SIGKILL");
  await fs.unlink(path.join(home, "block-apply"));
  assert.deepEqual(await interruptedExit, [1, null]);
  blocked = null;
  const journal = await fs.readFile(transactionPath);
  const interruptedConfig = await fs.readFile(configPath);
  assert.notDeepEqual(JSON.parse(interruptedConfig), beforeInterrupted, "The fixture kills the worker after its unverified publication");
  await fs.writeFile(transactionPath, "{broken");
  await rejects(["recover"], "invalid_background");
  assert.deepEqual(await fs.readFile(configPath), interruptedConfig);
  assert.equal(await fs.readFile(transactionPath, "utf8"), "{broken", "Invalid journals are retained for inspection");
  await fs.unlink(transactionPath);
  const unrelated = path.join(temporary, "unrelated.json");
  await fs.writeFile(unrelated, "保留 🌙");
  await fs.symlink(unrelated, transactionPath);
  await rejects(["recover"], "invalid_background");
  assert.equal((await fs.lstat(transactionPath)).isSymbolicLink(), true);
  assert.equal(await fs.readFile(unrelated, "utf8"), "保留 🌙", "Recovery never follows or removes a foreign journal symlink");
  await fs.unlink(transactionPath);
  await fs.writeFile(transactionPath, journal);
  const foreignConfig = { ...JSON.parse(interruptedConfig), name: "外部更改 保留 🌙" };
  await fs.writeFile(configPath, JSON.stringify(foreignConfig));
  await rejects(["recover"], "invalid_background");
  assert.deepEqual(await readJson(configPath), foreignConfig, "Recovery never overwrites unrelated theme changes");
  await fs.writeFile(configPath, interruptedConfig);
  assert.equal((await success("recover")).recovered, true);
  assert.deepEqual(await readJson(configPath), beforeInterrupted, "A killed apply restores the exact previous settings");
  assert.deepEqual(await fs.readFile(path.join(theme, beforeInterrupted.video)), beforeInterruptedMedia);
  assert.deepEqual((await success("status")).selection, interrupted.selection, "Crash recovery preserves the pending import for retry");
  assert.equal((await success("recover")).recovered, false, "A completed recovery is idempotent");
  assert.equal((await success("apply", interrupted.selection.id)).selection, null);
  const committed = await fs.readFile(configPath);
  assert.equal((await success("recover")).recovered, false);
  assert.deepEqual(await fs.readFile(configPath), committed, "Verified commits cannot be rolled back by a later recovery");
  await fs.unlink(path.join(home, "apply-started"));
  await fs.writeFile(path.join(home, "block-apply"), "");
  blocked = spawn(process.execPath, [entry, "mask", "0.81"], { env: environment, stdio: ["ignore", "ignore", "ignore"] });
  const maskInterruptedExit = once(blocked, "exit");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await fs.access(path.join(home, "apply-started")).then(() => true, () => false)) break;
    if (attempt === 99) throw Error("The interrupted mask stub did not start");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const maskWorkerPid = Number(await fs.readFile(path.join(home, "apply-worker"), "utf8"));
  process.kill(maskWorkerPid, "SIGKILL");
  await fs.unlink(path.join(home, "block-apply"));
  assert.deepEqual(await maskInterruptedExit, [1, null]);
  blocked = null;
  assert.equal((await readJson(configPath)).maskOpacity, 0.81);
  assert.equal((await success("recover")).recovered, true);
  assert.deepEqual(await fs.readFile(configPath), committed, "A killed mask restores the exact previous theme and preferences");
  assert.equal((await success("autostart", "true")).autostartLoaded, true, "Killing an operation releases its kernel lock without stale-PID recovery");
  assert.equal((await success("autostart", "false")).autostart, false);
  await fs.writeFile(path.join(home, "fail-autostart"), "");
  await rejects(["autostart", "true"], "operation_failed");
  await fs.unlink(path.join(home, "fail-autostart"));
  await fs.writeFile(path.join(studio, "selection.json"), JSON.stringify({ id: "../../outside", kind: "video", name: "test.mp4" }));
  await rejects(["status"], "invalid_selection");
  const repaired = await success("import", source);
  assert.equal(repaired.selection.kind, "image", "A fresh import repairs corrupt pending selection metadata");
  await fs.writeFile(path.join(home, "start-calls"), "");
  const embeddedMask = await call("--embedded", "mask", "0.17");
  assert.equal(embeddedMask.code, 0);
  assert.equal(embeddedMask.value.maskOpacity, 0.17);
  assert.deepEqual(embeddedMask.value.selection, repaired.selection);
  const beforeEmbeddedFailure = await fs.readFile(configPath);
  await fs.writeFile(path.join(home, "fail-next-apply"), "");
  await rejects(["--embedded", "mask", "0.21"], "mask_failed_restored");
  assert.deepEqual(await fs.readFile(configPath), beforeEmbeddedFailure);
  await fs.writeFile(path.join(home, "fail-next-apply"), "");
  await rejects(["--embedded", "apply", repaired.selection.id], "apply_failed_restored");
  assert.deepEqual(await fs.readFile(configPath), beforeEmbeddedFailure);
  assert.deepEqual((await success("status")).selection, repaired.selection);
  const embeddedApplied = await call("--embedded", "apply", repaired.selection.id);
  assert.equal(embeddedApplied.code, 0);
  assert.equal(embeddedApplied.value.selection, null);
  assert.equal(embeddedApplied.value.autostart, false, "Embedded apply never enables automatic startup");
  assert.deepEqual((await fs.readFile(path.join(home, "start-calls"), "utf8")).trim().split("\n"),
    Array(6).fill("--existing-only"), "Embedded apply, mask and both rollback paths may only attach to an existing Codex connection");
  console.log("PASS: isolated native import, local preview paths, explicit apply, original MP4 bytes, mask validation/persistence/rollback, pending persistence, killed apply/mask recovery, foreign-journal protection, lock exclusion, autostart status, and structured English localization codes without child output leaks.");
} finally {
  if (blocked && blocked.exitCode === null) {
    await fs.rm(path.join(home, "block-apply"), { force: true });
    blocked.kill("SIGTERM");
  }
  await fs.rm(temporary, { recursive: true, force: true });
}
