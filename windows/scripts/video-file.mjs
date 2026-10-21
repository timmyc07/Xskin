import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const MAX_VIDEO_BYTES = 256 * 1024 * 1024;

export function validateVideoName(name) {
  if (typeof name !== "string" || !/^[^/\\<>:"|?*\p{Cc}\u2028\u2029]+\.mp4$/iu.test(name)
    || path.basename(name) !== name) {
    throw new Error("Theme video must be an MP4 filename inside its theme directory");
  }
  return name;
}

export async function readVideo(filePath, { headerOnly = false } = {}) {
  validateVideoName(path.basename(filePath));
  if (!(await fs.lstat(filePath)).isFile()) throw new Error("Video must be a regular MP4 file");
  const handle = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size < 16 || before.size > MAX_VIDEO_BYTES) {
      throw new Error("Video must be a regular MP4 file no larger than 256 MiB");
    }
    const bytes = Buffer.alloc(headerOnly ? Math.min(24, before.size) : before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) throw new Error("Video changed while being read");
      offset += bytesRead;
    }
    const after = await handle.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs
      || (!headerOnly && bytes.length !== before.size)) throw new Error("Video changed while being read");
    if (bytes.toString("ascii", 4, 8) !== "ftyp" || bytes.readUInt32BE(0) < 16
      || bytes.readUInt32BE(0) > before.size) throw new Error("Video is not an MP4 container");
    return bytes;
  } finally {
    await handle.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error("Usage: video-file.mjs VIDEO.mp4");
  await readVideo(process.argv[2], { headerOnly: process.argv[3] === '--check-header' });
}
