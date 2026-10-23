export function safePreviewUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && url.hostname === "127.0.0.1" && Number(url.port) > 0 &&
      !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function releaseVideo(video) {
  video.pause();
  if (video.hasAttribute("src")) {
    video.removeAttribute("src");
    video.load();
  }
}
