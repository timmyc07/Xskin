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
    parts.push(new Blob([bytes]));
    offset += bytes.length;
    onProgress(Math.round(offset / media.bytes * 100));
  }
  signal?.throwIfAborted();
  return URL.createObjectURL(new Blob(parts, { type: media.previewMimeType }));
}

export function createMediaPreviews(app) {
  const entries = new Map();
  return {
    acquire(media, onProgress = () => {}) {
      const identity = mediaIdentity(media);
      if (!identity) throw new Error("invalid_preview");
      let entry = entries.get(identity);
      if (!entry) {
        entry = { identity, controller: new AbortController(), users: 0, listeners: new Set(), url: null };
        entries.set(identity, entry);
        entry.promise = loadPreview(app, media, { signal: entry.controller.signal,
          onProgress: progress => { for (const listener of entry.listeners) listener(progress); } }).then(url => {
          if (!entry.users) { URL.revokeObjectURL(url); throw new Error("cancelled_preview"); }
          entry.url = url;
          return url;
        });
      }
      entry.users += 1;
      entry.listeners.add(onProgress);
      let released = false;
      return { promise: entry.promise, release() {
        if (released) return;
        released = true;
        entry.listeners.delete(onProgress);
        entry.users -= 1;
        if (!entry.users) {
          entry.controller.abort();
          if (entry.url) URL.revokeObjectURL(entry.url);
          if (entries.get(entry.identity) === entry) entries.delete(entry.identity);
        }
      } };
    },
    promote(previous, active) {
      const before = mediaIdentity(previous);
      const after = mediaIdentity(active);
      const entry = entries.get(before);
      if (!entry?.url || !after || entry.controller.signal.aborted || previous.kind !== active.kind ||
        previous.bytes !== active.bytes || previous.previewMimeType !== active.previewMimeType ||
        (entries.has(after) && entries.get(after) !== entry)) return false;
      entries.delete(before);
      entry.identity = after;
      entries.set(after, entry);
      return true;
    },
  };
}

export function releaseVideo(video) {
  video.pause();
  if (video.hasAttribute("src")) {
    video.removeAttribute("src");
    video.load();
  }
}
