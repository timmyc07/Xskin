import fs from "node:fs/promises";
import { constants as fsConstants, watch as watchFs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readImageMetadata } from "./image-metadata.mjs";
import { inspectVideo, validateVideoName } from "./video-file.mjs";
import { TokenUsageReader } from "./token-usage.mjs";
import { setTimeout as delay } from "node:timers/promises";

const scriptPath = fileURLToPath(import.meta.url);
const here = path.dirname(scriptPath);
const root = path.resolve(here, "..");
const SKIN_VERSION = "1.9.5";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const CDP_ID_PATTERN = /^[A-Za-z0-9._-]{1,200}$/;
const MAX_ART_BYTES = 16 * 1024 * 1024;
let staticPayloadAssets = null;

function parseArgs(argv) {
  const options = {
    port: 9341,
    mode: "watch",
    timeoutMs: 30000,
    screenshot: null,
    reload: false,
    prepareFirstFrame: false,
    themeDir: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port") options.port = Number(argv[++i]);
    else if (arg === "--once") options.mode = "once";
    else if (arg === "--watch") options.mode = "watch";
    else if (arg === "--verify") options.mode = "verify";
    else if (arg === "--remove") options.mode = "remove";
    else if (arg === "--check-payload") options.mode = "check";
    else if (arg === "--timeout-ms") options.timeoutMs = Number(argv[++i]);
    else if (arg === "--screenshot") options.screenshot = path.resolve(argv[++i]);
    else if (arg === "--theme-dir") options.themeDir = path.resolve(argv[++i]);
    else if (arg === "--reload") options.reload = true;
    else if (arg === "--prepare-first-frame") options.prepareFirstFrame = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 250 || options.timeoutMs > 120000) {
    throw new Error(`Invalid timeout: ${options.timeoutMs}`);
  }
  return options;
}

function validatedDebuggerUrl(target, port) {
  const url = new URL(target.webSocketDebuggerUrl);
  const pathIsValid = /^\/devtools\/page\/[A-Za-z0-9._-]{1,200}$/.test(url.pathname);
  if (
    url.protocol !== "ws:" || !LOOPBACK_HOSTS.has(url.hostname) || Number(url.port) !== port
    || url.username || url.password || url.search || url.hash || !pathIsValid
  ) {
    throw new Error("Rejected a CDP WebSocket URL outside the allowed loopback page endpoint shape");
  }
  return url.href;
}

export function isValidCdpTarget(item, port) {
  if (typeof item?.url !== "string" || typeof item.id !== "string" ||
      !CDP_ID_PATTERN.test(item.id) || !item.webSocketDebuggerUrl) return false;
  try {
    const pageUrl = new URL(item.url);
    const appPage = item.type === "page" && pageUrl.protocol === "app:";
    const workView = item.type === "webview" && pageUrl.origin === "https://chatgpt.com";
    if ((!appPage && !workView) || pageUrl.username || pageUrl.password) return false;
    const debuggerUrl = new URL(validatedDebuggerUrl(item, port));
    return debuggerUrl.pathname === `/devtools/page/${item.id}`;
  } catch {
    return false;
  }
}

export function detectSurface() {
  const app = location.protocol === "app:";
  const work = location.origin === "https://chatgpt.com";
  if (!app && !work) return null;
  if (app && document.querySelector('main[data-app-shell-main-surface]:not([data-app-shell-active-page="false"] *)') &&
    document.querySelector('aside.app-shell-left-panel')) return "codex";
  if (work && document.querySelector('main#main #thread') && document.querySelector('#prompt-textarea')) return "work";
  if (app && new URLSearchParams(location.search).get('initialRoute') === '/avatar-overlay' &&
    document.querySelector('.codex-avatar-root') &&
    document.querySelector('[data-avatar-overlay-native-surface-id="composer"]')) return "dot";
  return null;
}

class CdpSession {
  constructor(target, port) {
    this.target = target;
    this.ws = new WebSocket(validatedDebuggerUrl(target, port));
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.closed = false;
  }

  async open() {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        try { this.ws.close(); } catch {}
        reject(new Error("CDP WebSocket open timed out"));
      }, 5000);
      this.ws.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
      this.ws.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("CDP WebSocket open failed")); }, { once: true });
    });
    this.ws.addEventListener("message", (event) => this.onMessage(event));
    this.ws.addEventListener("error", () => this.close());
    this.ws.addEventListener("close", () => {
      this.closed = true;
      for (const waiter of this.pending.values()) {
        clearTimeout(waiter.timeout);
        waiter.reject(new Error("CDP socket closed"));
      }
      this.pending.clear();
    });
    await this.send("Runtime.enable");
    await this.send("Page.enable");
    return this;
  }

  onMessage(event) {
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      this.close();
      return;
    }
    if (!message || typeof message !== "object") {
      this.close();
      return;
    }
    if (message.id) {
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      clearTimeout(waiter.timeout);
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`${message.error.message} (${message.error.code})`));
      else waiter.resolve(message.result);
      return;
    }
    for (const listener of this.listeners.get(message.method) ?? []) {
      try { listener(message.params ?? {}); } catch (error) {
        console.error(`[dream-skin] CDP listener failed: ${error.message}`);
      }
    }
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  send(method, params = {}, timeoutMs = 10000) {
    if (this.closed) return Promise.reject(new Error("CDP session is closed"));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: false,
    });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new Error(`Renderer evaluation failed: ${detail}`);
    }
    return result.result?.value;
  }

  close() {
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error("CDP session closed"));
    }
    this.pending.clear();
    if (!this.closed) {
      try { this.ws.close(); } catch {}
    }
    this.closed = true;
  }
}

async function listAppTargets(port, signal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const targets = await response.json();
    if (!Array.isArray(targets)) throw new Error("CDP target list was not an array");
    return targets.filter((item) => isValidCdpTarget(item, port))
      .sort((left, right) => Number(left.type === "webview") - Number(right.type === "webview"));
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

async function probeSession(session) {
  return session.evaluate(`(() => {
    const surface = (${detectSurface.toString()})();
    const markers = {
      shell: Boolean(document.querySelector('main[data-app-shell-main-surface]:not([data-app-shell-active-page="false"] *)')),
      sidebar: Boolean(document.querySelector('aside.app-shell-left-panel')),
      composer: Boolean(document.querySelector('[data-composer-body]:not([data-app-shell-active-page="false"] *)')),
      main: Boolean(document.querySelector('[role="main"]')),
    };
    return {
      markers,
      surface,
      readyState: document.readyState,
      codex: Boolean(surface),
    };
  })()`);
}

async function waitForCodexProbe(session, timeoutMs = 1800) {
  const deadline = Date.now() + timeoutMs;
  let probe = null;
  while (Date.now() < deadline) {
    probe = await probeSession(session);
    if (probe?.codex) return probe;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return probe;
}

async function connectTarget(target, port) {
  return new CdpSession(target, port).open();
}

async function connectCodexTargets(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const targets = await listAppTargets(port);
      const connected = [];
      for (const target of targets) {
        let session;
        try {
          session = await connectTarget(target, port);
          const probe = await probeSession(session);
          if (probe?.codex) connected.push({ target, session, probe });
          else session.close();
        } catch (error) {
          session?.close();
          lastError = error;
        }
      }
      if (connected.length) return connected;
      lastError = new Error("No page matched the expected Codex shell markers");
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`No verified Codex renderer on 127.0.0.1:${port}: ${lastError?.message ?? "timed out"}`);
}

function assertContainedPath(rootPath, candidatePath, label) {
  const relative = path.relative(rootPath, candidatePath);
  if (
    relative === ""
    || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  ) return;
  throw new Error(`${label} must stay inside its theme directory`);
}

function videoStamp(stat) {
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Video must remain a regular file");
  return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(":");
}

export async function loadTheme(themeDir, configName = "theme.json") {
  if (path.basename(configName) !== configName) throw new Error("Theme config must be a filename inside its theme directory");
  const requestedRoot = themeDir ?? path.join(root, "assets");
  const configPath = path.join(requestedRoot, configName);
  let assetsRoot;
  let canonicalConfigPath;
  try {
    [assetsRoot, canonicalConfigPath] = await Promise.all([
      fs.realpath(requestedRoot),
      fs.realpath(configPath),
    ]);
  } catch (error) {
    if (themeDir && error.code === "ENOENT") {
      throw new Error(`Explicit theme directory is missing theme.json: ${configPath}`);
    }
    throw error;
  }
  assertContainedPath(assetsRoot, canonicalConfigPath, "Theme config");
  let config;
  try {
    config = await fs.readFile(canonicalConfigPath, "utf8");
  } catch (error) {
    if (themeDir && error.code === "ENOENT") {
      throw new Error(`Explicit theme directory is missing theme.json: ${configPath}`);
    }
    throw error;
  }
  const raw = JSON.parse(config);
  if (raw.schemaVersion !== 1 || typeof raw.image !== "string" || !raw.image) {
    throw new Error(`${configPath} has an unsupported schema or image field`);
  }
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(raw.image)) {
    throw new Error(`${configPath} has an invalid image field`);
  }
  if (path.basename(raw.image) !== raw.image) throw new Error("Theme image must stay inside its theme directory");
  const text = (value, fallback, max, name) => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value)) {
      throw new Error(`${configPath} has an invalid ${name} field`);
    }
    return value.trim() ? Array.from(value.trim()).slice(0, max).join("") : fallback;
  };
  const color = (value, fallback) => {
    if (typeof value !== "string") return fallback;
    const normalized = value.trim();
    return /^#[0-9a-f]{6}$/i.test(normalized) || /^rgba?\([0-9., %]+\)$/i.test(normalized)
      ? normalized
      : fallback;
  };
  const choice = (value, name, choices) => {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || !choices.includes(value)) {
      throw new Error(`${configPath} has an invalid ${name} field`);
    }
    return value;
  };
  const unit = (value, name) => {
    if (value === undefined) return undefined;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`${configPath} has an invalid ${name} field`);
    }
    return value;
  };
  const rawColors = raw.colors && typeof raw.colors === "object" && !Array.isArray(raw.colors)
    ? raw.colors : null;
  const colorKeys = [
    "background", "panel", "panelAlt", "accent", "accentAlt", "secondary",
    "highlight", "text", "muted", "line",
  ];
  const appearance = choice(raw.appearance, "appearance", ["auto", "light", "dark"]);
  const layout = choice(raw.layout, "layout", ["wallpaper"]);
  const maskOpacity = unit(raw.maskOpacity, "maskOpacity") ?? 0.62;
  if (raw.art !== undefined && (!raw.art || typeof raw.art !== "object" || Array.isArray(raw.art))) {
    throw new Error(`${configPath} has an invalid art field`);
  }
  const rawArt = raw.art || {};
  const art = {
    focusX: unit(rawArt.focusX, "art.focusX"),
    focusY: unit(rawArt.focusY, "art.focusY"),
    safeArea: choice(rawArt.safeArea, "art.safeArea", ["auto", "left", "right", "center", "none"]),
    taskMode: choice(rawArt.taskMode, "art.taskMode", ["auto", "ambient", "banner", "off"]),
  };
  const theme = {
    schemaVersion: 1,
    id: text(raw.id, "custom", 80, "id"),
    name: text(raw.name, "Codex Dream Skin", 80, "name"),
    brandSubtitle: text(raw.brandSubtitle, "CODEX DREAM SKIN", 80, "brandSubtitle"),
    tagline: text(raw.tagline, "Make something wonderful.", 160, "tagline"),
    projectPrefix: text(raw.projectPrefix, "选择项目 · ", 80, "projectPrefix"),
    projectLabel: text(raw.projectLabel, "◉  选择项目", 80, "projectLabel"),
    statusText: text(raw.statusText, "DREAM SKIN ONLINE", 80, "statusText"),
    quote: text(raw.quote, "MAKE SOMETHING WONDERFUL", 80, "quote"),
    image: raw.image,
    maskOpacity,
    colorMode: rawColors ? "explicit" : "auto",
    explicitColorKeys: rawColors ? colorKeys.filter((key) => Object.hasOwn(rawColors, key)) : [],
    colors: {
      background: color(rawColors?.background, "#071116"),
      panel: color(rawColors?.panel, "#0b1a20"),
      panelAlt: color(rawColors?.panelAlt, "#10272c"),
      accent: color(rawColors?.accent, "#7cff46"),
      accentAlt: color(rawColors?.accentAlt, "#b8ff3d"),
      secondary: color(rawColors?.secondary, "#36d7e8"),
      highlight: color(rawColors?.highlight, "#642a8c"),
      text: color(rawColors?.text, "#e9fff1"),
      muted: color(rawColors?.muted, "#9ebdb3"),
      line: color(rawColors?.line, "rgba(124, 255, 70, .28)"),
    },
  };
  if (appearance !== undefined) theme.appearance = appearance;
  if (layout !== undefined) theme.layout = layout;
  if (Object.values(art).some((value) => value !== undefined)) {
    theme.art = Object.fromEntries(Object.entries(art).filter(([, value]) => value !== undefined));
  }
  const requestedImagePath = path.join(assetsRoot, theme.image);
  let video = null;
  let videoSource = null;
  if (raw.video !== undefined) {
    theme.video = validateVideoName(raw.video);
    const videoPath = path.join(assetsRoot, theme.video);
    const stamp = videoStamp(await fs.lstat(videoPath));
    video = await inspectVideo(videoPath);
    if (videoStamp(await fs.lstat(videoPath)) !== stamp) throw new Error("Video changed while loading");
    videoSource = { path: videoPath, stamp, size: video.size };
  }
  let imagePath;
  try {
    imagePath = await fs.realpath(requestedImagePath);
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`Theme image is missing: ${requestedImagePath}`);
    throw error;
  }
  assertContainedPath(assetsRoot, imagePath, "Theme image");
  const imageStat = await fs.stat(imagePath);
  const extension = path.extname(theme.image).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
    throw new Error(`Unsupported theme image format: ${extension || "missing"}`);
  }
  let imageHandle;
  try {
    imageHandle = await fs.open(imagePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (error.code === "ELOOP") throw new Error("Theme image changed into a symbolic link while loading");
    throw error;
  }
  try {
    const openedStat = await imageHandle.stat();
    if (
      !imageStat.isFile()
      || !openedStat.isFile()
      || imageStat.dev !== openedStat.dev
      || imageStat.ino !== openedStat.ino
      || openedStat.size < 1
      || openedStat.size > MAX_ART_BYTES
    ) {
      throw new Error(`Theme image must be a stable non-empty file no larger than ${MAX_ART_BYTES} bytes`);
    }
    const art = await imageHandle.readFile();
    if (art.length < 1 || art.length > MAX_ART_BYTES) {
      throw new Error(`Theme image must be a non-empty file no larger than ${MAX_ART_BYTES} bytes`);
    }
    return { art, assetsRoot, extension, imagePath, raw, theme, video, videoSource };
  } finally {
    await imageHandle.close();
  }
}

async function loadStaticPayloadAssets() {
  const cacheHit = Boolean(staticPayloadAssets);
  if (!staticPayloadAssets) {
    staticPayloadAssets = Promise.all([
      fs.readFile(path.join(root, "assets", "dream-skin.css"), "utf8"),
      fs.readFile(path.join(root, "assets", "renderer-inject.js"), "utf8"),
      fs.readFile(path.join(root, "assets", "token-overlay.js"), "utf8"),
    ]).catch((error) => {
      staticPayloadAssets = null;
      throw error;
    });
  }
  const [css, template, tokenOverlay] = await staticPayloadAssets;
  return { css, template, tokenOverlay, cacheHit };
}

function invalidateStaticPayloadAssets() {
  staticPayloadAssets = null;
}

export async function loadPayload(themeDir) {
  const startedAt = performance.now();
  const [staticAssets, loaded] = await Promise.all([
    loadStaticPayloadAssets(),
    loadTheme(themeDir),
  ]);
  const { css, template, tokenOverlay } = staticAssets;
  const { art, extension, theme, video } = loaded;
  const styleRevision = createHash("sha256").update(css).digest("hex").slice(0, 20);
  const artMetadata = readImageMetadata(art, extension);
  if (!artMetadata) {
    throw new Error("Theme image metadata is invalid or exceeds the 16384px / 50MP safety limit");
  }
  const artKey = createHash("sha256").update(art).digest("hex").slice(0, 20);
  theme.artMetadata = artMetadata;
  theme.artKey = artKey;
  if (video) {
    theme.videoKey = video.key.slice(0, 20);
    theme.videoBytes = video.size;
    loaded.videoSource.key = theme.videoKey;
  }
  const mime = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg"
    : extension === ".webp" ? "image/webp" : "image/png";
  const artDataUrl = `data:${mime};base64,${art.toString("base64")}`;
  const payload = template
    .replace("__DREAM_SKIN_DETECT_SURFACE__", () => detectSurface.toString())
    .replace("__DREAM_SKIN_CSS_JSON__", () => JSON.stringify(css))
    .replace("__DREAM_SKIN_ART_JSON__", () => JSON.stringify(artDataUrl))
    .replace("__DREAM_SKIN_THEME_JSON__", () => JSON.stringify(theme))
    .replace("__DREAM_SKIN_VERSION_JSON__", () => JSON.stringify(SKIN_VERSION))
    .replace("__DREAM_SKIN_STYLE_REVISION_JSON__", () => JSON.stringify(styleRevision))
    + `;\n(${tokenOverlay})();`;
  const revision = createHash("sha256")
    .update(SKIN_VERSION)
    .update(css)
    .update(template)
    .update(tokenOverlay)
    .update(JSON.stringify(theme))
    .digest("hex")
    .slice(0, 20);
  return {
    imageBytes: art.length,
    videoBytes: video?.size ?? 0,
    videoSource: loaded.videoSource,
    payload,
    revision,
    styleRevision,
    theme,
    timings: {
      buildMs: Number((performance.now() - startedAt).toFixed(3)),
      staticCacheHit: staticAssets.cacheHit,
    },
  };
}

export async function attachVideoToSession(session, source) {
  if (!source) return;
  const checkFile = async () => {
    if (videoStamp(await fs.lstat(source.path)) !== source.stamp) throw new Error("Video changed before handoff");
  };
  await checkFile();
  const remote = await session.send("Runtime.evaluate", {
    expression: '(() => { const input = document.createElement("input"); input.type = "file"; return input; })()',
    returnByValue: false,
  });
  const objectId = remote.result?.objectId;
  if (!objectId) throw new Error("Could not create the private video file input");
  try {
    await session.send("DOM.setFileInputFiles", { objectId, files: [source.path] });
    await checkFile();
    const result = await session.send("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: `function(key) {
        const state = window.__CODEX_DREAM_SKIN_STATE__;
        if (state?.videoKey !== key) throw new Error("Video theme changed during handoff");
        return state.setVideo(this.files[0]);
      }`,
      arguments: [{ value: source.key }],
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    if (result.result?.value !== true) throw new Error("Renderer rejected the video file");
  } finally {
    await session.send("Runtime.releaseObject", { objectId }).catch(() => {});
  }
}

async function applyToSession(session, loaded) {
  await session.evaluate(loaded.payload);
  await attachVideoToSession(session, loaded.videoSource);
}

async function sendUsageSnapshot(session, threadId, snapshot) {
  await session.evaluate(`(() => {
    const overlay = window.__CODEX_DREAM_SKIN_STATE__?.usageOverlay;
    const request = overlay?.request();
    if (request?.visible && request.threadId === ${JSON.stringify(threadId)}) overlay.update(${JSON.stringify(snapshot)});
  })()`);
}

export async function updateUsageOverlay(session, reader) {
  const request = await session.evaluate('window.__CODEX_DREAM_SKIN_STATE__?.usageOverlay?.request()');
  if (!request?.visible) return;
  const snapshot = request.threadId ? await reader.read(request.threadId) : null;
  await sendUsageSnapshot(session, request.threadId, snapshot);
}

export function watchUsageOverlay(session, reader) {
  let closed = false;
  let timer = null;
  let subscription = null;
  let threadId;
  let installation;
  let lastHeartbeatAt = 0;
  let probeFailures = 0;
  let pushFailures = 0;
  const tick = async () => {
    try {
      if (session.closed) { close(); return; }
      let request;
      try {
        request = await session.evaluate('window.__CODEX_DREAM_SKIN_STATE__?.usageOverlay?.request()');
        probeFailures = 0;
      } catch (error) {
        if (++probeFailures >= 3) { session.close(); close(); }
        throw error;
      }
      if (closed) return;
      const current = request?.visible ? request.threadId : undefined;
      if (current !== threadId || request?.installation !== installation) {
        subscription?.close();
        subscription = null;
        threadId = current;
        installation = request?.installation;
        lastHeartbeatAt = performance.now();
        pushFailures = 0;
        if (threadId) {
          const active = reader.watch(threadId, async snapshot => {
            if (closed || subscription !== active) return;
            try {
              await sendUsageSnapshot(session, threadId, snapshot);
              if (subscription === active) pushFailures = 0;
            } catch (error) {
              if (!closed && subscription === active && ++pushFailures >= 3) { session.close(); close(); }
              throw error;
            }
          });
          subscription = active;
          await active.refresh(true);
        } else if (request?.visible) await sendUsageSnapshot(session, threadId, null);
      } else if (subscription && performance.now() - lastHeartbeatAt >= 5000) {
        lastHeartbeatAt = performance.now();
        await subscription.refresh(true);
      }
    } catch {}
    finally {
      if (!closed) timer = setTimeout(tick, 250);
    }
  };
  const close = () => {
    closed = true;
    clearTimeout(timer);
    subscription?.close();
    subscription = null;
  };
  tick();
  return { close };
}

async function removeFromSession(session) {
  return session.evaluate(`(() => {
    window.__CODEX_DREAM_SKIN_DISABLED__ = true;
    const state = window.__CODEX_DREAM_SKIN_STATE__;
    if (state?.cleanup) return state.cleanup();
    document.documentElement?.classList.remove('codex-dream-skin');
    document.documentElement?.style.removeProperty('--dream-skin-art');
    document.getElementById('codex-dream-skin-style')?.remove();
    document.getElementById('codex-dream-skin-chrome')?.remove();
    delete window.__CODEX_DREAM_SKIN_STATE__;
    return true;
  })()`);
}

async function verifyRemovedSession(session) {
  return session.evaluate(`(() =>
    !document.documentElement.classList.contains('codex-dream-skin') &&
    !document.getElementById('codex-dream-skin-style') &&
    !document.getElementById('codex-dream-skin-chrome') &&
    !window.__CODEX_DREAM_SKIN_STATE__
  )()`);
}

async function verifySession(session) {
  return session.evaluate(`(() => {
    const surface = window.__CODEX_DREAM_SKIN_STATE__?.surface ?? 'codex';
    const box = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        x: Math.round(r.x), y: Math.round(r.y),
        width: Math.round(r.width), height: Math.round(r.height),
        visible: r.width > 0 && r.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
      };
    };
    const page = document.querySelector('[data-app-shell-active-page="true"]') ??
      document.querySelector('main[data-app-shell-main-surface]:not([data-app-shell-active-page="false"] *)');
    const homeIndicator = page?.querySelector('[data-testid="home-icon"]');
    const homeSignal = homeIndicator ?? page?.querySelector('[data-feature="game-source"]') ??
      page?.querySelector('[class~="group/home-suggestions"]');
    const homeRoute = homeSignal?.closest('[role="main"]') ?? null;
    const home = page?.querySelector('[role="main"].dream-skin-home, [role="main"].dream-skin-video-home');
    const suggestions = home?.querySelector('[class~="group/home-suggestions"]') ?? null;
    const cardBoxes = suggestions ? [...suggestions.querySelectorAll('button')].map(box) : [];
    const visibleCards = cardBoxes.filter((item) => item?.visible);
    const hero = box(home?.firstElementChild?.firstElementChild?.firstElementChild);
    const projectButton = box(home?.querySelector('[class~="group/project-selector"] > button'));
    const mainSelector = surface === 'work' ? 'main#main' : 'main[data-app-shell-main-surface]:not([data-app-shell-active-page="false"] *)';
    const sidebarSelector = surface === 'work' ? '#stage-slideover-sidebar' : 'aside.app-shell-left-panel';
    const shell = box(document.querySelector(mainSelector));
    const composer = box(document.querySelector('[data-composer-body]:not([data-app-shell-active-page="false"] *)'));
    const sidebar = box(document.querySelector(sidebarSelector));
    const chrome = document.getElementById('codex-dream-skin-chrome');
    const videoElement = document.getElementById('codex-dream-skin-video');
    const maskStyle = getComputedStyle(document.body, '::before');
    const maskAlpha = /^rgba?\\(0,\\s*0,\\s*0(?:,\\s*([\\d.]+))?\\)$/.exec(maskStyle.backgroundColor);
    const clearSurface = (node) => !node || (
      ['rgba(0, 0, 0, 0)', 'transparent'].includes(getComputedStyle(node).backgroundColor) &&
      getComputedStyle(node).backgroundImage === 'none'
    );
    const utilityHeaders = surface === 'codex' ? [...document.querySelectorAll(
      '[data-app-shell-main-surface] :is([data-app-shell-header-layout], [data-sticky][class*="_shell_"], .sticky.z-30.bg-surface)' +
      ':not([data-app-shell-active-page="false"] *):not(:has([data-composer-body]))'
    )].filter(node => box(node)?.visible).map(node => {
      const layers = [null, '::before', '::after'].map(pseudo => {
        const style = getComputedStyle(node, pseudo);
        const painted = !pseudo || !['none', 'normal'].includes(style.content);
        return {painted, backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage !== 'none', backdropFilter: style.backdropFilter};
      });
      return {layers, clear: layers.every(layer => !layer.painted || (
        ['rgba(0, 0, 0, 0)', 'transparent'].includes(layer.backgroundColor) &&
        !layer.backgroundImage && layer.backdropFilter === 'none'
      ))};
    }) : [];
    const wallpaperMask = {
      opacity: maskAlpha ? Number(maskAlpha[1] ?? 1) : null,
      uniform: maskStyle.backgroundImage === 'none',
      fullViewport: maskStyle.position === 'fixed' &&
        ['top', 'right', 'bottom', 'left'].every(edge => maskStyle[edge] === '0px'),
      pointerEvents: maskStyle.pointerEvents,
      mainClear: clearSurface(document.querySelector(mainSelector)),
      sidebarClear: clearSurface(document.querySelector(sidebarSelector)),
      headerClear: clearSurface(document.querySelector('header.app-header-tint:not([data-app-shell-active-page="false"] *)')),
      messagingClear: [...document.querySelectorAll(mainSelector + ' .messaging-root.messaging-embedded, ' +
        mainSelector + ' .messaging-root.messaging-embedded .thread-pane')].every(clearSurface),
    };
    const dotNodes = surface === 'dot' ? [...document.querySelectorAll(
      '[data-avatar-overlay-native-surface-id="composer"], [data-avatar-overlay-native-surface-id^="activity-"]'
    )].filter(node => node.checkVisibility({visibilityProperty:true,opacityProperty:true}) && box(node)?.visible &&
      node.getBoundingClientRect().right > 0 && node.getBoundingClientRect().bottom > 0 &&
      node.getBoundingClientRect().left < innerWidth && node.getBoundingClientRect().top < innerHeight) : [];
    const clip = videoElement ? /^path\\("(.*)"\\)$/.exec(getComputedStyle(videoElement).clipPath) : null;
    const clipContext = clip ? document.createElement('canvas').getContext('2d') : null;
    const clipPath = clip ? new Path2D(clip[1]) : null;
    const videoBounds = videoElement?.getBoundingClientRect();
    const dotClipVerified = surface === 'dot' && Boolean(clipContext) && dotNodes.every(node => {
      const r = node.getBoundingClientRect();
      return clipContext.isPointInPath(clipPath,r.left+r.width/2-videoBounds.left,r.top+r.height/2-videoBounds.top);
    }) && Array.from({length:81},(_,index) => ({
      x:videoBounds.left+(index%9+0.5)*videoBounds.width/9,
      y:videoBounds.top+(Math.floor(index/9)+0.5)*videoBounds.height/9,
    })).every(point => dotNodes.some(node => {
      const r = node.getBoundingClientRect();
      return point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom;
    }) || !clipContext.isPointInPath(clipPath,point.x-videoBounds.left,point.y-videoBounds.top));
    const dotCards = dotNodes.map(node => {
      const background = getComputedStyle(node).backgroundImage;
      const alpha = /rgba?\\(0,\\s*0,\\s*0(?:,\\s*([\\d.]+))?\\)/.exec(background);
      return { poster: background.includes('blob:') && background.includes('linear-gradient'),
        video: dotClipVerified && document.documentElement.getAttribute('data-dream-video-ready') === 'true' &&
          !background.includes('blob:') && getComputedStyle(node).backgroundColor === 'rgba(0, 0, 0, 0)',
        opacity: alpha ? Number(alpha[1] ?? 1) : null };
    });
    const result = {
      surface,
      dotCards,
      dotClipVerified,
      installed: document.documentElement.classList.contains('codex-dream-skin'),
      version: window.__CODEX_DREAM_SKIN_STATE__?.version ?? null,
      themeId: window.__CODEX_DREAM_SKIN_STATE__?.themeId ?? null,
      videoKey: window.__CODEX_DREAM_SKIN_STATE__?.videoKey ?? null,
      stylePresent: Boolean(document.getElementById('codex-dream-skin-style')),
      styleRevision: document.getElementById('codex-dream-skin-style')?.dataset?.dreamSkinStyleRevision ?? null,
      utilityHeaders,
      video: window.__CODEX_DREAM_SKIN_STATE__?.videoStatus?.() ?? null,
      usageOverlay: window.__CODEX_DREAM_SKIN_STATE__?.usageOverlay?.status() ?? null,
      wallpaperLayout: Boolean(window.__CODEX_DREAM_SKIN_STATE__?.wallpaper),
      wallpaperMask,
      startupFrames: {
        maskReadyAt: window.__CODEX_DREAM_SKIN_STATE__?.metrics?.maskReadyAt ?? null,
        videoFrameReadyAt: window.__CODEX_DREAM_SKIN_STATE__?.metrics?.videoFrameReadyAt ?? null,
        documentHidden: document.hidden,
      },
      videoBox: box(videoElement),
      videoPointerEvents: videoElement ? getComputedStyle(videoElement).pointerEvents : null,
      chromePresent: Boolean(chrome),
      chromePointerEvents: getComputedStyle(chrome || document.body).pointerEvents,
      homeRoute: Boolean(homeRoute),
      homePresent: Boolean(home),
      hero,
      cards: cardBoxes,
      visibleCardCount: visibleCards.length,
      projectButton,
      shell,
      composer,
      sidebar,
      viewport: { width: innerWidth, height: innerHeight },
      documentOverflow: {
        x: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        y: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      },
    };
    const basePass = result.installed && result.version === ${JSON.stringify(SKIN_VERSION)} &&
      result.stylePresent && !result.documentOverflow.x && (surface === 'dot'
        ? clearSurface(document.body) && maskStyle.content === 'none' &&
          (dotCards.length > 0 ? dotCards.every(card => card.video || card.poster) :
            dotClipVerified && result.video?.cardsVisible === false && result.video.suspended)
        : result.chromePresent && result.chromePointerEvents === 'none' &&
          Boolean(result.shell?.visible) && (surface === 'work' || Boolean(result.sidebar?.visible)));
    // Project selector markup varies across Codex builds — soft requirement.
    const homePass = !result.homeRoute || (
      result.homePresent && (result.video || result.wallpaperLayout ? result.composer?.visible :
        result.hero?.visible && result.hero.width >= 280 && result.hero.height >= 120)
    );
    const maskPass = !result.wallpaperLayout || (
      wallpaperMask.opacity !== null && wallpaperMask.uniform && wallpaperMask.fullViewport &&
      wallpaperMask.pointerEvents === 'none' && wallpaperMask.mainClear && wallpaperMask.sidebarClear &&
      wallpaperMask.headerClear && wallpaperMask.messagingClear && utilityHeaders.every(header => header.clear)
    );
    result.pass = Boolean(basePass && homePass && maskPass && (!result.video || result.video.suspended || (result.video.ready && result.videoBox?.visible && result.videoPointerEvents === 'none')));
    result.softNotes = {
      utilityHeaderNotPresent: utilityHeaders.length === 0,
      projectButtonOptional: !result.projectButton?.visible,
      composerOptionalOnNonTaskRoutes: !result.composer?.visible,
      suggestionCardsOptional: result.homeRoute && result.visibleCardCount === 0,
    };
    return result;
  })()`);
}

export async function waitForVerifiedSession(session, timeoutMs, expectedTheme, prepareFirstFrame = false, expectedStyleRevision) {
  const deadline = Date.now() + timeoutMs;
  let lastResult;
  let previousVideoTime = null;
  let previousVideoQuality = null;
  while (Date.now() < deadline) {
    lastResult = await verifySession(session);
    // A previous, healthy background can remain visible while the next injector starts.
    lastResult.themeMatches = lastResult.themeId === expectedTheme.id
      && Boolean(lastResult.video) === Boolean(expectedTheme.video)
      && lastResult.videoKey === (expectedTheme.videoKey ?? null);
    lastResult.pass &&= lastResult.themeMatches;
    lastResult.usageDeferred = Boolean(lastResult.usageOverlay?.mounted && lastResult.startupFrames?.documentHidden === true);
    lastResult.usageHealthy = lastResult.usageDeferred || !lastResult.usageOverlay?.mounted || (
      Number.isFinite(lastResult.usageOverlay.lastReceivedAt) && lastResult.usageOverlay.availability !== "reconnecting"
    );
    lastResult.pass &&= lastResult.usageHealthy;
    if (expectedStyleRevision !== undefined) {
      lastResult.styleMatches = lastResult.styleRevision === expectedStyleRevision;
      lastResult.pass &&= lastResult.styleMatches;
    }
    if (prepareFirstFrame && expectedTheme.video &&
      !(lastResult.surface === 'work' && lastResult.video?.hostHidden === true) &&
      !(lastResult.surface === 'dot' && lastResult.video?.cardsVisible === false && lastResult.dotCards.length === 0)) {
      lastResult.pass &&= lastResult.video?.decoded === true;
    }
    if (lastResult.wallpaperLayout) {
      lastResult.maskMatches = Math.abs(lastResult.wallpaperMask.opacity - (expectedTheme.maskOpacity ?? 0.62)) < 0.005;
      lastResult.pass &&= lastResult.maskMatches;
    }
    if (lastResult.surface === 'dot') {
      if (expectedTheme.video && lastResult.dotCards.length > 0) {
        lastResult.pass &&= lastResult.dotClipVerified && lastResult.dotCards.every(card => card.video);
      }
      lastResult.maskMatches = lastResult.dotCards.every(card =>
        card.opacity !== null && Math.abs(card.opacity - (expectedTheme.maskOpacity ?? 0.62)) < 0.005);
      lastResult.pass &&= lastResult.maskMatches;
    }
    const quality = lastResult.video?.quality;
    const measurable = lastResult.themeMatches && typeof lastResult.videoKey === "string" &&
      lastResult.video?.ready === true && lastResult.video.paused === false && lastResult.video.suspended === false &&
      lastResult.videoBox?.visible === true && lastResult.startupFrames?.documentHidden === false &&
      quality && Number.isFinite(quality.sampledAtMs) && quality.sampledAtMs >= 0 &&
      Number.isSafeInteger(quality.totalFrames) && quality.totalFrames >= 0 &&
      Number.isSafeInteger(quality.droppedFrames) && quality.droppedFrames >= 0 && quality.droppedFrames <= quality.totalFrames;
    if (lastResult.video) {
      lastResult.video.playbackSample = null;
      if (measurable && previousVideoQuality?.videoKey === lastResult.videoKey) {
        const sampleMs = quality.sampledAtMs - previousVideoQuality.sampledAtMs;
        const total = quality.totalFrames - previousVideoQuality.totalFrames;
        const dropped = quality.droppedFrames - previousVideoQuality.droppedFrames;
        if (sampleMs > 0 && total > 0 && dropped >= 0 && dropped <= total) {
          lastResult.video.playbackSample = { sampleMs, presentedFps: (total - dropped) * 1000 / sampleMs,
            dropRatio: dropped / total };
        }
      }
    }
    previousVideoQuality = measurable ? { ...quality, videoKey: lastResult.videoKey } : null;
    if (lastResult.video && !lastResult.video.suspended) {
      lastResult.video.progressing = previousVideoTime !== null
        && Math.abs(lastResult.video.currentTime - previousVideoTime) > 0.001;
      previousVideoTime = lastResult.video.currentTime;
      lastResult.pass &&= lastResult.video.progressing;
    }
    if (lastResult.pass) return lastResult;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return lastResult;
}

async function capture(session, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const bestEffortInput = async (method, params) => {
    try {
      await session.send(method, params, 750);
    } catch {
      // Screenshot capture is still valid when a renderer omits the Input domain.
    }
  };
  await bestEffortInput("Input.dispatchKeyEvent", {
    type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27,
  });
  await bestEffortInput("Input.dispatchKeyEvent", {
    type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27,
  });
  const viewport = await session.evaluate("({ width: innerWidth, height: innerHeight })");
  await bestEffortInput("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: Math.round(viewport.width * 0.64),
    y: Math.round(viewport.height * 0.62),
    button: "none",
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const result = await session.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await fs.writeFile(outputPath, Buffer.from(result.data, "base64"));
}

async function runOneShot(options) {
  const usageReader = new TokenUsageReader();
  const connected = await connectCodexTargets(options.port, options.timeoutMs);
  const loaded = options.mode !== "remove" || options.reload ? await loadPayload(options.themeDir) : null;
  const results = [];
  let screenshotCaptured = false;

  for (const { target, session, probe } of connected) {
    try {
      if (options.mode === "remove") await removeFromSession(session);
      else if (options.mode === "once") await applyToSession(session, loaded);

      if (options.reload) {
        await session.send("Page.reload", { ignoreCache: true });
        await new Promise((resolve) => setTimeout(resolve, 1600));
        if (options.mode !== "remove") await applyToSession(session, loaded);
      }

      if (options.mode === "once") await updateUsageOverlay(session, usageReader);
      const result = options.mode === "remove"
        ? await verifyRemovedSession(session)
        : await waitForVerifiedSession(session, options.timeoutMs, loaded.theme, options.prepareFirstFrame, loaded.styleRevision);
      results.push({ targetId: target.id, surface: probe.surface, result });

      if (options.screenshot && !screenshotCaptured) {
        await capture(session, options.screenshot);
        screenshotCaptured = true;
      }
    } finally {
      session.close();
    }
  }

  console.log(JSON.stringify({ mode: options.mode, version: SKIN_VERSION, port: options.port, targets: results }, null, 2));
  const failed = results.length === 0 || results.some((item) => options.mode === "remove" ? item.result !== true : !item.result?.pass);
  if (failed) process.exitCode = 2;
}

export function earlyPayloadFor(payload, revision) {
  return `(() => {
    const generationKey = "__CODEX_DREAM_SKIN_EARLY_GENERATION__";
    const appliedKey = "__CODEX_DREAM_SKIN_EARLY_APPLIED__";
    const generation = ${JSON.stringify(revision)};
    window[generationKey] = generation;
    let observer = null;
    let timeout = null;
    const stop = () => {
      observer?.disconnect();
      observer = null;
      if (timeout) clearTimeout(timeout);
      timeout = null;
    };
    const install = () => {
      if (window[generationKey] !== generation) { stop(); return true; }
      if (!document.documentElement) return false;
      if (!(${detectSurface.toString()})()) return false;
      stop();
      ${payload};
      window[appliedKey] = generation;
      return true;
    };
    if (install()) return;
    if (typeof MutationObserver === "function") {
      observer = new MutationObserver(install);
      observer.observe(document.documentElement ?? document, { childList: true, subtree: true });
    }
    timeout = setTimeout(stop, 10000);
  })()`;
}

function watchPayloadSources(themeDir, onDirty) {
  const assetsRoot = path.join(root, "assets");
  const themeRoot = themeDir ?? assetsRoot;
  const watchers = [];
  const add = (directory, kind) => {
    let watcher;
    try {
      watcher = watchFs(directory, { persistent: false }, (_event, filename) => {
        const name = filename ? String(filename) : "";
        const staticChanged = directory === assetsRoot &&
          (!name || name === "dream-skin.css" || name === "renderer-inject.js" || name === "token-overlay.js");
        if (kind === "static" && !staticChanged) return;
        onDirty({ staticChanged });
      });
      watcher.on("error", (error) => {
        console.error(`[dream-skin] file watch unavailable for ${directory}: ${error.message}`);
      });
      watchers.push(watcher);
    } catch (error) {
      console.error(`[dream-skin] file watch unavailable for ${directory}: ${error.message}`);
    }
  };
  add(themeRoot, "theme");
  if (themeRoot !== assetsRoot) add(assetsRoot, "static");
  return () => watchers.forEach((watcher) => watcher.close());
}

// Follow upstream #218: brief outages reconnect quickly; sustained outages stop busy polling.
export function nextDiscoveryDelayMs(delayMs, outageMs) {
  const ceiling = outageMs >= 60000 ? 30000 : outageMs >= 10000 ? 5000 : 500;
  return Math.min(ceiling, Math.round(delayMs * 1.6));
}

export function discoveryLogIntervalMs(delayMs) {
  return Math.max(2000, Math.min(delayMs * 4, 60000));
}

async function runWatch(options) {
  const usageReader = new TokenUsageReader();
  let current = await loadPayload(options.themeDir);
  const sessions = new Map();
  const rejected = new Map();
  let stopping = false;
  let reloadTimer = null;
  let reloadChain = Promise.resolve();
  let discoveryDelayMs = 100;
  let outageStartedAt = null;
  let lastListErrorAt = 0;
  const discovery = new AbortController();
  const pause = (ms) => delay(ms, undefined, { signal: discovery.signal }).catch((error) => {
    if (!discovery.signal.aborted) throw error;
  });
  const stop = () => { stopping = true; discovery.abort(); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  const registerEarly = async (session, payload, revision) => {
    const result = await session.send("Page.addScriptToEvaluateOnNewDocument", {
      source: earlyPayloadFor(payload, revision),
    });
    return result.identifier ?? null;
  };

  const removeEarly = async (record) => {
    if (record.session.closed) return;
    if (!record.ready) await record.session.evaluate('window.__CODEX_DREAM_SKIN_EARLY_GENERATION__ = null').catch(() => {});
    if (!record.earlyScriptId) return;
    const identifier = record.earlyScriptId;
    record.earlyScriptId = null;
    await record.session.send("Page.removeScriptToEvaluateOnNewDocument", { identifier }).catch(() => {});
  };

  const refreshPayload = async () => {
    const next = await loadPayload(options.themeDir);
    if (stopping) return;
    if (next.revision === current.revision) return;
    current = next;
    for (const record of sessions.values()) {
      if (stopping) break;
      const { session } = record;
      if (session.closed) continue;
      try {
        const nextIdentifier = await registerEarly(session, current.payload, current.revision);
        if (record.earlyScriptId) {
          await session.send("Page.removeScriptToEvaluateOnNewDocument", {
            identifier: record.earlyScriptId,
          }).catch(() => {});
        }
        record.earlyScriptId = nextIdentifier;
        record.needsLoadFallback = !nextIdentifier;
        if (stopping) break;
        if (record.ready) await applyToSession(session, current);
        else await session.evaluate(earlyPayloadFor(current.payload, current.revision));
      } catch (error) {
        record.needsLoadFallback = true;
        console.error(`[dream-skin] theme refresh failed: ${error.message}`);
      }
    }
    console.log(`[dream-skin] refreshed theme ${current.theme.id} (${current.timings.buildMs}ms)`);
  };

  const queuePayloadRefresh = ({ staticChanged = false } = {}) => {
    if (stopping) return;
    if (staticChanged) invalidateStaticPayloadAssets();
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      reloadTimer = null;
      reloadChain = reloadChain.then(refreshPayload).catch((error) => {
        console.error(`[dream-skin] theme reload failed: ${error.message}`);
      });
    }, 45);
  };
  const closePayloadWatchers = watchPayloadSources(options.themeDir, queuePayloadRefresh);

  try {
    while (!stopping) {
      let targets = [];
      try {
        targets = await listAppTargets(options.port, discovery.signal);
        discoveryDelayMs = 100;
        outageStartedAt = null;
      } catch (error) {
        if (stopping) break;
        outageStartedAt ??= Date.now();
        if (Date.now() - lastListErrorAt >= discoveryLogIntervalMs(discoveryDelayMs)) {
          console.error(`[dream-skin] ${new Date().toISOString()} ${error.message}`);
          lastListErrorAt = Date.now();
        }
        await pause(discoveryDelayMs);
        discoveryDelayMs = nextDiscoveryDelayMs(discoveryDelayMs, Date.now() - outageStartedAt);
        continue;
      }
      if (stopping) break;

      const activeIds = new Set(targets.map((target) => target.id));
      for (const id of rejected.keys()) {
        if (!activeIds.has(id)) rejected.delete(id);
      }
      for (const [id, record] of sessions) {
        if (!activeIds.has(id) || record.session.closed) {
          record.usageWatcher?.close();
          record.session.close();
          sessions.delete(id);
        }
      }

      for (const target of targets) {
        if (stopping) break;
        if (sessions.get(target.id)?.ready) continue;
        if ((rejected.get(target.id) ?? 0) > Date.now()) continue;
        let record = sessions.get(target.id);
        let session = record?.session;
        try {
          if (!record) {
            session = await connectTarget(target, options.port);
            if (stopping) { session.close(); break; }
            record = { session, earlyScriptId: null, needsLoadFallback: false, ready: false, pendingAt: Date.now() };
            sessions.set(target.id, record);
            try {
              record.earlyScriptId = await registerEarly(session, current.payload, current.revision);
              if (!stopping) await session.evaluate(earlyPayloadFor(current.payload, current.revision));
            } catch (error) {
              record.needsLoadFallback = true;
              console.error(`[dream-skin] early injection unavailable: ${error.message}`);
            }
          }
          if (stopping) { await removeEarly(record); session.close(); break; }
          const probe = await probeSession(session);
          if (stopping) { await removeEarly(record); session.close(); break; }
          if (!probe?.codex) {
            // React can create the shell after document.readyState is already complete.
            if (Date.now() - record.pendingAt < 10000) continue;
            await removeEarly(record);
            session.close();
            sessions.delete(target.id);
            if (!rejected.has(target.id)) {
              console.error(`[dream-skin] rejected non-Codex app target ${target.id}`);
            }
            rejected.set(target.id, Date.now() + 5000);
            continue;
          }
          rejected.delete(target.id);
          session.on("Page.loadEventFired", () => {
            if (stopping) return;
            if (!record.needsLoadFallback && !current.videoSource) return;
            setTimeout(() => (async () => {
              if (stopping) return;
              if (!(await waitForCodexProbe(session))?.codex) return;
              if (record.needsLoadFallback) await applyToSession(session, current);
              else await attachVideoToSession(session, current.videoSource);
            })().catch((error) => {
              console.error(`[dream-skin] fallback reinject failed: ${error.message}`);
            }), 0);
          });
          const earlyApplied = await session.evaluate(
            `window.__CODEX_DREAM_SKIN_EARLY_APPLIED__ === ${JSON.stringify(current.revision)}`,
          );
          if (stopping) { await removeEarly(record); session.close(); break; }
          if (!earlyApplied) {
            await session.evaluate(
              `window.__CODEX_DREAM_SKIN_EARLY_GENERATION__ = ${JSON.stringify(`fallback:${current.revision}`)}`,
            );
            await applyToSession(session, current);
          } else {
            await attachVideoToSession(session, current.videoSource);
          }
          record.ready = true;
          record.usageWatcher = watchUsageOverlay(session, usageReader);
          console.log(`[dream-skin] injected verified ${probe.surface} target ${target.id}`);
        } catch (error) {
          record?.usageWatcher?.close();
          if (record) await removeEarly(record);
          session?.close();
          sessions.delete(target.id);
          console.error(`[dream-skin] inject failed for ${target.id}: ${error.message}`);
        }
      }
      const pending = [...sessions.values()].some(record => !record.ready);
      const pollDelay = pending ? 50 : sessions.size ? 800 : (targets.length ? 250 : 100);
      await pause(pollDelay);
    }
  } finally {
    for (const record of sessions.values()) record.usageWatcher?.close();
    discovery.abort();
    if (reloadTimer) clearTimeout(reloadTimer);
    closePayloadWatchers();
    await reloadChain.catch(() => {});
    await Promise.all([...sessions.values()].map((record) => removeEarly(record)));
    for (const record of sessions.values()) record.session.close();
  }
}

if (path.resolve(process.argv[1] || "") === path.resolve(scriptPath)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.mode === "check") {
      const loaded = await loadPayload(options.themeDir);
      console.log(JSON.stringify({
        pass: true,
        version: SKIN_VERSION,
        themeId: loaded.theme.id,
        themeName: loaded.theme.name,
        imageBytes: loaded.imageBytes,
        videoBytes: loaded.videoBytes,
        payloadBytes: Buffer.byteLength(loaded.payload),
        artMetadata: loaded.theme.artMetadata ?? null,
        timings: loaded.timings,
      }, null, 2));
    } else if (options.mode === "watch") await runWatch(options);
    else await runOneShot(options);
  } catch (error) {
    console.error(`[dream-skin] ${error.stack || error.message}`);
    process.exitCode = 1;
  }
  // A completed CDP command must not wait for idle WebSocket close handshakes.
  await Promise.all([process.stdout, process.stderr].map((stream) =>
    new Promise((resolve) => stream.write("", resolve))));
  process.exit(process.exitCode ?? 0);
}
