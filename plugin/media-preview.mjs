import fs from "node:fs/promises";
import { constants } from "node:fs";
import http from "node:http";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { readImageMetadata, MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "../macos/scripts/image-metadata.mjs";

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const imageTypes = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const identity = stat => `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
const invalid = () => Object.assign(new Error("The preview media is unavailable."), { errorCode: "invalid_media" });

function rangeFor(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    return Number.isSafeInteger(suffix) && suffix > 0 ? [Math.max(0, size - suffix), size - 1] : null;
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start < size && end >= start
    ? [start, Math.min(end, size - 1)] : null;
}

export async function createMediaPreview({ stateRoot }) {
  stateRoot = path.resolve(stateRoot);
  let entries = new Map();
  let origin;
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

  const server = http.createServer({ headersTimeout: 5000, requestTimeout: 5000, keepAliveTimeout: 1000 }, (request, response) => {
    const end = status => { response.writeHead(status, { "Content-Length": "0" }); response.end(); };
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    const repeated = name => request.rawHeaders.filter((_value, index) => index % 2 === 0 && request.rawHeaders[index].toLowerCase() === name).length > 1;
    if (request.headers.host !== new URL(origin).host || repeated("host")) { end(403); return; }
    if (!["GET", "HEAD"].includes(request.method)) { response.setHeader("Allow", "GET, HEAD"); end(405); return; }
    const match = /^\/media\/([a-f0-9]{64})$/.exec(request.url ?? "");
    const entry = match ? entries.get(match[1]) : null;
    if (!entry || closed) { end(404); return; }
    (async () => {
      const { handle, stat } = await openMedia(entry);
      let streaming = false;
      try {
        if (closed || response.destroyed) return;
        let start = 0;
        let finish = stat.size - 1;
        const ranged = request.headers.range !== undefined;
        if (ranged) {
          const range = repeated("range") ? null : rangeFor(request.headers.range, stat.size);
          if (!range) { response.setHeader("Content-Range", `bytes */${stat.size}`); end(416); return; }
          [start, finish] = range;
          response.setHeader("Content-Range", `bytes ${start}-${finish}/${stat.size}`);
        }
        response.setHeader("Content-Type", entry.type);
        response.setHeader("Accept-Ranges", "bytes");
        response.setHeader("Content-Length", String(finish - start + 1));
        response.writeHead(ranged ? 206 : 200);
        if (request.method === "HEAD") { response.end(); return; }
        const stream = handle.createReadStream({ start, end: finish });
        streaming = true;
        response.on("close", () => stream.destroy());
        stream.on("error", () => response.destroy());
        stream.pipe(response);
      } finally { if (!streaming) await handle.close(); }
    })().catch(() => { if (!response.headersSent) end(404); else response.destroy(); });
  });
  server.maxHeadersCount = 16;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); });
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    async update(media) {
      if (closed) throw invalid();
      try {
        const approved = await Promise.all([approve("active", media.active), approve("selection", media.selection)]);
        entries = new Map(approved.filter(Boolean).map(entry => [entry.token, entry]));
        return Object.fromEntries(approved.map((entry, index) => [index === 0 ? "active" : "selection", entry ? `${origin}/media/${entry.token}` : null]));
      } catch { throw invalid(); }
    },
    async close() {
      if (closed) return;
      closed = true;
      entries.clear();
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    },
  };
}
