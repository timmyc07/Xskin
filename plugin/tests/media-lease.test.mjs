import assert from "node:assert/strict";
import test from "node:test";
import { createMediaPreviews } from "../ui/media.mjs";

const media = id => ({ kind: "video", bytes: 8, previewId: id.repeat(64), previewMimeType: "video/mp4" });
const chunk = { _meta: { "com.xskin/media": { offset: 0, total: 8, mimeType: "video/mp4", data: Buffer.alloc(8, 7).toString("base64") } } };

test("two roles share unfinished reads and release only the last original Blob owner", async () => {
  const reads = [];
  const cache = createMediaPreviews({ callServerTool(request, options) {
    return new Promise(resolve => reads.push({ request, signal: options.signal, resolve }));
  } });
  const background = cache.acquire(media("a"));
  const preview = cache.acquire(media("a"));
  assert.equal(background.promise, preview.promise);
  assert.equal(reads.length, 1);
  preview.release();
  assert.equal(reads[0].signal.aborted, false);
  const pending = cache.acquire(media("b"));
  assert.equal(reads.length, 2);
  for (const read of reads) read.resolve(chunk);
  const [originalUrl, pendingUrl] = await Promise.all([background.promise, pending.promise]);
  assert.deepEqual(Buffer.from(await (await fetch(originalUrl)).arrayBuffer()), Buffer.alloc(8, 7));
  const restoredPreview = cache.acquire(media("a"));
  assert.equal(await restoredPreview.promise, originalUrl);
  assert.equal(reads.length, 2);
  background.release();
  assert.equal(reads[0].signal.aborted, false);
  assert.equal((await fetch(originalUrl)).ok, true);
  restoredPreview.release();
  restoredPreview.release();
  assert.equal(reads[0].signal.aborted, true);
  await assert.rejects(fetch(originalUrl));
  assert.equal((await fetch(pendingUrl)).ok, true);
  pending.release();
  await assert.rejects(fetch(pendingUrl));
});

test("a cancelled late read cannot replace a newly acquired entry with the same identity", async () => {
  const reads = [];
  const cache = createMediaPreviews({ callServerTool(_request, options) {
    return new Promise(resolve => reads.push({ signal: options.signal, resolve }));
  } });
  const previous = cache.acquire(media("a"));
  const cancelled = assert.rejects(previous.promise, { name: "AbortError" });
  previous.release();
  assert.equal(reads[0].signal.aborted, true);
  const current = cache.acquire(media("a"));
  reads[0].resolve(chunk);
  await cancelled;
  reads[1].resolve(chunk);
  const url = await current.promise;
  assert.equal((await fetch(url)).ok, true);
  const shared = cache.acquire(media("a"));
  assert.equal(await shared.promise, url);
  assert.equal(reads.length, 2);
  current.release();
  shared.release();
  await assert.rejects(fetch(url));
});
