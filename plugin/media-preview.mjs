import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { readImageMetadata, MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "../macos/scripts/image-metadata.mjs";

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const imageTypes = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const identity = stat => `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
const invalid = () => Object.assign(new Error("The preview media is unavailable."), { errorCode: "invalid_media" });

export const PREVIEW_CHUNK_BYTES = 512 * 1024;

export async function createMediaPreview({ stateRoot }) {
  stateRoot = path.resolve(stateRoot);
  let entries = new Map();
  let closed = false;

  const openMedia = async entry => {
    const relative = path.relative(stateRoot, entry.path);
    const pieces = relative.split(path.sep);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw invalid();
    let directory = stateRoot;
    for (const piece of ["", ...pieces.slice(0, -1)]) {
      directory = path.join(directory, piece);
      if (!(await fs.lstat(directory)).isDirectory()) throw invalid();
    }
    const before = await fs.lstat(entry.path);
    if (!before.isFile()) throw invalid();
    const handle = await fs.open(entry.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await handle.stat();
      const root = await fs.realpath(stateRoot);
      if (!stat.isFile() || identity(before) !== identity(stat) ||
        await fs.realpath(entry.path) !== path.join(root, relative) ||
        (entry.identity && entry.identity !== identity(stat))) throw invalid();
      return { handle, stat };
    } catch (error) { await handle.close(); throw error; }
  };

  const approve = async (slot, media) => {
    if (!media) return null;
    const parent = slot === "active" ? path.join(stateRoot, "theme")
      : typeof media.id === "string" && uuid.test(media.id) ? path.join(stateRoot, "studio", `import-${media.id}`) : null;
    if (!parent || typeof media.path !== "string" || path.dirname(media.path) !== parent ||
      !["image", "video"].includes(media.kind)) throw invalid();
    const extension = path.extname(media.path).toLowerCase();
    const type = media.kind === "video" && extension === ".mp4" ? "video/mp4"
      : media.kind === "image" ? imageTypes[extension] : null;
    if (!type) throw invalid();
    const { handle, stat } = await openMedia(media);
    try {
      const limit = media.kind === "video" ? 256 * 1024 * 1024 : 16 * 1024 * 1024;
      if (!Number.isSafeInteger(stat.size) || stat.size < 1 || stat.size > limit || stat.size !== media.bytes) throw invalid();
      const previous = [...entries.values()].find(entry => entry.slot === slot && entry.path === media.path && entry.identity === identity(stat));
      if (previous) return previous;
      const bytes = Buffer.alloc(media.kind === "video" ? Math.min(32, stat.size) : stat.size);
      let offset = 0;
      while (offset < bytes.length) {
        const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
        if (!bytesRead) throw invalid();
        offset += bytesRead;
      }
      if (media.kind === "video") {
        if (bytes.length < 16 || bytes.toString("ascii", 4, 8) !== "ftyp" ||
          bytes.readUInt32BE(0) < 16 || bytes.readUInt32BE(0) > stat.size) throw invalid();
      } else {
        const dimensions = readImageMetadata(bytes, extension);
        if (!dimensions || dimensions.width > MAX_IMAGE_DIMENSION || dimensions.height > MAX_IMAGE_DIMENSION ||
          dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) throw invalid();
      }
      if (identity(await handle.stat()) !== identity(stat)) throw invalid();
      return { slot, path: media.path, identity: identity(stat), type, token: randomBytes(32).toString("hex") };
    } finally { await handle.close(); }
  };

  return {
    async update(media) {
      if (closed) throw invalid();
      const approved = await Promise.all([
        approve("active", media.active).catch(() => null),
        approve("selection", media.selection).catch(() => null),
      ]);
      if (closed) throw invalid();
      entries = new Map(approved.filter(Boolean).map(entry => [entry.token, entry]));
      return Object.fromEntries(approved.map((entry, index) => [index === 0 ? "active" : "selection",
        entry ? { id: entry.token, mimeType: entry.type } : null]));
    },
    async read(mediaId, offset, signal) {
      const entry = typeof mediaId === "string" && /^[a-f0-9]{64}$/.test(mediaId) ? entries.get(mediaId) : null;
      if (closed || signal?.aborted || !entry || !Number.isSafeInteger(offset) || offset < 0) throw invalid();
      try {
        const { handle, stat } = await openMedia(entry);
        try {
          if (offset >= stat.size) throw invalid();
          const bytes = Buffer.alloc(Math.min(PREVIEW_CHUNK_BYTES, stat.size - offset));
          let count = 0;
          while (count < bytes.length) {
            const { bytesRead } = await handle.read(bytes, count, bytes.length - count, offset + count);
            if (!bytesRead) throw invalid();
            count += bytesRead;
          }
          if (closed || signal?.aborted || identity(await handle.stat()) !== identity(stat)) throw invalid();
          return { offset, total: stat.size, mimeType: entry.type, data: bytes.toString("base64") };
        } finally { await handle.close(); }
      } catch { throw invalid(); }
    },
    async close() {
      if (closed) return;
      closed = true;
      entries.clear();
    },
  };
}
