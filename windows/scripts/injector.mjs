import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readImageMetadata } from "./image-metadata.mjs";
import { inspectVideo, validateVideoName } from "./video-file.mjs";
import { TokenUsageReader } from "./token-usage.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const here = path.dirname(scriptPath);
const root = path.resolve(here, "..");
const SKIN_VERSION = "1.8.3";
const MAX_ART_BYTES = 16 * 1024 * 1024;
const STRONG_THEME_AUDIT_MS = 30000;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const BROWSER_ID_PATTERN = /^[A-Za-z0-9._-]{1,200}$/;

class CdpIdentityMismatchError extends Error {}

function parseArgs(argv) {
  const options = {
    port: 9335,
    mode: "watch",
    timeoutMs: 30000,
    screenshot: null,
    reload: false,
    prepareFirstFrame: false,
    browserId: null,
    themeDir: path.join(root, "assets"),
    pauseFile: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port") options.port = Number(argv[++i]);
    else if (arg === "--once") options.mode = "once";
    else if (arg === "--watch") options.mode = "watch";
    else if (arg === "--verify") options.mode = "verify";
    else if (arg === "--remove") options.mode = "remove";
    else if (arg === "--timeout-ms") options.timeoutMs = Number(argv[++i]);
    else if (arg === "--browser-id") options.browserId = argv[++i];
    else if (arg === "--theme-dir") options.themeDir = path.resolve(argv[++i]);
    else if (arg === "--pause-file") options.pauseFile = path.resolve(argv[++i]);
    else if (arg === "--screenshot") options.screenshot = path.resolve(argv[++i]);
    else if (arg === "--reload") options.reload = true;
    else if (arg === "--prepare-first-frame") options.prepareFirstFrame = true;
    else if (arg === "--self-test") options.mode = "self-test";
    else if (arg === "--check-payload") options.mode = "check-payload";
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 250 || options.timeoutMs > 120000) {
    throw new Error(`Invalid timeout: ${options.timeoutMs}`);
  }
  if (options.browserId !== null && !BROWSER_ID_PATTERN.test(options.browserId)) {
    throw new Error(`Invalid browser ID: ${options.browserId}`);
  }
  if (["watch", "once", "verify", "remove"].includes(options.mode) && !options.browserId) {
    throw new Error(`--browser-id is required in ${options.mode} mode`);
  }
  return options;
}

function validatedDebuggerUrl(target, port) {
  const url = new URL(target.webSocketDebuggerUrl);
  const pathIsValid = /^\/devtools\/(?:page|browser)\/[A-Za-z0-9._-]{1,200}$/.test(url.pathname);
  if (url.protocol !== "ws:" || !LOOPBACK_HOSTS.has(url.hostname) || Number(url.port) !== port ||
      url.username || url.password || url.search || url.hash || !pathIsValid) {
    throw new Error("Rejected a CDP WebSocket URL outside the allowed loopback endpoint shape");
  }
  return url.href;
}

function browserIdFromVersion(version, port) {
  const url = validatedDebuggerUrl(version, port);
  const parsed = new URL(url);
  const match = parsed.pathname.match(/^\/devtools\/browser\/([A-Za-z0-9._-]{1,200})$/);
  if (!match || parsed.search || parsed.hash || !BROWSER_ID_PATTERN.test(match[1])) {
    throw new Error("Rejected an invalid CDP browser identity URL");
  }
  return match[1];
}

export function isValidCdpTarget(item, port) {
  if (typeof item?.url !== "string" || typeof item.id !== "string" ||
      !BROWSER_ID_PATTERN.test(item.id) || !item.webSocketDebuggerUrl) return false;
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

export class CdpSession {
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
    if (message.id) {
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      clearTimeout(waiter.timeout);
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`${message.error.message} (${message.error.code})`));
      else waiter.resolve(message.result);
      return;
    }
    for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  send(method, params = {}) {
    if (this.closed) return Promise.reject(new Error("CDP session is closed"));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 10000);
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

class BrowserIdentityAnchor {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.closed = false;
    this.ws.addEventListener("close", () => { this.closed = true; });
    this.ws.addEventListener("error", () => {
      this.closed = true;
      try { this.ws.close(); } catch {}
    });
  }

  async open() {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.close();
        reject(new Error("CDP browser identity WebSocket open timed out"));
      }, 5000);
      this.ws.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
      this.ws.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("CDP browser identity WebSocket open failed"));
      }, { once: true });
      this.ws.addEventListener("close", () => {
        clearTimeout(timeout);
        reject(new Error("CDP browser identity WebSocket closed during startup"));
      }, { once: true });
    });
    if (this.closed) throw new Error("CDP browser identity WebSocket is already closed");
    return this;
  }

  close() {
    if (!this.closed) {
      try { this.ws.close(); } catch {}
    }
    this.closed = true;
  }
}

async function fetchCdpJson(port, resource) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(`http://127.0.0.1:${port}${resource}`, {
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function listAppTargets(port, expectedBrowserId = null) {
  const targets = await fetchCdpJson(port, "/json/list");
  if (!Array.isArray(targets)) throw new Error("CDP target list is not an array");
  if (expectedBrowserId) {
    const version = await fetchCdpJson(port, "/json/version");
    const actualBrowserId = browserIdFromVersion(version, port);
    if (actualBrowserId !== expectedBrowserId) {
      throw new CdpIdentityMismatchError(
        `CDP browser identity changed from ${expectedBrowserId} to ${actualBrowserId}`,
      );
    }
  }
  return targets.filter((item) => isValidCdpTarget(item, port))
    .sort((left, right) => Number(left.type === "webview") - Number(right.type === "webview"));
}

async function connectBrowserIdentityAnchor(port, expectedBrowserId) {
  const version = await fetchCdpJson(port, "/json/version");
  const actualBrowserId = browserIdFromVersion(version, port);
  if (actualBrowserId !== expectedBrowserId) {
    throw new CdpIdentityMismatchError(
      `CDP browser identity changed from ${expectedBrowserId} to ${actualBrowserId}`,
    );
  }
  return new BrowserIdentityAnchor(validatedDebuggerUrl(version, port)).open();
}

const THEME_CHOICES = {
  appearance: new Set(["auto", "light", "dark"]),
  safeArea: new Set(["auto", "left", "right", "center", "none"]),
  taskMode: new Set(["auto", "ambient", "banner", "off"]),
};

function normalizedUnit(value, name) {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a number between 0 and 1`);
  }
  return value;
}

function normalizedChoice(value, name, choices, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (!choices.has(value)) throw new Error(`${name} has an unsupported value: ${value}`);
  return value;
}

function normalizedText(value, name, fallback, maxLength = 120) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string" || value.length > maxLength || /[\u0000-\u001f]/.test(value)) {
    throw new Error(`${name} must be a short single-line string`);
  }
  return value;
}

const videoStamp = (stat) => `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;

async function loadTheme(themeDir) {
  const selectedThemePath = path.join(themeDir, "theme.json");
  if (!(await fs.lstat(selectedThemePath)).isFile()) throw new Error("Theme configuration must be a regular file");
  const themePath = await fs.realpath(selectedThemePath);
  // MSIX can redirect individual files while leaving the selected directory path unchanged.
  const realThemeDir = path.dirname(themePath);
  const themeText = await fs.readFile(themePath, "utf8");
  const raw = JSON.parse(themeText);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Theme root must be an object");
  }
  const image = normalizedText(raw.image, "image", null, 240);
  if (!image || path.isAbsolute(image)) throw new Error("Theme image must be a relative path");
  const imagePath = path.resolve(realThemeDir, image);
  const relativeImage = path.relative(realThemeDir, imagePath);
  if (!relativeImage || relativeImage.startsWith("..") || path.isAbsolute(relativeImage)) {
    throw new Error("Theme image must remain inside the selected theme directory");
  }
  const extension = path.extname(imagePath).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
    throw new Error(`Unsupported theme image format: ${extension || "missing"}`);
  }
  const realImagePath = await fs.realpath(imagePath);
  const realRelativeImage = path.relative(realThemeDir, realImagePath);
  if (!realRelativeImage || realRelativeImage.startsWith("..") || path.isAbsolute(realRelativeImage)) {
    throw new Error("Theme image cannot escape through a link or junction");
  }
  const art = raw.art && typeof raw.art === "object" && !Array.isArray(raw.art) ? raw.art : {};
  const colors = raw.colors && typeof raw.colors === "object" && !Array.isArray(raw.colors) ? raw.colors : null;
  const defaults = { background: '#071116', panel: '#0b1a20', panelAlt: '#10272c', accent: '#7cff46',
    accentAlt: '#b8ff3d', secondary: '#36d7e8', highlight: '#642a8c', text: '#e9fff1', muted: '#9ebdb3', line: 'rgba(124, 255, 70, .28)' };
  if (raw.maskOpacity !== undefined && (typeof raw.maskOpacity !== "number" ||
    !Number.isFinite(raw.maskOpacity) || raw.maskOpacity < 0 || raw.maskOpacity > 1)) {
    throw new Error("maskOpacity must be a number between 0 and 1");
  }
  const theme = {
    schemaVersion: 1,
    id: normalizedText(raw.id, "id", "custom", 80),
    name: normalizedText(raw.name, "name", "Codex Dream Skin", 120),
    brandSubtitle: normalizedText(raw.brandSubtitle, 'brandSubtitle', 'CODEX DREAM SKIN', 80),
    tagline: normalizedText(raw.tagline, 'tagline', 'Make something wonderful.', 160),
    projectPrefix: normalizedText(raw.projectPrefix, 'projectPrefix', '选择项目 · ', 80),
    projectLabel: normalizedText(raw.projectLabel, 'projectLabel', '◉  选择项目', 80),
    statusText: normalizedText(raw.statusText, 'statusText', 'DREAM SKIN ONLINE', 80),
    quote: normalizedText(raw.quote, 'quote', 'MAKE SOMETHING WONDERFUL', 80),
    image,
    layout: normalizedChoice(raw.layout, "layout", new Set(["adaptive", "wallpaper"]), "adaptive"),
    maskOpacity: normalizedUnit(raw.maskOpacity, "maskOpacity") ?? 0.62,
    appearance: normalizedChoice(raw.appearance, "appearance", THEME_CHOICES.appearance, "auto"),
    art: {
      focusX: normalizedUnit(art.focusX, "art.focusX"),
      focusY: normalizedUnit(art.focusY, "art.focusY"),
      safeArea: normalizedChoice(art.safeArea, "art.safeArea", THEME_CHOICES.safeArea, "auto"),
      taskMode: normalizedChoice(art.taskMode, "art.taskMode", THEME_CHOICES.taskMode, "auto"),
    },
    colorMode: colors ? 'explicit' : 'auto',
    explicitColorKeys: colors ? Object.keys(defaults).filter(key => Object.hasOwn(colors, key)) : [],
    colors: Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
      const value = typeof colors?.[key] === 'string' ? colors[key].trim() : '';
      return [key, /^(?:#[0-9a-f]{6}|rgba?\([0-9., %]+\))$/i.test(value) ? value : fallback];
    })),
  };
  const [themeStat, imageStat] = await Promise.all([fs.stat(themePath), fs.stat(realImagePath)]);
  if (!imageStat.isFile()) throw new Error("Theme image is not a file");
  if (imageStat.size < 1) throw new Error("Theme image cannot be empty");
  if (imageStat.size > MAX_ART_BYTES) {
    throw new Error(`Theme image exceeds the ${MAX_ART_BYTES / 1024 / 1024} MB limit`);
  }
  const imageBytes = await fs.readFile(realImagePath);
  if (imageBytes.length < 1 || imageBytes.length > MAX_ART_BYTES) {
    throw new Error(`Theme image must be between 1 byte and ${MAX_ART_BYTES / 1024 / 1024} MB`);
  }
  const artMetadata = readImageMetadata(imageBytes, extension);
  if (!artMetadata) {
    throw new Error("Theme image metadata is invalid or exceeds the 16384px / 50MP safety limit");
  }
  theme.artMetadata = artMetadata;
  let videoSource = null;
  if (raw.video !== undefined) {
    theme.video = validateVideoName(raw.video);
    const videoPath = path.join(realThemeDir, theme.video);
    const stat = await fs.lstat(videoPath);
    if (stat.isSymbolicLink() || path.dirname(await fs.realpath(videoPath)) !== realThemeDir) {
      throw new Error("Theme video cannot escape through a link or junction");
    }
    const video = await inspectVideo(videoPath);
    if (videoStamp(await fs.lstat(videoPath)) !== videoStamp(stat)) throw new Error("Video changed while being read");
    theme.videoKey = video.key;
    theme.videoBytes = video.size;
    videoSource = { path: videoPath, stamp: videoStamp(stat), key: theme.videoKey };
  }
  const fingerprint = createHash("sha256")
    .update(themeText, "utf8")
    .update("\0")
    .update(imageBytes)
    .update(theme.videoKey ?? "")
    .digest("hex");
  return {
    theme,
    themePath,
    imagePath: realImagePath,
    imageBytes,
    videoSource,
    fingerprint,
    sourceStamp: `${themeStat.size}:${themeStat.mtimeMs}:${imageStat.size}:${imageStat.mtimeMs}:${videoSource?.stamp ?? ""}`,
  };
}

export async function loadPayload(themeDir = path.join(root, "assets"), candidateTheme = null) {
  const loadedTheme = candidateTheme ?? await loadTheme(themeDir);
  const [css, template, tokenOverlay] = await Promise.all([
    fs.readFile(path.join(root, "assets", "dream-skin.css"), "utf8"),
    fs.readFile(path.join(root, "assets", "renderer-inject.js"), "utf8"),
    fs.readFile(path.join(root, "assets", "token-overlay.js"), "utf8"),
  ]);
  const extension = path.extname(loadedTheme.imagePath).toLowerCase();
  const mime = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg"
    : extension === ".webp" ? "image/webp" : "image/png";
  const artDataUrl = `data:${mime};base64,${loadedTheme.imageBytes.toString("base64")}`;
  loadedTheme.theme.artKey = createHash("sha256").update(loadedTheme.imageBytes).digest("hex").slice(0, 20);
  const styleRevision = createHash("sha256").update(css).digest("hex").slice(0, 20);
  const payload = template
    .replace("__DREAM_SKIN_DETECT_SURFACE__", () => detectSurface.toString())
    .replace("__DREAM_SKIN_CSS_JSON__", () => JSON.stringify(css))
    .replace("__DREAM_SKIN_ART_JSON__", () => JSON.stringify(artDataUrl))
    .replace("__DREAM_SKIN_THEME_JSON__", () => JSON.stringify(loadedTheme.theme))
    .replace("__DREAM_SKIN_VERSION_JSON__", () => JSON.stringify(SKIN_VERSION))
    .replace("__DREAM_SKIN_STYLE_REVISION_JSON__", () => JSON.stringify(styleRevision))
    + `;\n(${tokenOverlay})();`;
  const { imageBytes: _imageBytes, ...themeState } = loadedTheme;
  return { ...themeState, payload, styleRevision };
}

async function fileExists(filePath) {
  if (!filePath) return false;
  try {
    return (await fs.stat(filePath)).isFile();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function readThemeSourceStamp(loadedTheme) {
  const [themeStat, imageStat] = await Promise.all([
    fs.stat(loadedTheme.themePath),
    fs.stat(loadedTheme.imagePath),
  ]);
  const stamp = loadedTheme.videoSource ? videoStamp(await fs.lstat(loadedTheme.videoSource.path)) : "";
  return `${themeStat.size}:${themeStat.mtimeMs}:${imageStat.size}:${imageStat.mtimeMs}:${stamp}`;
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
      title: document.title,
      href: location.href,
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
    try {
      probe = await probeSession(session);
      if (probe?.codex) return probe;
    } catch {
      // The renderer may be between documents while the early payload waits.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return probe;
}

async function connectTarget(target, port) {
  return new CdpSession(target, port).open();
}

async function connectCodexTargets(port, timeoutMs, expectedBrowserId) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const targets = await listAppTargets(port, expectedBrowserId);
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
      if (error instanceof CdpIdentityMismatchError) throw error;
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`No verified Codex renderer on 127.0.0.1:${port}: ${lastError?.message ?? "timed out"}`);
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
    if (result.exceptionDetails || result.result?.value !== true) {
      const detail = result.exceptionDetails?.exception?.description ?? result.exceptionDetails?.text;
      throw new Error(`Renderer rejected the video file${detail ? `: ${detail}` : ""}`);
    }
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
      const root = document.documentElement;
      if (!root || !document.body) return false;
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

async function registerEarlyPayload(session, payload, revision) {
  const result = await session.send("Page.addScriptToEvaluateOnNewDocument", {
    source: earlyPayloadFor(payload, revision),
  });
  return result.identifier ?? null;
}

async function removeEarlyPayload(session, identifier) {
  if (!identifier || session.closed) return;
  await session.send("Page.removeScriptToEvaluateOnNewDocument", { identifier }).catch(() => {});
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
  while (Date.now() < deadline) {
    lastResult = await verifySession(session);
    // A previous, healthy background can remain visible while the next injector starts.
    lastResult.themeMatches = lastResult.themeId === expectedTheme.id
      && Boolean(lastResult.video) === Boolean(expectedTheme.video)
      && lastResult.videoKey === (expectedTheme.videoKey ?? null);
    lastResult.pass &&= lastResult.themeMatches;
    lastResult.usageHealthy = !lastResult.usageOverlay?.mounted || (
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
  await session.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  const viewport = await session.evaluate("({ width: innerWidth, height: innerHeight })");
  await session.send("Input.dispatchMouseEvent", {
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
  const connected = await connectCodexTargets(options.port, options.timeoutMs, options.browserId);
  const loadedPayload = options.mode !== "remove"
    ? await loadPayload(options.themeDir) : null;
  const results = [];
  let screenshotCaptured = false;
  try {
    for (const { target, session, probe } of connected) {
      try {
        if (options.mode === "remove") await removeFromSession(session);
        else if (options.mode === "once") await applyToSession(session, loadedPayload);
        if (options.mode === "once") {
          await new Promise((resolve) => setTimeout(resolve, 850));
        }
        if (options.reload) {
          await session.send("Page.reload", { ignoreCache: true });
          await new Promise((resolve) => setTimeout(resolve, 1600));
          if (options.mode !== "remove") await applyToSession(session, loadedPayload);
        }
        if (options.mode === "once") await updateUsageOverlay(session, usageReader);
        const verified = options.mode === "remove"
          ? await verifyRemovedSession(session)
          : await waitForVerifiedSession(session, options.timeoutMs, loadedPayload.theme, options.prepareFirstFrame, loadedPayload.styleRevision);
        results.push({ targetId: target.id, markers: probe.markers, result: verified });
        if (options.screenshot && !screenshotCaptured) {
          await capture(session, options.screenshot);
          screenshotCaptured = true;
        }
      } finally {
        session.close();
      }
    }
  } finally {
    for (const { session } of connected) session.close();
  }
  console.log(JSON.stringify({ mode: options.mode, port: options.port, targets: results }, null, 2));
  const failed = results.length === 0 || results.some((item) =>
    options.mode === "remove" ? item.result !== true : !item.result?.pass);
  if (failed) process.exitCode = 2;
}

async function runWatch(options) {
  const usageReader = new TokenUsageReader();
  const usageWatchers = new Map();
  const identityAnchor = await connectBrowserIdentityAnchor(options.port, options.browserId);
  const sessions = new Map();
  const earlyScripts = new Map();
  const fallbackTargets = new Map();
  const fallbackListeners = new Set();
  const pendingTargets = new Map();
  const targetFailures = new Map();
  let stopping = false;
  let listFailures = 0;
  let lastListErrorLogAt = 0;
  let lastThemeErrorLogAt = 0;
  let lastStrongThemeAuditAt = 0;
  let loadedPayload = null;
  let paused = false;
  const stop = () => { stopping = true; };
  const discardPending = async (id) => {
    const pending = pendingTargets.get(id);
    if (!pending) return;
    pendingTargets.delete(id);
    await pending.session.evaluate('window.__CODEX_DREAM_SKIN_EARLY_GENERATION__ = null').catch(() => {});
    await removeEarlyPayload(pending.session, pending.earlyScriptId);
    pending.session.close();
  };
  const rejectTarget = (target, baseDelayMs, error = null) => {
    const previous = targetFailures.get(target.id) ?? { failures: 0, lastLogAt: 0 };
    const failures = previous.failures + 1;
    const delayMs = Math.min(30000, baseDelayMs * (2 ** Math.min(failures - 1, 4)));
    const now = Date.now();
    if (error && (failures === 1 || now - previous.lastLogAt >= 30000)) {
      console.error(`[dream-skin] inject failed for ${target.id}: ${error.message}; retrying in ${delayMs}ms`);
      previous.lastLogAt = now;
    }
    targetFailures.set(target.id, { failures, lastLogAt: previous.lastLogAt, until: now + delayMs });
  };
  const attachLoadFallback = (id, target, session) => {
    if (fallbackListeners.has(id)) return;
    fallbackListeners.add(id);
    let lastReinjectErrorLogAt = 0;
    session.on("Page.loadEventFired", () => {
      if (!fallbackTargets.get(id) && !loadedPayload.videoSource) return;
      setTimeout(() => {
        const operation = waitForCodexProbe(session, 10000).then((probe) => {
          if (!probe?.codex) throw new Error("Codex shell was not ready after reload");
          return paused ? removeFromSession(session) : applyToSession(session, loadedPayload);
        });
        operation.catch((error) => {
          if (Date.now() - lastReinjectErrorLogAt >= 30000) {
            console.error(`[dream-skin] reinject failed for ${target.id}: ${error.message}`);
            lastReinjectErrorLogAt = Date.now();
          }
        });
      }, 250);
    });
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  try {
    loadedPayload = await loadPayload(options.themeDir);
    lastStrongThemeAuditAt = Date.now();
    paused = await fileExists(options.pauseFile);
    while (!stopping) {
      if (identityAnchor.closed) {
        console.error("[dream-skin] original CDP browser identity closed; watcher is stopping instead of reconnecting");
        process.exitCode = 3;
        break;
      }
      let targets = [];
      try {
        targets = await listAppTargets(options.port);
        listFailures = 0;
      } catch (error) {
        listFailures += 1;
        const retryMs = Math.min(10000, 1000 * (2 ** Math.min(listFailures - 1, 4)));
        if (listFailures === 1 || Date.now() - lastListErrorLogAt >= 30000) {
          console.error(`[dream-skin] ${new Date().toISOString()} ${error.message}; retrying in ${retryMs}ms`);
          lastListErrorLogAt = Date.now();
        }
        await new Promise((resolve) => setTimeout(resolve, retryMs));
        continue;
      }

      const nextPaused = await fileExists(options.pauseFile);
      let nextPayload = loadedPayload;
      if (!nextPaused) {
        try {
          const now = Date.now();
          let shouldAudit = !loadedPayload || now - lastStrongThemeAuditAt >= STRONG_THEME_AUDIT_MS;
          if (!shouldAudit) {
            try {
              shouldAudit = await readThemeSourceStamp(loadedPayload) !== loadedPayload.sourceStamp;
            } catch {
              shouldAudit = true;
            }
          }
          if (shouldAudit) {
            const candidateTheme = await loadTheme(options.themeDir);
            lastStrongThemeAuditAt = now;
            if (!loadedPayload || candidateTheme.fingerprint !== loadedPayload.fingerprint) {
              nextPayload = await loadPayload(options.themeDir, candidateTheme);
            } else {
              loadedPayload.sourceStamp = candidateTheme.sourceStamp;
            }
          }
        } catch (error) {
          if (Date.now() - lastThemeErrorLogAt >= 30000) {
            console.error(`[dream-skin] theme update rejected: ${error.message}; keeping the active theme`);
            lastThemeErrorLogAt = Date.now();
          }
        }
      }
      const pauseChanged = nextPaused !== paused;
      const payloadChanged = !nextPaused && nextPayload !== loadedPayload;
      loadedPayload = nextPayload;
      paused = nextPaused;

      if (pauseChanged || payloadChanged) {
        for (const watcher of usageWatchers.values()) watcher.close();
        usageWatchers.clear();
        for (const id of pendingTargets.keys()) await discardPending(id);
        for (const [id, session] of sessions) {
          try {
            const previousEarlyScript = earlyScripts.get(id);
            if (paused) {
              await removeFromSession(session);
              await removeEarlyPayload(session, previousEarlyScript);
              earlyScripts.delete(id);
              fallbackTargets.delete(id);
              fallbackListeners.delete(id);
            } else {
              let nextEarlyScript = null;
              try {
                nextEarlyScript = await registerEarlyPayload(
                  session,
                  loadedPayload.payload,
                  loadedPayload.fingerprint,
                );
                if (!nextEarlyScript) throw new Error("CDP did not return an early-script identifier");
                fallbackTargets.set(id, false);
              } catch (error) {
                fallbackTargets.set(id, true);
                console.error(`[dream-skin] early theme refresh unavailable for ${id}: ${error.message}`);
                attachLoadFallback(id, { id }, session);
              }
              if (nextEarlyScript) earlyScripts.set(id, nextEarlyScript);
              else earlyScripts.delete(id);
              await removeEarlyPayload(session, previousEarlyScript);
              await applyToSession(session, loadedPayload);
            }
          } catch (error) {
            console.error(`[dream-skin] live theme update failed for ${id}: ${error.message}`);
            await removeEarlyPayload(session, earlyScripts.get(id));
            earlyScripts.delete(id);
            fallbackTargets.delete(id);
            fallbackListeners.delete(id);
            session.close();
            sessions.delete(id);
          }
        }
        console.log(paused ? "[dream-skin] paused" : `[dream-skin] active theme ${loadedPayload.theme.id}`);
      }

      const activeIds = new Set(targets.map((target) => target.id));
      for (const id of targetFailures.keys()) {
        if (!activeIds.has(id)) targetFailures.delete(id);
      }
      for (const [id, pending] of pendingTargets) {
        if (!activeIds.has(id) || pending.session.closed) await discardPending(id);
      }
      for (const [id, session] of sessions) {
        if (!activeIds.has(id) || session.closed) {
          usageWatchers.get(id)?.close();
          usageWatchers.delete(id);
          await removeEarlyPayload(session, earlyScripts.get(id));
          earlyScripts.delete(id);
          fallbackTargets.delete(id);
          fallbackListeners.delete(id);
          session.close();
          sessions.delete(id);
          targetFailures.delete(id);
        }
      }

      for (const target of targets) {
        if (stopping || identityAnchor.closed) break;
        if (sessions.has(target.id)) continue;
        if ((targetFailures.get(target.id)?.until ?? 0) > Date.now()) continue;
        let pending = pendingTargets.get(target.id);
        let session = pending?.session;
        let earlyScriptId = pending?.earlyScriptId ?? null;
        try {
          let earlyInjectionFallback = pending?.fallback ?? false;
          if (!pending) {
            session = await connectTarget(target, options.port);
            if (identityAnchor.closed) throw new CdpIdentityMismatchError("Original CDP browser identity closed");
            if (!paused) {
              try {
                earlyScriptId = await registerEarlyPayload(
                  session,
                  loadedPayload.payload,
                  loadedPayload.fingerprint,
                );
                if (!earlyScriptId) throw new Error("CDP did not return an early-script identifier");
                await session.evaluate(earlyPayloadFor(loadedPayload.payload, loadedPayload.fingerprint));
              } catch (error) {
                await removeEarlyPayload(session, earlyScriptId);
                earlyScriptId = null;
                earlyInjectionFallback = true;
                console.error(`[dream-skin] early injection unavailable for ${target.id}: ${error.message}`);
              }
            }
            pending = { session, earlyScriptId, fallback: earlyInjectionFallback, startedAt: Date.now() };
            pendingTargets.set(target.id, pending);
          }
          if (stopping || identityAnchor.closed) break;
          const probe = await probeSession(session);
          if (!probe?.codex) {
            // React can create a native Work shell after document loading completes.
            if (Date.now() - pending.startedAt < 10000) continue;
            await discardPending(target.id);
            rejectTarget(target, 5000);
            continue;
          }
          fallbackTargets.set(target.id, earlyInjectionFallback);
          attachLoadFallback(target.id, target, session);
          if (identityAnchor.closed) throw new CdpIdentityMismatchError("Original CDP browser identity closed");
          let earlyApplied = false;
          if (!paused && !earlyInjectionFallback) {
            earlyApplied = await session.evaluate(
              `window.__CODEX_DREAM_SKIN_EARLY_APPLIED__ === ${JSON.stringify(loadedPayload.fingerprint)}`,
            ).catch(() => false);
          }
          if (paused) await removeFromSession(session);
          else if (!earlyApplied) await applyToSession(session, loadedPayload);
          else await attachVideoToSession(session, loadedPayload.videoSource);
          sessions.set(target.id, session);
          pendingTargets.delete(target.id);
          if (earlyScriptId) earlyScripts.set(target.id, earlyScriptId);
          targetFailures.delete(target.id);
          console.log(`[dream-skin] injected target ${target.id}`);
        } catch (error) {
          if (pendingTargets.has(target.id)) await discardPending(target.id);
          else {
            await removeEarlyPayload(session, earlyScriptId);
            session?.close();
          }
          fallbackTargets.delete(target.id);
          fallbackListeners.delete(target.id);
          if (identityAnchor.closed || error instanceof CdpIdentityMismatchError) break;
          rejectTarget(target, 2500, error);
        }
      }
      if (!paused) for (const [id, session] of sessions) {
        if (!usageWatchers.has(id)) usageWatchers.set(id, watchUsageOverlay(session, usageReader));
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  } finally {
    for (const watcher of usageWatchers.values()) watcher.close();
    usageWatchers.clear();
    identityAnchor.close();
    for (const id of pendingTargets.keys()) await discardPending(id);
    for (const [id, session] of sessions) {
      await removeEarlyPayload(session, earlyScripts.get(id));
      session.close();
    }
    earlyScripts.clear();
    fallbackTargets.clear();
    fallbackListeners.clear();
  }
}

if (path.resolve(process.argv[1] || "") === path.resolve(scriptPath)) {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === "self-test") {
  const valid = validatedDebuggerUrl({ webSocketDebuggerUrl: `ws://127.0.0.1:${options.port}/devtools/page/test` }, options.port);
  const browserId = browserIdFromVersion({
    webSocketDebuggerUrl: `ws://127.0.0.1:${options.port}/devtools/browser/test-browser`,
  }, options.port);
  const invalid = [
    "ws://example.com/devtools/page/test",
    `ws://127.0.0.1:${options.port + 1}/devtools/page/test`,
    `wss://127.0.0.1:${options.port}/devtools/page/test`,
    `ws://user@127.0.0.1:${options.port}/devtools/page/test`,
    `ws://127.0.0.1:${options.port}/unexpected/test`,
    `ws://127.0.0.1:${options.port}/devtools/page/test?query=1`,
  ];
  for (const value of invalid) {
    let rejected = false;
    try { validatedDebuggerUrl({ webSocketDebuggerUrl: value }, options.port); } catch { rejected = true; }
    if (!rejected) throw new Error(`CDP URL validation accepted an unsafe URL: ${value}`);
  }
  const invalidBrowserUrls = [
    `ws://127.0.0.1:${options.port}/devtools/page/not-a-browser`,
    `ws://127.0.0.1:${options.port}/devtools/browser/bad%20id`,
    `ws://127.0.0.1:${options.port}/devtools/browser/test?query=1`,
  ];
  for (const value of invalidBrowserUrls) {
    let rejected = false;
    try { browserIdFromVersion({ webSocketDebuggerUrl: value }, options.port); } catch { rejected = true; }
    if (!rejected) throw new Error(`Browser identity validation accepted an unsafe URL: ${value}`);
  }
  const validPageTarget = {
    id: "page-test",
    type: "page",
    url: "app://codex/",
    webSocketDebuggerUrl: `ws://127.0.0.1:${options.port}/devtools/page/page-test`,
  };
  const invalidPageTargets = [
    { ...validPageTarget, webSocketDebuggerUrl: `ws://127.0.0.1:${options.port}/devtools/browser/page-test` },
    { ...validPageTarget, id: "other-page" },
    { ...validPageTarget, id: 123 },
    { ...validPageTarget, type: "other" },
  ];
  if (!valid || browserId !== "test-browser" || !isValidCdpTarget(validPageTarget, options.port) ||
      invalidPageTargets.some((item) => isValidCdpTarget(item, options.port))) {
    throw new Error("CDP URL and target validation self-test failed");
  }
  console.log(JSON.stringify({ pass: true, version: SKIN_VERSION, test: "loopback-cdp-validation" }));
  } else if (options.mode === "check-payload") {
    const loaded = await loadPayload(options.themeDir);
    const unresolved = ["__DREAM_SKIN_CSS_JSON__", "__DREAM_SKIN_ART_JSON__", "__DREAM_SKIN_THEME_JSON__", "__DREAM_SKIN_VERSION_JSON__", "__DREAM_SKIN_STYLE_REVISION_JSON__"]
      .some((placeholder) => loaded.payload.includes(placeholder));
    if (unresolved) {
      throw new Error("Payload placeholders were not fully replaced");
    }
    console.log(JSON.stringify({
      pass: true,
      version: SKIN_VERSION,
      payloadBytes: Buffer.byteLength(loaded.payload),
      themeId: loaded.theme.id,
      appearance: loaded.theme.appearance,
      art: loaded.theme.art,
      artMetadata: loaded.theme.artMetadata ?? null,
    }));
  } else if (options.mode === "watch") await runWatch(options);
  else await runOneShot(options);
}
