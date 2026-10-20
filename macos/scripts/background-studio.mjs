import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadTheme } from "./injector.mjs";
import { readVideo, MAX_VIDEO_BYTES } from "./video-file.mjs";
import { readImageMetadata, MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "./image-metadata.mjs";

const script = fileURLToPath(import.meta.url);
const scripts = path.dirname(script);
const stateRoot = path.join(process.env.HOME, "Library/Application Support/CodexDreamSkinStudio");
const themeRoot = path.join(stateRoot, "theme");
const studioRoot = path.join(stateRoot, "studio");
const selectionPath = path.join(studioRoot, "selection.json");
const lockPath = path.join(studioRoot, "operation.lock");
const run = promisify(execFile);
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif", ".tif", ".tiff"]);
const DEFAULT_MASK_OPACITY = 0.62;
const validId = (id) => typeof id === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id);
const validName = (name) => typeof name === "string" && name.length > 0 && name.length <= 240 && path.basename(name) === name && !/[\\\p{Cc}\u2028\u2029]/u.test(name);
const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const fail = (message) => Object.assign(new Error(message), { publicMessage: message });

async function atomicJson(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
}

async function regularFile(file) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.size < 1) throw fail("背景檔案無效，請重新匯入。");
  return stat;
}

async function selectedMedia() {
  let saved;
  try { saved = await readJson(selectionPath); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  if (!validId(saved.id) || !validName(saved.name) || !["image", "video"].includes(saved.kind)) throw fail("待套用素材設定無效，請重新匯入。");
  const directory = path.join(studioRoot, `import-${saved.id}`);
  if (!(await fs.lstat(directory)).isDirectory()) throw fail("待套用素材已遺失，請重新匯入。");
  const config = await readJson(path.join(directory, "theme.json"));
  const file = saved.kind === "video" ? config.video : config.image;
  if (!validName(file) || !file.startsWith(`background-studio-${saved.id}.`)) throw fail("待套用素材設定無效，請重新匯入。");
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
  if (!validName(file)) throw fail("目前背景設定無效，請重新匯入。");
  const activePath = path.join(themeRoot, file);
  const stat = await regularFile(activePath);
  return {
    version: "1.4.0",
    active: { name: config.name, kind: config.video ? "video" : "image", path: activePath, bytes: stat.size, applied: JSON.parse(runtime.stdout).session === "active" },
    selection: selected?.public ?? null,
    maskOpacity: config.maskOpacity ?? DEFAULT_MASK_OPACITY,
    autostart: /^enabled=true$/m.test(startup.stdout),
    autostartLoaded: /^loaded=true$/m.test(startup.stdout),
  };
}

async function withLock(args) {
  await fs.mkdir(studioRoot, { recursive: true, mode: 0o700 });
  if (!(await fs.lstat(studioRoot)).isDirectory()) throw fail("背景工作室資料夾無效。");
  const handle = await fs.open(lockPath, constants.O_RDONLY | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  try {
    if (!(await handle.stat()).isFile()) throw fail("背景工作室鎖定檔無效。");
  } finally { await handle.close(); }
  try {
    // Keep the inode so concurrent callers share one kernel lock, including after a crash.
    const { stdout } = await run("/usr/bin/lockf", ["-ks", "-t", "0", lockPath, process.execPath, script, "--locked-worker", ...args], { maxBuffer: 1024 * 1024 });
    return JSON.parse(stdout);
  } catch (error) {
    if (error.code === 75) throw fail("正在處理背景，請等待目前操作完成。");
    let result;
    try { result = JSON.parse(error.stdout); } catch {}
    if (typeof result?.error === "string") throw fail(result.error);
    throw error;
  }
}

async function readSource(file, limit) {
  let handle;
  try { handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch { throw fail("請選擇有效的本機檔案；不支援符號連結。"); }
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size < 1 || before.size > limit) throw fail(limit === MAX_VIDEO_BYTES ? "MP4 必須是一般檔案且不得超過 256 MiB。" : "圖片必須是一般檔案且不得超過 50 MiB。");
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!result.bytesRead) throw fail("檔案在匯入期間變更，請重新選擇。");
      offset += result.bytesRead;
    }
    const after = await handle.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw fail("檔案在匯入期間變更，請重新選擇。");
    return bytes;
  } finally { await handle.close(); }
}

async function importMedia(file) {
  if (!file || !path.isAbsolute(file) || !validName(path.basename(file))) throw fail("請選擇有效的本機檔案。");
  const name = path.basename(file);
  const extension = path.extname(name).toLowerCase();
  const video = extension === ".mp4";
  if (!video && !imageExtensions.has(extension)) throw fail("支援 MP4、PNG、JPEG、WebP、HEIC 或 TIFF。");
  const bytes = await readSource(file, video ? MAX_VIDEO_BYTES : 50 * 1024 * 1024);
  const id = randomUUID();
  const directory = path.join(studioRoot, `import-${id}`);
  await fs.mkdir(directory, { mode: 0o700 });
  try {
    const uploaded = path.join(directory, `source${extension}`);
    await fs.writeFile(uploaded, bytes, { flag: "wx", mode: 0o600 });
    const { raw, extension: posterExtension, imagePath } = await loadTheme(themeRoot);
    const imageName = `background-studio-${id}${video ? posterExtension : ".jpg"}`;
    const config = { ...raw, id: `custom-studio-${id}`, name: Array.from(name.slice(0, -extension.length)).slice(0, 80).join(""), image: imageName, appearance: "dark", layout: "wallpaper", art: { safeArea: "none", taskMode: "ambient", focusX: 0.5, focusY: 0.5 } };
    if (video) {
      try { await readVideo(uploaded); } catch { throw fail("無法讀取 MP4，請選擇有效的影片檔案。"); }
      config.video = `background-studio-${id}.mp4`;
      await fs.rename(uploaded, path.join(directory, config.video));
      await fs.copyFile(imagePath, path.join(directory, imageName));
    } else {
      delete config.video;
      let stdout;
      try { ({ stdout } = await run("/usr/bin/sips", ["-g", "pixelWidth", "-g", "pixelHeight", uploaded], { timeout: 30000 })); }
      catch { throw fail("無法讀取圖片，請選擇有效的圖片檔案。"); }
      const width = Number(/pixelWidth:\s*(\d+)/.exec(stdout)?.[1]);
      const height = Number(/pixelHeight:\s*(\d+)/.exec(stdout)?.[1]);
      if (!width || !height) throw fail("無法讀取圖片，請選擇有效的圖片檔案。");
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) throw fail("圖片須小於 16384 像素／5000 萬像素。");
      await run("/usr/bin/sips", ["-s", "format", "jpeg", "-s", "formatOptions", "90", "-Z", String(Math.min(4096, Math.max(width, height))), uploaded, "--out", path.join(directory, imageName)], { timeout: 60000 });
      const image = await fs.readFile(path.join(directory, imageName));
      if (!readImageMetadata(image, ".jpg") || image.length > 16 * 1024 * 1024) throw fail("圖片無法轉換成有效背景，請選擇較小的圖片。");
      await fs.unlink(uploaded);
    }
    await fs.chmod(path.join(directory, imageName), 0o600);
    await atomicJson(path.join(directory, "theme.json"), config);
    const previous = await selectedMedia().catch(() => null);
    await atomicJson(selectionPath, { id, name, kind: video ? "video" : "image" });
    if (previous) await fs.rm(previous.directory, { recursive: true, force: true }).catch(() => {});
    return "素材已匯入；確認預覽後按下套用背景。";
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function applySelection(id) {
  const selected = await selectedMedia();
  if (!selected || id !== selected.public.id) throw fail("請先匯入要套用的背景。");
  await loadTheme(selected.directory);
  const previous = (await loadTheme(themeRoot)).raw;
  const configPath = path.join(themeRoot, "theme.json");
  let published = false;
  try {
    for (const file of [selected.config.image, selected.config.video].filter(Boolean)) {
      const temporary = path.join(themeRoot, `${file}.${randomUUID()}.tmp`);
      try {
        await fs.copyFile(path.join(selected.directory, file), temporary, constants.COPYFILE_EXCL);
        await fs.chmod(temporary, 0o600);
        await fs.rename(temporary, path.join(themeRoot, file));
      } finally { await fs.rm(temporary, { force: true }); }
    }
    await atomicJson(configPath, { ...selected.config, maskOpacity: previous.maskOpacity ?? DEFAULT_MASK_OPACITY });
    published = true;
    await run("/bin/bash", [path.join(scripts, "start-dream-skin-macos.sh"), "--prompt-restart"], { timeout: 180000, maxBuffer: 1024 * 1024 });
  } catch {
    let restored = !published;
    if (published) {
      try {
        await atomicJson(configPath, previous);
        restored = true;
        await run("/bin/bash", [path.join(scripts, "start-dream-skin-macos.sh")], { timeout: 180000, maxBuffer: 1024 * 1024 }).catch(() => {});
      } catch {}
    }
    if (restored) {
      for (const file of [selected.config.image, selected.config.video].filter(Boolean)) {
        if (![previous.image, previous.video].includes(file)) await fs.unlink(path.join(themeRoot, file)).catch(() => {});
      }
    }
    throw fail(restored ? "套用未完成，已還原原本背景設定。素材已保留，請重試。" : "套用未完成，背景設定無法還原。請重新開啟工作室查看狀態。");
  }
  await fs.unlink(selectionPath);
  await fs.rm(selected.directory, { recursive: true, force: true });
  for (const file of [previous.image, previous.video].filter(Boolean)) {
    if (file.startsWith("background-") && path.basename(file) === file && ![selected.config.image, selected.config.video].includes(file)) await fs.unlink(path.join(themeRoot, file)).catch(() => {});
  }
  return "背景已套用，播放與版面檢查通過。";
}

async function applyMask(maskOpacity) {
  const previous = (await loadTheme(themeRoot)).raw;
  const configPath = path.join(themeRoot, "theme.json");
  let published = false;
  try {
    await atomicJson(configPath, { ...previous, maskOpacity });
    published = true;
    await run("/bin/bash", [path.join(scripts, "start-dream-skin-macos.sh"), "--prompt-restart"], { timeout: 180000, maxBuffer: 1024 * 1024 });
  } catch {
    let restored = !published;
    if (published) {
      try {
        await atomicJson(configPath, previous);
        restored = true;
        await run("/bin/bash", [path.join(scripts, "start-dream-skin-macos.sh")], { timeout: 180000, maxBuffer: 1024 * 1024 }).catch(() => {});
      } catch {}
    }
    throw fail(restored ? "遮罩未套用，已還原原本背景設定。請重試。" : "遮罩未套用，背景設定無法還原。請重新開啟工作室查看狀態。");
  }
  return "全版遮罩已套用，播放與版面檢查通過。";
}

try {
  const args = process.argv.slice(2);
  const worker = args[0] === "--locked-worker";
  if (worker) args.shift();
  const [command, value, ...extra] = args;
  if (extra.length || !["status", "import", "apply", "autostart", "mask"].includes(command) || (command === "status" && value !== undefined)) throw fail("請使用 status、import、apply、autostart 或 mask。");
  if ((command === "import" && (!value || !path.isAbsolute(value))) || (command === "apply" && !validId(value))) throw fail(command === "import" ? "請選擇有效的本機檔案。" : "請先匯入要套用的背景。");
  if (command === "autostart" && !["true", "false"].includes(value)) throw fail("自動套用設定無效。");
  if (command === "mask" && !/^(?:0(?:\.\d{1,2})?|1(?:\.0{1,2})?)$/.test(value ?? "")) throw fail("遮罩濃度須為 0 到 1，且最多兩位小數。");
  if (worker) {
    const { stdout } = await run("/bin/ps", ["-p", String(process.ppid), "-o", "command="], { timeout: 5000 });
    if (command === "status" || !stdout.trim().startsWith(`/usr/bin/lockf -ks -t 0 ${lockPath} ${process.execPath} ${script} --locked-worker `)) throw fail("內部背景操作必須由工作室啟動。");
  }
  if (command === "status") console.log(JSON.stringify(await status()));
  else if (!worker) console.log(JSON.stringify(await withLock(args)));
  else {
    let message;
    if (command === "import") message = await importMedia(value);
    else if (command === "apply") message = await applySelection(value);
    else if (command === "mask") message = await applyMask(Number(value));
    else {
      await run("/bin/bash", [path.join(scripts, "autostart-dream-skin-macos.sh"), value === "true" ? "enable" : "disable"], { timeout: 30000 });
      message = value === "true" ? "一般開啟 Codex 時會自動套用目前背景。" : "自動套用已關閉，目前背景不變。";
    }
    console.log(JSON.stringify({ ...await status(), message }));
  }
} catch (error) {
  console.log(JSON.stringify({ error: error.publicMessage ?? "背景工作室無法完成操作，請稍後重試。" }));
  process.exitCode = 1;
}
