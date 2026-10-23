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

test("a completed promotion transfers ownership to the new capability and releases the URL only once", async () => {
  const reads = [];
  const cache = createMediaPreviews({ async callServerTool(request) { reads.push(request); return chunk; } });
  const previous = media("a");
  const active = media("b");
  const pending = cache.acquire(previous);
  assert.equal(cache.promote(previous, active), false, "An unfinished read cannot be relabelled");
  const url = await pending.promise;
  assert.equal(cache.promote(previous, { ...active, bytes: 9 }), false);
  assert.equal(cache.promote(previous, { ...active, previewMimeType: "image/png" }), false);
  assert.equal(cache.promote(previous, active), true);
  const background = cache.acquire(active);
  const preview = cache.acquire(active);
  assert.equal(await background.promise, url);
  assert.equal(await preview.promise, url);
  pending.release();
  background.release();
  assert.equal((await fetch(url)).ok, true);
  preview.release();
  await assert.rejects(fetch(url));
  const reopened = cache.acquire(active);
  assert.notEqual(await reopened.promise, url);
  assert.equal(reads.length, 2);
  assert.equal(reads[1].arguments.mediaId, active.previewId, "Reopening uses only the new approved capability");
  reopened.release();
});
