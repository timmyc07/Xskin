import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile, execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { readImageMetadata } from "../scripts/image-metadata.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "dream-skin-studio-test-"));
const home = path.join(temporary, "home");
const engine = path.join(temporary, "engine");
const state = path.join(home, "Library/Application Support/CodexDreamSkinStudio");
const theme = path.join(state, "theme");
const studio = path.join(state, "studio");
const configPath = path.join(theme, "theme.json");
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
  const messageCode = { import: "imported", apply: "applied", mask: "mask_updated", autostart: args[1] === "true" ? "autostart_enabled" : "autostart_disabled" }[args[0]];
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
  const initialStatus = await success("status");
  assert.equal(initialStatus.version, "1.8.1");
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
  const imported = await success("import", source);
  assert.equal(imported.selection.kind, "image");
  assert.equal(imported.selection.name, path.basename(source));
  const preview = await fs.readFile(imported.selection.path);
  assert.equal(imported.selection.bytes, preview.length);
  assert.deepEqual(readImageMetadata(preview, ".jpg"), readImageMetadata(image, ".png"), "Small images must not be upscaled");
  assert.deepEqual(await readJson(configPath), initial, "Import must never apply a background");
  await assert.rejects(fs.access(path.join(home, "start-calls")), { code: "ENOENT" });
  assert.deepEqual((await success("status")).selection, imported.selection, "Pending imports survive a completely new CLI process");
  assert.deepEqual(await stages(), [`import-${imported.selection.id}`]);
  await rejects(["apply", "wrong-id"], "select_media");
  const imageApplied = await success("apply", imported.selection.id);
  assert.equal(imageApplied.selection, null);
  assert.equal(imageApplied.active.kind, "image");
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
  assert.equal(videoApplied.maskOpacity, 0.27, "Applying old pending media keeps the current active mask");
  assert.deepEqual(await fs.readFile(videoApplied.active.path), mp4);
  const previous = await readJson(configPath);
  assert.deepEqual(await fs.readFile(path.join(theme, previous.image)), preview, "The existing image remains the video fallback poster");

  const pending = await success("import", source);
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
  assert.equal((await success("status")).selection.id, replacement.selection.id, "Status remains readable while another process owns the mutation lock");
  await fs.unlink(path.join(home, "block-apply"));
  assert.deepEqual(await blockedExit, [0, null]);
  assert.equal(JSON.parse(output).selection, null);
  blocked = null;
  assert.equal((await fs.stat(path.join(studio, "operation.lock"))).isFile(), true, "The kernel lock inode is retained for concurrent callers");
  await fs.writeFile(path.join(studio, "operation.lock"), "");
  assert.equal((await success("autostart", "true")).autostartLoaded, true, "An old empty file is not an active kernel lock");
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
  assert.equal((await success("autostart", "true")).autostartLoaded, true, "Killing an operation releases its kernel lock without stale-PID recovery");
  assert.equal((await success("autostart", "false")).autostart, false);
  await fs.writeFile(path.join(home, "fail-autostart"), "");
  await rejects(["autostart", "true"], "operation_failed");
  await fs.unlink(path.join(home, "fail-autostart"));
  await fs.writeFile(path.join(studio, "selection.json"), JSON.stringify({ id: "../../outside", kind: "video", name: "test.mp4" }));
  await rejects(["status"], "invalid_selection");
  const repaired = await success("import", source);
  assert.equal(repaired.selection.kind, "image", "A fresh import repairs corrupt pending selection metadata");
  console.log("PASS: isolated native import, local preview paths, explicit apply, original MP4 bytes, mask validation/persistence/rollback, pending persistence, lock exclusion/recovery, autostart status, and structured English localization codes without child output leaks.");
} finally {
  if (blocked && blocked.exitCode === null) {
    await fs.rm(path.join(home, "block-apply"), { force: true });
    blocked.kill("SIGTERM");
  }
  await fs.rm(temporary, { recursive: true, force: true });
}
