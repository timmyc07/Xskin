import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createMediaPreview } from "../media-preview.mjs";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "xskin-preview-"));
const stateRoot = path.join(root, "素材 中文 🌙 with spaces");
const id = "11111111-2222-4333-8444-555555555555";
const theme = path.join(stateRoot, "theme");
const pending = path.join(stateRoot, "studio", `import-${id}`);
await fs.mkdir(theme, { recursive: true });
await fs.mkdir(pending, { recursive: true });
const image = await fs.readFile(new URL("../../macos/assets/portal-hero.png", import.meta.url));
const imagePath = path.join(theme, "背景.png");
await fs.writeFile(imagePath, image);
const videoPath = path.join(pending, "背景.mp4");
const video = Buffer.from("000000186674797069736f6d0000000069736f6d6d703432", "hex");
const videoHandle = await fs.open(videoPath, "wx");
await videoHandle.write(video);
await videoHandle.truncate(256 * 1024 * 1024);
await videoHandle.close();
const active = { name: "背景", kind: "image", path: imagePath, bytes: image.length };
const selection = { id, name: "影片", kind: "video", path: videoPath, bytes: 256 * 1024 * 1024 };
const preview = await createMediaPreview({ stateRoot });
const request = (url, headers = {}, method = "GET") => new Promise((resolve, reject) => {
  const request = http.request(url, { headers, method }, response => {
    const bytes = [];
    response.on("data", chunk => bytes.push(chunk));
    response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, bytes: Buffer.concat(bytes) }));
  });
  request.on("error", reject);
  request.end();
});

try {
  assert.match(preview.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  const urls = await preview.update({ active, selection });
  assert.deepEqual(await preview.update({ active, selection }), urls, "Unchanged status polls keep preview URLs and playback stable");
  assert.doesNotMatch(JSON.stringify(urls), /背景|import-|\.mp4|\.png/);
  const full = await request(urls.active);
  assert.equal(full.status, 200);
  assert.equal(full.headers["content-type"], "image/png");
  assert.equal(full.headers["cache-control"], "no-store");
  assert.equal(full.headers["x-content-type-options"], "nosniff");
  assert.deepEqual(full.bytes, image);
  const head = await request(urls.selection, {}, "HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.headers["content-length"], String(selection.bytes));
  assert.equal(head.headers["content-type"], "video/mp4");
  assert.equal(head.bytes.length, 0, "HEAD never reads or encodes the 256 MiB video body");
  for (const [range, start, end] of [["bytes=0-15", 0, 15], ["bytes=16-", 16, selection.bytes - 1],
    ["bytes=-8", selection.bytes - 8, selection.bytes - 1], ["bytes=0-999999999", 0, selection.bytes - 1]]) {
    const result = await request(urls.selection, { Range: range }, "HEAD");
    assert.equal(result.status, 206);
    assert.equal(result.headers["content-range"], `bytes ${start}-${end}/${selection.bytes}`);
    assert.equal(result.headers["content-length"], String(end - start + 1));
    assert.equal(result.bytes.length, 0);
  }
  const beginning = await request(urls.selection, { Range: "bytes=0-15" });
  assert.deepEqual(beginning.bytes, video.subarray(0, 16));
  const ending = await request(urls.selection, { Range: "bytes=-8" });
  assert.deepEqual(ending.bytes, Buffer.alloc(8), "Range streaming seeks directly into the original file");
  for (const range of ["bytes=", "bytes=-", "bytes=-0", "bytes=4-3", "bytes=999999999-", "bytes=0-1,4-8", "bytes=0-9007199254740992", "items=0-1"]) {
    const result = await request(urls.selection, { Range: range });
    assert.equal(result.status, 416, range);
    assert.equal(result.headers["content-range"], `bytes */${selection.bytes}`);
  }
  assert.equal((await request(urls.active, { Host: "evil.example" })).status, 403);
  assert.equal((await request(urls.active, {}, "POST")).status, 405);
  assert.equal((await request(`${preview.origin}/media/${"0".repeat(64)}`)).status, 404);
  assert.equal((await request(`${urls.active}?file=secret`)).status, 404);
  assert.equal((await request(`${preview.origin}/etc/passwd`)).status, 404);
  assert.equal((await request(`${preview.origin}/media/%2e%2e`)).status, 404);
  assert.equal((await request(urls.selection, { Range: ["bytes=0-1", "bytes=4-8"] })).status, 416);
  await assert.rejects(preview.update({ active: { ...active, path: path.join(root, "secret.png") } }));
  await assert.rejects(preview.update({ active: { ...active, path: path.join(theme, "missing.png") } }),
    error => error.errorCode === "invalid_media" && !error.message.includes(root), "Filesystem errors never expose private paths");
  await assert.rejects(preview.update({ selection: { ...selection, id: "../escape" } }));
  const malformed = path.join(theme, "malformed.png");
  await fs.writeFile(malformed, "not an image");
  await assert.rejects(preview.update({ active: { ...active, path: malformed, bytes: 12 } }));
  const outside = path.join(root, "outside.png");
  await fs.writeFile(outside, image);
  const link = path.join(theme, "link.png");
  await fs.symlink(outside, link);
  await assert.rejects(preview.update({ active: { ...active, path: link } }), "Symlink files are never approved");
  await fs.rename(imagePath, `${imagePath}.old`);
  await fs.symlink(outside, imagePath);
  assert.equal((await request(urls.active)).status, 404, "Previously approved URLs cannot follow a later symlink swap");
  await fs.unlink(imagePath);
  await fs.rename(`${imagePath}.old`, imagePath);
  const restored = await preview.update({ active, selection });
  await preview.update({ active });
  assert.equal((await request(restored.selection)).status, 404, "Completed or removed selections revoke their URLs");
  await fs.rename(theme, `${theme}.old`);
  await fs.symlink(root, theme);
  await assert.rejects(preview.update({ active }), "Symlink directories are never approved");
  assert.equal((await request(restored.active)).status, 404);
  await fs.unlink(theme);
  await fs.rename(`${theme}.old`, theme);
  await preview.close();
  await preview.close();
  await assert.rejects(request(restored.active), "Closing the studio closes its media listener");
  console.log("PASS: Private loopback previews stream bounded original-file ranges and reject host, path, method, range and symlink attacks.");
} finally {
  await preview.close();
  await fs.rm(root, { recursive: true, force: true });
}
