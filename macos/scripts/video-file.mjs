import fs from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const MAX_VIDEO_BYTES = 256 * 1024 * 1024;

export function validateVideoName(name) {
  if (typeof name !== "string" || !/^[^/\\\p{Cc}\u2028\u2029]+\.mp4$/iu.test(name)
    || path.basename(name) !== name) {
    throw new Error("Theme video must be an MP4 filename inside its theme directory");
  }
  return name;
}

export async function inspectVideo(filePath) {
  validateVideoName(path.basename(filePath));
  const handle = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size < 16 || before.size > MAX_VIDEO_BYTES) {
      throw new Error("Video must be a regular MP4 file no larger than 256 MiB");
    }
    const bytes = Buffer.alloc(Math.min(1024 * 1024, before.size));
    const hash = createHash("sha256");
    let offset = 0;
    while (offset < before.size) {
      const chunkLength = Math.min(bytes.length, before.size - offset);
      let filled = 0;
      while (filled < chunkLength) {
        const { bytesRead } = await handle.read(bytes, filled, chunkLength - filled, offset + filled);
        if (!bytesRead) throw new Error("Video changed while being read");
        filled += bytesRead;
      }
      if (offset === 0 && (bytes.toString("ascii", 4, 8) !== "ftyp"
        || bytes.readUInt32BE(0) < 16 || bytes.readUInt32BE(0) > before.size)) {
        throw new Error("Video is not an MP4 container");
      }
      hash.update(bytes.subarray(0, filled));
      offset += filled;
    }
    const after = await handle.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs
      || offset !== before.size) throw new Error("Video changed while being read");
    return { size: before.size, key: hash.digest("hex") };
  } finally {
    await handle.close();
  }
}

export async function copyVideo(source, destination) {
  const expected = await inspectVideo(source);
  await fs.copyFile(source, destination, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE);
  try {
    await fs.chmod(destination, 0o600);
    const copied = await inspectVideo(destination);
    if (copied.key !== expected.key) throw new Error("Video changed while being copied");
    return copied;
  } catch (error) {
    await fs.rm(destination, { force: true });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error("Usage: video-file.mjs VIDEO.mp4");
  await inspectVideo(process.argv[2]);
}
