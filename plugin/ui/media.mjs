const CHUNK_BYTES = 512 * 1024;
const TYPES = { image: new Set(["image/png", "image/jpeg", "image/webp"]), video: new Set(["video/mp4"]) };

export function mediaIdentity(media) {
  return media && /^[a-f0-9]{64}$/.test(media.previewId ?? "") && TYPES[media.kind]?.has(media.previewMimeType) &&
    Number.isSafeInteger(media.bytes) && media.bytes > 0 && media.bytes <= (media.kind === "video" ? 256 : 16) * 1024 * 1024
    ? `${media.kind}:${media.previewId}` : null;
}

export async function loadPreview(app, media, { signal, onProgress = () => {} } = {}) {
  if (!mediaIdentity(media)) throw new Error("invalid_preview");
  const parts = [];
  let offset = 0;
  while (offset < media.bytes) {
    signal?.throwIfAborted();
    const result = await app.callServerTool({ name: "xskin_read_media", arguments: { mediaId: media.previewId, offset } },
      { timeout: 30000, signal });
    signal?.throwIfAborted();
    const chunk = result?._meta?.["com.xskin/media"];
    if (result?.isError || !chunk || chunk.offset !== offset || chunk.total !== media.bytes ||
      chunk.mimeType !== media.previewMimeType || typeof chunk.data !== "string" ||
      chunk.data.length > Math.ceil(CHUNK_BYTES / 3) * 4) throw new Error("invalid_preview");
    const binary = atob(chunk.data);
    if (binary.length !== Math.min(CHUNK_BYTES, media.bytes - offset)) throw new Error("invalid_preview");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    parts.push(bytes);
    offset += bytes.length;
    onProgress(Math.round(offset / media.bytes * 100));
  }
  signal?.throwIfAborted();
  return URL.createObjectURL(new Blob(parts, { type: media.previewMimeType }));
}

export function releaseVideo(video) {
  video.pause();
  if (video.hasAttribute("src")) {
    video.removeAttribute("src");
    video.load();
  }
}
