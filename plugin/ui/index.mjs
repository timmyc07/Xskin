import { App, applyDocumentTheme, applyHostStyleVariables } from "@modelcontextprotocol/ext-apps";
import { version } from "../package.json";
import { createStudioController } from "./controller.mjs";
import { releaseVideo, mediaIdentity, createMediaPreviews } from "./media.mjs";
import { translate } from "./strings.mjs";

const app = new App({ name: "Xskin", version }, {}, { strict: true });
const previews = createMediaPreviews(app);
const elements = Object.fromEntries([...document.querySelectorAll("[id]")].map(node => [node.id, node]));
let connected = false;
let connectionFailed = false;
let disposed = false;
let draftOpacity = null;
let currentPreview = null;
let previewController = null;
let previewUrl = null;
let previewLoading = false;
let previewProgress = 0;
let backgroundIdentity = null;
let backgroundController = null;
let backgroundUrl = null;
let backgroundFailed = false;
const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
let busyFocus = null;
let wasBusy = false;
const controller = createStudioController(app, render);
const language = () => controller.view.state?.language ?? "en";
const t = key => translate(key, language());

function releasePreview() {
  previewController?.release();
  previewController = null;
  releaseVideo(elements.video);
  elements.image.removeAttribute("src");
  previewUrl = null;
  previewLoading = false;
}

function releaseBackground() {
  backgroundController?.release();
  backgroundController = null;
  releaseVideo(elements["background-video"]);
  elements["background-image"].removeAttribute("src");
  backgroundUrl = null;
  backgroundIdentity = null;
  backgroundFailed = false;
  elements["studio-background"].hidden = true;
}

function backgroundPlayback() {
  const video = elements["background-video"];
  if (disposed || document.hidden || motion.matches || backgroundFailed || video.hidden || !video.hasAttribute("src")) video.pause();
  else if (video.paused) video.play().catch(() => {});
}

function renderBackground(state) {
  if (controller.view.busy === "xskin_status") return;
  const media = state?.active;
  const identity = media?.applied && !document.hidden ? mediaIdentity(media) : null;
  if (identity !== backgroundIdentity) {
    releaseBackground();
    backgroundIdentity = identity;
    if (identity) {
      const operation = previews.acquire(media);
      backgroundController = operation;
      operation.promise.then(url => {
        if (disposed || backgroundController !== operation) return;
        backgroundUrl = url;
        render(controller.view);
      }).catch(() => {
        if (disposed || backgroundController !== operation) return;
        backgroundFailed = true;
        render(controller.view);
      });
    }
  }
  const url = backgroundUrl;
  const node = elements[media?.kind === "video" ? "background-video" : "background-image"];
  if (url && node.src !== url) node.src = url;
  elements["background-video"].hidden = !url || media?.kind !== "video";
  elements["background-image"].hidden = !url || media?.kind !== "image";
  elements["studio-background"].hidden = !identity || !url;
  elements["background-mask"].style.opacity = String(state?.maskOpacity ?? .62);
  elements["background-error"].hidden = !backgroundFailed;
  backgroundPlayback();
}

function startPreview(media, identity) {
  releasePreview();
  currentPreview = identity;
  elements["preview-error"].hidden = true;
  previewProgress = 0;
  if (!identity || document.hidden) return;
  const operation = previews.acquire(media, progress => {
    if (previewController !== operation || disposed) return;
    previewProgress = progress;
    elements["preview-status"].textContent = `${t("loadingPreview")} ${progress}%`;
  });
  previewController = operation;
  previewLoading = true;
  operation.promise.then(url => {
    if (disposed || previewController !== operation) return;
    previewUrl = url;
    previewLoading = false;
    elements[media.kind === "video" ? "video" : "image"].src = url;
    render(controller.view);
  }).catch(() => {
    if (disposed || previewController !== operation) return;
    previewLoading = false;
    elements["preview-error"].hidden = false;
    render(controller.view);
  });
}

function renderMedia(state) {
  const media = state?.selection ?? state?.active;
  const identity = mediaIdentity(media);
  if (controller.view.busy !== "xskin_status" &&
    (identity !== currentPreview || (identity && !previewController && !document.hidden))) startPreview(media, identity);
  elements.image.hidden = !previewUrl || media?.kind !== "image";
  elements.video.hidden = !previewUrl || media?.kind !== "video";
  elements.empty.hidden = Boolean(media);
  elements["preview-mask"].hidden = !previewUrl;
  elements["preview-mask"].style.opacity = String(draftOpacity ?? state?.maskOpacity ?? .62);
  elements["video-hint"].hidden = !media || media.kind !== "video";
  elements["preview-status"].hidden = !previewLoading;
  elements["preview-status"].textContent = previewLoading ? `${t("loadingPreview")} ${previewProgress}%` : "";
  if (media && (!identity || media.previewError)) elements["preview-error"].hidden = false;
  elements.image.alt = t("previewAlt");
  elements.video.setAttribute("aria-label", t("previewAlt"));
  elements["media-name"].textContent = media?.name ?? "";
  elements.badge.hidden = !media;
  elements.badge.textContent = state?.selection ? t("pending") : state?.active?.applied ? t("active") : t("saved");
  elements["media-details"].textContent = media
    ? `${t(media.kind === "video" ? "video" : "image")} · ${new Intl.NumberFormat(language(), { maximumFractionDigits: 1 }).format((Number.isFinite(media.bytes) ? media.bytes : 0) / 1048576)} MiB` : "";
  if (!elements["preview-error"].hidden) elements["preview-error"].textContent = t("previewError");
}

function render(view) {
  if (disposed) return;
  const { state, busy, error, notice } = view;
  if (busy && !wasBusy && document.activeElement?.matches("button, select, input")) busyFocus = document.activeElement;
  wasBusy = Boolean(busy);
  document.documentElement.lang = language();
  for (const node of document.querySelectorAll("[data-text]")) node.textContent = t(node.dataset.text);
  elements.version.textContent = version;
  elements.studio.setAttribute("aria-busy", String(Boolean(busy) || (!connected && !connectionFailed)));
  elements.language.value = language();
  elements.language.disabled = !connected || Boolean(busy) || Boolean(state?.pendingRecovery);
  elements.refresh.disabled = !connected || Boolean(busy);
  elements.choose.disabled = !connected || Boolean(busy) || Boolean(state?.pendingRecovery);
  elements.apply.disabled = !connected || Boolean(busy) || !state?.selection || Boolean(state.pendingRecovery);
  elements.settings.disabled = !connected || Boolean(busy) || !state?.active || Boolean(state.needsSetup) || Boolean(state.pendingRecovery);
  elements.pause.disabled = elements.settings.disabled || !state?.active?.applied;
  elements.pause.hidden = !state?.active?.applied;
  elements.resume.disabled = elements.settings.disabled || Boolean(state?.active?.applied);
  elements.resume.hidden = !state?.active || Boolean(state.active.applied);
  elements.mask.value = String(Math.round((draftOpacity ?? state?.maskOpacity ?? .62) * 100));
  elements["mask-value"].textContent = `${elements.mask.value}%`;
  elements.autostart.checked = Boolean(state?.autostart);
  elements.setup.hidden = !state?.needsSetup;
  elements.recovery.hidden = !state?.pendingRecovery;
  elements.recover.hidden = !state?.pendingRecovery;
  elements.recover.disabled = !connected || Boolean(busy) || !state?.pendingRecovery;
  elements["connection-hint"].hidden = !state?.active || Boolean(state.active.applied);
  elements["service-warning"].hidden = !state?.autostart || Boolean(state.autostartLoaded);
  elements.status.textContent = !connected && !connectionFailed ? t("connecting") : busy ? t("working") : notice ? t(notice) : "";
  elements["error-box"].hidden = !error && !connectionFailed;
  elements.error.textContent = connectionFailed ? t("connectionFailed") : error ? t(error) : "";
  elements.retry.disabled = Boolean(busy);
  renderBackground(state);
  renderMedia(state);
  if (!busy && busyFocus) {
    const target = busyFocus;
    busyFocus = null;
    if (document.hasFocus() && document.activeElement === document.body && !target.matches(":disabled") && !target.hidden) target.focus({ preventScroll: true });
  }
}

function hostContext(context) {
  if (context?.theme) applyDocumentTheme(context.theme);
  if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables);
  if (context?.safeAreaInsets) {
    for (const edge of ["top", "right", "bottom", "left"]) {
      const value = context.safeAreaInsets[edge];
      if (Number.isFinite(value) && value >= 0) document.documentElement.style.setProperty(`--studio-safe-${edge}`, `${value}px`);
    }
  }
}

function dispose() {
  if (disposed) return;
  disposed = true;
  controller.dispose();
  releasePreview();
  releaseBackground();
  document.removeEventListener("visibilitychange", visibility);
  motion.removeEventListener("change", backgroundPlayback);
}

function visibility() {
  if (document.hidden) {
    const media = controller.view.state?.selection ?? controller.view.state?.active;
    if (previewLoading || media?.kind === "video") releasePreview();
    releaseBackground();
  } else if (!disposed) render(controller.view);
}

elements.choose.addEventListener("click", () => controller.choose());
elements.apply.addEventListener("click", () => controller.apply());
elements.refresh.addEventListener("click", () => {
  if (!elements["preview-error"].hidden || backgroundFailed) {
    releasePreview();
    releaseBackground();
    currentPreview = null;
  }
  controller.refresh();
});
elements.pause.addEventListener("click", () => controller.run("xskin_pause"));
elements.resume.addEventListener("click", () => controller.run("xskin_resume"));
elements.recover.addEventListener("click", () => controller.run("xskin_recover"));
elements.autostart.addEventListener("change", () => controller.run("xskin_autostart", { enabled: elements.autostart.checked }));
elements.language.addEventListener("change", () => controller.language(elements.language.value));
elements.retry.addEventListener("click", () => {
  if (!connected) window.location.reload();
  else if (controller.view.retry) controller.view.retry();
  else controller.refresh();
});
elements.mask.addEventListener("input", () => {
  draftOpacity = Number(elements.mask.value) / 100;
  elements["mask-value"].textContent = `${elements.mask.value}%`;
  elements["preview-mask"].style.opacity = String(draftOpacity);
});
elements.mask.addEventListener("change", async () => {
  await controller.mask(Number(elements.mask.value));
  draftOpacity = null;
  render(controller.view);
});
for (const [node, kind, readyEvent] of [[elements["background-image"], "image", "load"], [elements["background-video"], "video", "loadeddata"]]) {
  const current = () => {
    const media = controller.view.state?.active;
    return !disposed && media?.applied && media.kind === kind && mediaIdentity(media) === backgroundIdentity &&
      node.hasAttribute("src") && node.src === backgroundUrl;
  };
  node.addEventListener("error", () => {
    if (!current()) return;
    backgroundFailed = true;
    render(controller.view);
  });
  node.addEventListener(readyEvent, () => {
    if (!current()) return;
    backgroundFailed = false;
    render(controller.view);
  });
}
for (const [node, kind, readyEvent] of [[elements.image, "image", "load"], [elements.video, "video", "loadedmetadata"]]) {
  const current = () => {
    const media = controller.view.state?.selection ?? controller.view.state?.active;
    return !disposed && media?.kind === kind && mediaIdentity(media) === currentPreview &&
      node.hasAttribute("src") && node.src === previewUrl;
  };
  node.addEventListener("error", () => {
    if (!current()) return;
    elements["preview-status"].hidden = true;
    elements["preview-error"].textContent = t("previewError");
    elements["preview-error"].hidden = false;
  });
  node.addEventListener(readyEvent, () => {
    if (!current() || (kind === "video" && document.hidden)) return;
    elements["preview-error"].hidden = true;
    render(controller.view);
  });
}
document.addEventListener("visibilitychange", visibility);
motion.addEventListener("change", backgroundPlayback);
window.addEventListener("pagehide", dispose, { once: true });
app.addEventListener("toolresult", result => controller.receive(result));
app.addEventListener("hostcontextchanged", hostContext);
app.onteardown = () => { dispose(); return {}; };
render(controller.view);
async function connect() {
  try {
    await app.connect();
    if (!disposed) {
      connected = true;
      hostContext(app.getHostContext());
      render(controller.view);
    }
  } catch {
    connectionFailed = true;
    render(controller.view);
  }
}
connect();
