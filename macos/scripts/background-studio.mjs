import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadTheme } from "./injector.mjs";
import { copyVideo, MAX_VIDEO_BYTES } from "./video-file.mjs";
import { readImageMetadata, MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "./image-metadata.mjs";

const script = fileURLToPath(import.meta.url);
const scripts = path.dirname(script);
const stateRoot = path.join(process.env.HOME, "Library/Application Support/CodexDreamSkinStudio");
const themeRoot = path.join(stateRoot, "theme");
const studioRoot = path.join(stateRoot, "studio");
const selectionPath = path.join(studioRoot, "selection.json");
const lockPath = path.join(studioRoot, "operation.lock");
const transactionPath = path.join(themeRoot, ".studio-transaction.json");
const run = promisify(execFile);
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif", ".tif", ".tiff"]);
const DEFAULT_MASK_OPACITY = 0.62;
const messages = Object.freeze({
  imported: "Media imported. Review the preview before applying the background.",
  applied: "Background applied. Playback and layout checks passed.",
  mask_updated: "Full-window mask applied. Playback and layout checks passed.",
  autostart_enabled: "Official Codex launches apply the saved background with one graceful reopen.",
  autostart_disabled: "Automatic backgrounds are off. The current background is unchanged.",
  paused: "Background paused. Codex was left running and saved settings were preserved.",
  resumed: "Saved background resumed. Codex was left running and automatic startup preferences were preserved.",
});
const errors = Object.freeze({
  invalid_media: "The background file is invalid. Import it again.",
  invalid_selection: "The pending media settings are invalid. Import the file again.",
  missing_selection: "The pending media is missing. Import the file again.",
  invalid_background: "The current background settings are invalid. Import the file again.",
  invalid_studio: "The local studio folder is invalid.",
  invalid_lock: "The studio lock file is invalid.",
  operation_busy: "A background operation is in progress. Wait for it to finish.",
  invalid_local_file: "Select a valid local file. Symbolic links are not supported.",
  file_access_denied: "Xskin cannot access the selected file or its local import folder. Check file permissions and choose again.",
  video_size_limit: "MP4 must be a regular file no larger than 256 MiB.",
  image_size_limit: "Images must be regular files no larger than 50 MiB.",
  source_changed: "The file changed during import. Select it again.",
  unsupported_format: "Choose MP4, PNG, JPEG, WebP, HEIC, or TIFF.",
  invalid_video: "The MP4 could not be read. Select a valid video file.",
  invalid_image: "The image could not be read. Select a valid image file.",
  image_dimensions: "Images must be within 16384 pixels per edge and 50 million pixels.",
  image_conversion: "The image could not be converted to a valid background. Choose a smaller image.",
  select_media: "Import a background before applying it.",
  apply_failed_restored: "The background was not applied. Previous settings were restored, and the import was kept for retry.",
  apply_failed_unrestored: "The background was not applied, and previous settings could not be restored. Reopen Xskin to check its status.",
  mask_failed_restored: "The mask was not applied. Previous background settings were restored. Try again.",
  mask_failed_unrestored: "The mask was not applied, and previous settings could not be restored. Reopen Xskin to check its status.",
  resume_unavailable: "The saved background could not resume on an existing verified Codex connection. Codex was not opened or restarted.",
  invalid_command: "Use status, import, apply, autostart, mask, pause, resume, or recover.",
  invalid_autostart: "The automatic apply setting is invalid.",
  invalid_mask: "Mask depth must be between 0 and 1, with at most two decimal places.",
  invalid_worker: "Internal background operations must be started by Xskin.",
  operation_failed: "Xskin could not complete the operation. Try again later.",
});
const validId = (id) => typeof id === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id);
const validName = (name) => typeof name === "string" && name.length > 0 && name.length <= 240 && path.basename(name) === name && !/[\\\p{Cc}\u2028\u2029]/u.test(name);
const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const fail = (errorCode) => Object.assign(new Error(errors[errorCode]), { errorCode });
const importFailure = (error, fallback) => fail(["EACCES", "EPERM"].includes(error?.code) ? "file_access_denied" : fallback);

async function atomicJson(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
}

async function beginTransaction(previous, next) {
  if (Object.hasOwn(previous, "xskinTransaction")) throw fail("invalid_background");
  const transaction = { ...previous, xskinTransaction: { schemaVersion: 1, next } };
  if (Buffer.byteLength(JSON.stringify(transaction, null, 2)) + 1 > 1024 * 1024) throw fail("invalid_background");
  await atomicJson(transactionPath, transaction);
}

async function recoverTransaction() {
  let handle;
  try { handle = await fs.open(transactionPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (error) { if (error.code === "ENOENT") return false; throw fail("invalid_background"); }
  let saved;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > 1024 * 1024) throw fail("invalid_background");
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (bytes.length > 1024 * 1024 || stat.size !== after.size || stat.mtimeMs !== after.mtimeMs || stat.ctimeMs !== after.ctimeMs) throw fail("invalid_background");
    saved = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { throw fail("invalid_background");
  } finally { await handle.close(); }
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) throw fail("invalid_background");
  const transaction = saved.xskinTransaction;
  if (!transaction || typeof transaction !== "object" || Array.isArray(transaction)
    || Object.keys(transaction).sort().join(",") !== "next,schemaVersion" || transaction.schemaVersion !== 1
    || !transaction.next || typeof transaction.next !== "object" || Array.isArray(transaction.next)
    || transaction.next.schemaVersion !== 1 || !validName(transaction.next.image)
    || (transaction.next.video !== undefined && !validName(transaction.next.video))
    || Object.hasOwn(transaction.next, "xskinTransaction")) throw fail("invalid_background");
  const loaded = await loadTheme(themeRoot, path.basename(transactionPath));
  if (JSON.stringify(loaded.raw) !== JSON.stringify(saved)) throw fail("invalid_background");
  const { xskinTransaction, ...previous } = saved;
  const current = await readJson(path.join(themeRoot, "theme.json"));
  if (![previous, transaction.next].some((config) => JSON.stringify(config) === JSON.stringify(current))) throw fail("invalid_background");
  await atomicJson(path.join(themeRoot, "theme.json"), previous);
  await fs.unlink(transactionPath);
  return true;
}

async function regularFile(file) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.size < 1) throw fail("invalid_media");
  return stat;
}

async function selectedMedia() {
  let saved;
  try { saved = await readJson(selectionPath); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  if (!validId(saved.id) || !validName(saved.name) || !["image", "video"].includes(saved.kind)) throw fail("invalid_selection");
  const directory = path.join(studioRoot, `import-${saved.id}`);
  if (!(await fs.lstat(directory)).isDirectory()) throw fail("missing_selection");
  const config = await readJson(path.join(directory, "theme.json"));
  const file = saved.kind === "video" ? config.video : config.image;
  if (!validName(file) || !file.startsWith(`background-studio-${saved.id}.`)) throw fail("invalid_selection");
  const preview = path.join(directory, file);
  const stat = await regularFile(preview);
  return { directory, config, public: { id: saved.id, name: saved.name, kind: saved.kind, path: preview, bytes: stat.size } };
}

async function status() {
  const [config, selected, runtime, startup] = await Promise.all([
    readJson(path.join(themeRoot, "theme.json")),
    selectedMedia(),
    run("/bin/bash", [path.join(scripts, "status-dream-skin-macos.sh"), "--json"], { timeout: 5000 }),
    run("/bin/bash", [path.join(scripts, "autostart-dream-skin-macos.sh"), "status"], { timeout: 5000 }),
  ]);
  const file = config.video ?? config.image;
  if (!validName(file)) throw fail("invalid_background");
  const activePath = path.join(themeRoot, file);
  const stat = await regularFile(activePath);
  return {
    version: "1.9.3",
    active: { name: config.name, kind: config.video ? "video" : "image", path: activePath, bytes: stat.size, applied: JSON.parse(runtime.stdout).session === "active" },
    selection: selected?.public ?? null,
    maskOpacity: config.maskOpacity ?? DEFAULT_MASK_OPACITY,
    autostart: /^enabled=true$/m.test(startup.stdout),
    autostartLoaded: /^loaded=true$/m.test(startup.stdout),
    pendingRecovery: await fs.lstat(transactionPath).then(() => true, (error) => { if (error.code === "ENOENT") return false; throw error; }),
  };
}

async function withLock(args) {
  await fs.mkdir(studioRoot, { recursive: true, mode: 0o700 });
  if (!(await fs.lstat(studioRoot)).isDirectory()) throw fail("invalid_studio");
  const handle = await fs.open(lockPath, constants.O_RDONLY | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  try {
    if (!(await handle.stat()).isFile()) throw fail("invalid_lock");
  } finally { await handle.close(); }
  try {
    // Keep the inode so concurrent callers share one kernel lock, including after a crash.
    const { stdout } = await run("/usr/bin/lockf", ["-ks", "-t", "0", lockPath, process.execPath, script, "--locked-worker", ...args], { maxBuffer: 1024 * 1024 });
    return JSON.parse(stdout);
  } catch (error) {
    if (error.code === 75) throw fail("operation_busy");
    let result;
    try { result = JSON.parse(error.stdout); } catch {}
    if (Object.hasOwn(errors, result?.errorCode)) throw fail(result.errorCode);
    throw error;
  }
}

async function readSource(file) {
  let handle;
  try { handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (error) { throw importFailure(error, "invalid_local_file"); }
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size < 1 || before.size > 50 * 1024 * 1024) throw fail("image_size_limit");
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!result.bytesRead) throw fail("source_changed");
      offset += result.bytesRead;
    }
    const after = await handle.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw fail("source_changed");
    return bytes;
  } finally { await handle.close(); }
}

async function importMedia(file) {
  if (!file || !path.isAbsolute(file) || !validName(path.basename(file))) throw fail("invalid_local_file");
  const name = path.basename(file);
  const extension = path.extname(name).toLowerCase();
  const video = extension === ".mp4";
  if (!video && !imageExtensions.has(extension)) throw fail("unsupported_format");
  if (video) {
    let stat;
    try { stat = await fs.lstat(file); } catch (error) { throw importFailure(error, "invalid_local_file"); }
    if (stat.isSymbolicLink()) throw fail("invalid_local_file");
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_VIDEO_BYTES) throw fail("video_size_limit");
  }
  const bytes = video ? null : await readSource(file);
  const id = randomUUID();
  const directory = path.join(studioRoot, `import-${id}`);
  await fs.mkdir(directory, { mode: 0o700 });
  try {
    const uploaded = path.join(directory, `source${extension}`);
    if (video) {
      try { await copyVideo(file, uploaded); } catch (error) { throw importFailure(error, "invalid_video"); }
    } else {
      await fs.writeFile(uploaded, bytes, { flag: "wx", mode: 0o600 });
    }
    const { raw, extension: posterExtension, imagePath } = await loadTheme(themeRoot);
    const imageName = `background-studio-${id}${video ? posterExtension : ".jpg"}`;
    const config = { ...raw, id: `custom-studio-${id}`, name, image: imageName, appearance: "dark", layout: "wallpaper", art: { safeArea: "none", taskMode: "ambient", focusX: 0.5, focusY: 0.5 } };
    if (video) {
      config.video = `background-studio-${id}.mp4`;
      await fs.rename(uploaded, path.join(directory, config.video));
      await fs.copyFile(imagePath, path.join(directory, imageName));
    } else {
      delete config.video;
      let stdout;
      try { ({ stdout } = await run("/usr/bin/sips", ["-g", "pixelWidth", "-g", "pixelHeight", uploaded], { timeout: 30000 })); }
      catch { throw fail("invalid_image"); }
      const width = Number(/pixelWidth:\s*(\d+)/.exec(stdout)?.[1]);
      const height = Number(/pixelHeight:\s*(\d+)/.exec(stdout)?.[1]);
      if (!width || !height) throw fail("invalid_image");
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) throw fail("image_dimensions");
      try {
        await run("/usr/bin/sips", ["-s", "format", "jpeg", "-s", "formatOptions", "90", "-Z", String(Math.min(4096, Math.max(width, height))), uploaded, "--out", path.join(directory, imageName)], { timeout: 60000 });
      } catch { throw fail("image_conversion"); }
      const image = await fs.readFile(path.join(directory, imageName));
      if (!readImageMetadata(image, ".jpg") || image.length > 16 * 1024 * 1024) throw fail("image_conversion");
      await fs.unlink(uploaded);
    }
    await fs.chmod(path.join(directory, imageName), 0o600);
    await atomicJson(path.join(directory, "theme.json"), config);
    const previous = await selectedMedia().catch(() => null);
    await atomicJson(selectionPath, { id, name, kind: video ? "video" : "image" });
    if (previous) await fs.rm(previous.directory, { recursive: true, force: true }).catch(() => {});
    return "imported";
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function applySelection(id, existingOnly = false) {
  const startArgs = existingOnly ? ["--existing-only"] : [];
  const selected = await selectedMedia();
  if (!selected || id !== selected.public.id) throw fail("select_media");
  await loadTheme(selected.directory);
  const previous = (await loadTheme(themeRoot)).raw;
  const configPath = path.join(themeRoot, "theme.json");
  let published = false;
  let journaled = false;
  try {
    await beginTransaction(previous, { ...selected.config, maskOpacity: previous.maskOpacity ?? DEFAULT_MASK_OPACITY });
    journaled = true;
    for (const file of [selected.config.image, selected.config.video].filter(Boolean)) {
      const temporary = path.join(themeRoot, `${file}.${randomUUID()}.tmp`);
      try {
        await fs.copyFile(path.join(selected.directory, file), temporary, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE);
        await fs.chmod(temporary, 0o600);
        await fs.rename(temporary, path.join(themeRoot, file));
      } finally { await fs.rm(temporary, { force: true }); }
    }
    await atomicJson(configPath, { ...selected.config, maskOpacity: previous.maskOpacity ?? DEFAULT_MASK_OPACITY });
    published = true;
    await run("/bin/bash", [path.join(scripts, "start-dream-skin-macos.sh"), ...startArgs], { timeout: 180000, maxBuffer: 1024 * 1024 });
    await fs.unlink(transactionPath);
    journaled = false;
  } catch {
    let restored = !published;
    if (published) {
      try {
        await atomicJson(configPath, previous);
        restored = true;
        await run("/bin/bash", [path.join(scripts, "start-dream-skin-macos.sh"), ...startArgs], { timeout: 180000, maxBuffer: 1024 * 1024 }).catch(() => {});
      } catch {}
    }
    if (restored) {
      if (journaled) await fs.unlink(transactionPath).catch(() => {});
      for (const file of [selected.config.image, selected.config.video].filter(Boolean)) {
        if (![previous.image, previous.video].includes(file)) await fs.unlink(path.join(themeRoot, file)).catch(() => {});
      }
    }
    throw fail(restored ? "apply_failed_restored" : "apply_failed_unrestored");
  }
  await fs.unlink(selectionPath);
  await fs.rm(selected.directory, { recursive: true, force: true });
  for (const file of [previous.image, previous.video].filter(Boolean)) {
    if (file.startsWith("background-") && path.basename(file) === file && ![selected.config.image, selected.config.video].includes(file)) await fs.unlink(path.join(themeRoot, file)).catch(() => {});
  }
  return "applied";
}

async function applyMask(maskOpacity, existingOnly = false) {
  const startArgs = existingOnly ? ["--existing-only"] : [];
  const previous = (await loadTheme(themeRoot)).raw;
  const configPath = path.join(themeRoot, "theme.json");
  let published = false;
  let journaled = false;
  try {
    await beginTransaction(previous, { ...previous, maskOpacity });
    journaled = true;
    await atomicJson(configPath, { ...previous, maskOpacity });
    published = true;
    await run("/bin/bash", [path.join(scripts, "start-dream-skin-macos.sh"), ...startArgs], { timeout: 180000, maxBuffer: 1024 * 1024 });
    await fs.unlink(transactionPath);
    journaled = false;
  } catch {
    let restored = !published;
    if (published) {
      try {
        await atomicJson(configPath, previous);
        restored = true;
        await run("/bin/bash", [path.join(scripts, "start-dream-skin-macos.sh"), ...startArgs], { timeout: 180000, maxBuffer: 1024 * 1024 }).catch(() => {});
      } catch {}
    }
    if (restored && journaled) await fs.unlink(transactionPath).catch(() => {});
    throw fail(restored ? "mask_failed_restored" : "mask_failed_unrestored");
  }
  return "mask_updated";
}

try {
  const args = process.argv.slice(2);
  const worker = args[0] === "--locked-worker";
  if (worker) args.shift();
  const embedded = args[0] === "--embedded";
  if (embedded) args.shift();
  const [command, value, ...extra] = args;
  if (extra.length || !["status", "import", "apply", "autostart", "mask", "pause", "resume", "recover"].includes(command) || (["status", "pause", "resume", "recover"].includes(command) && value !== undefined)) throw fail("invalid_command");
  if ((command === "import" && (!value || !path.isAbsolute(value))) || (command === "apply" && !validId(value))) throw fail(command === "import" ? "invalid_local_file" : "select_media");
  if (command === "autostart" && !["true", "false"].includes(value)) throw fail("invalid_autostart");
  if (command === "mask" && !/^(?:0(?:\.\d{1,2})?|1(?:\.0{1,2})?)$/.test(value ?? "")) throw fail("invalid_mask");
  if (worker) {
    const { stdout } = await run("/bin/ps", ["-p", String(process.ppid), "-o", "command="], { timeout: 5000 });
    if (command === "status" || !stdout.trim().startsWith(`/usr/bin/lockf -ks -t 0 ${lockPath} ${process.execPath} ${script} --locked-worker `)) throw fail("invalid_worker");
  }
  if (command === "status") console.log(JSON.stringify(await status()));
  else if (!worker) console.log(JSON.stringify(await withLock(embedded ? ["--embedded", ...args] : args)));
  else {
    const recovered = await recoverTransaction();
    if (command === "recover") {
      console.log(JSON.stringify({ recovered }));
      process.exit(0);
    }
    let messageCode;
    if (command === "import") messageCode = await importMedia(value);
    else if (command === "apply") messageCode = await applySelection(value, embedded);
    else if (command === "mask") messageCode = await applyMask(Number(value), embedded);
    else if (command === "pause") {
      await run("/bin/bash", [path.join(scripts, "pause-dream-skin-macos.sh")], { timeout: 90000, maxBuffer: 1024 * 1024 });
      messageCode = "paused";
    }
    else if (command === "resume") {
      try {
        await run("/bin/bash", [path.join(scripts, "start-dream-skin-macos.sh"), "--existing-only"], { timeout: 180000, maxBuffer: 1024 * 1024 });
      } catch { throw fail("resume_unavailable"); }
      messageCode = "resumed";
    }
    else {
      await run("/bin/bash", [path.join(scripts, "autostart-dream-skin-macos.sh"), value === "true" ? "enable" : "disable"], { timeout: 30000 });
      messageCode = value === "true" ? "autostart_enabled" : "autostart_disabled";
    }
    console.log(JSON.stringify({ ...await status(), message: messages[messageCode], messageCode }));
  }
} catch (error) {
  const errorCode = Object.hasOwn(errors, error.errorCode) ? error.errorCode
    : ["EACCES", "EPERM"].includes(error.code) ? "file_access_denied" : "operation_failed";
  console.log(JSON.stringify({ error: errors[errorCode], errorCode }));
  process.exitCode = process.argv[2] === "recover" && errorCode === "operation_busy" ? 75 : 1;
}
