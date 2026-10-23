import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fstatSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createMediaPreview, PREVIEW_CHUNK_BYTES } from "../media-preview.mjs";

const id = "11111111-2222-4333-8444-555555555555";
const image = await fs.readFile(new URL("../../macos/assets/portal-hero.png", import.meta.url));
const videoHeader = Buffer.from("000000186674797069736f6d0000000069736f6d6d703432", "hex");
const maxVideoBytes = 256 * 1024 * 1024;

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "xskin-preview-"));
  const stateRoot = path.join(directory, "素材 中文 🌙 with spaces");
  const theme = path.join(stateRoot, "theme");
  const pending = path.join(stateRoot, "studio", `import-${id}`);
  await fs.mkdir(theme, { recursive: true });
  await fs.mkdir(pending, { recursive: true });
  const imagePath = path.join(theme, "背景 中文 🌙.png");
  const videoPath = path.join(pending, "影片 中文 🌙.mp4");
  await fs.writeFile(imagePath, image);
  const video = Buffer.alloc(PREVIEW_CHUNK_BYTES * 2 + 37);
  for (let i = videoHeader.length; i < video.length; i++) video[i] = i % 251;
  videoHeader.copy(video);
  await fs.writeFile(videoPath, video);
  const active = { name: "背景 中文 🌙", kind: "image", path: imagePath, bytes: image.length };
  const selection = { id, name: "影片 中文 🌙", kind: "video", path: videoPath, bytes: video.length };
  const preview = await createMediaPreview({ stateRoot });
  t.after(async () => {
    await preview.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  const rejectRead = (...args) => assert.rejects(preview.read(...args), error =>
    error.errorCode === "invalid_media" && !error.message.includes(directory),
  "Rejected media reads expose only a safe error, never a local path");
  return { directory, stateRoot, theme, pending, imagePath, videoPath, active, selection, preview, video, rejectRead };
}

test("private media capabilities preserve Unicode paths and stream every original byte in bounded chunks", async t => {
  const { preview, active, selection, video } = await fixture(t);
  assert.equal(PREVIEW_CHUNK_BYTES, 512 * 1024);
  assert.equal(preview.origin, undefined, "The app must not need a private HTTP listener");
  const media = await preview.update({ active, selection });
  assert.deepEqual(await preview.update({ active, selection }), media,
    "Unchanged status polls retain capabilities and an already decoded preview");
  assert.equal(media.active.mimeType, "image/png");
  assert.equal(media.selection.mimeType, "video/mp4");
  assert.match(media.active.id, /^[a-f0-9]{64}$/);
  assert.match(media.selection.id, /^[a-f0-9]{64}$/);
  assert.notEqual(media.active.id, media.selection.id);
  assert.doesNotMatch(JSON.stringify(media), /http:|file:|背景|import-|\.mp4|\.png/);
  for (const [capability, original] of [[media.active, image], [media.selection, video]]) {
    const received = [];
    for (let offset = 0; offset < original.length; offset += PREVIEW_CHUNK_BYTES) {
      const chunk = await preview.read(capability.id, offset);
      assert.deepEqual(Object.keys(chunk).sort(), ["data", "mimeType", "offset", "total"]);
      assert.equal(chunk.offset, offset);
      assert.equal(chunk.total, original.length);
      assert.equal(chunk.mimeType, capability.mimeType);
      const bytes = Buffer.from(chunk.data, "base64");
      assert.equal(bytes.length, Math.min(PREVIEW_CHUNK_BYTES, original.length - offset));
      assert.equal(bytes.toString("base64"), chunk.data);
      assert.deepEqual(bytes, original.subarray(offset, offset + bytes.length));
      received.push(bytes);
    }
    assert.deepEqual(Buffer.concat(received), original);
  }
});

test("concurrent identical status updates return the same readable capabilities", async t => {
  const { preview, active, selection, video } = await fixture(t);
  const statuses = await Promise.all(Array.from({ length: 4 }, () => preview.update({ active, selection })));
  for (const status of statuses) {
    assert.deepEqual(status, statuses[0], "A successful status cannot immediately revoke an identical concurrent response");
    assert.deepEqual(Buffer.from((await preview.read(status.selection.id, 0)).data, "base64"),
      video.subarray(0, PREVIEW_CHUNK_BYTES));
  }
});

test("Apply promotion replaces the pending capability with a stable active capability", async t => {
  const { preview, active, selection, theme, pending, video, rejectRead } = await fixture(t);
  const chosen = await preview.update({ active, selection });
  const appliedPath = path.join(theme, "applied.mp4");
  await fs.copyFile(selection.path, appliedPath);
  await fs.rm(pending, { recursive: true });
  const applied = { ...selection, path: appliedPath };
  const statuses = await Promise.all([preview.update({ active: applied }), preview.update({ active: applied })]);
  assert.deepEqual(statuses[0], statuses[1]);
  assert.notEqual(statuses[0].active.id, chosen.selection.id, "A moved/copied file must not retain the former file capability");
  assert.equal(statuses[0].selection, null);
  await rejectRead(chosen.selection.id, 0);
  await rejectRead(chosen.active.id, 0);
  const chunks = [];
  for (let offset = 0; offset < video.length; offset += PREVIEW_CHUNK_BYTES) {
    chunks.push(Buffer.from((await preview.read(statuses[0].active.id, offset)).data, "base64"));
  }
  assert.deepEqual(Buffer.concat(chunks), video, "New active media retains all of the imported MP4 bytes");
});

test("revoking a capability also rejects a chunk already waiting on its file read", async t => {
  const { preview, active, selection, rejectRead } = await fixture(t);
  const approved = await preview.update({ active, selection });
  const originalOpen = fs.open;
  let started;
  const reading = new Promise(resolve => { started = resolve; });
  let release;
  const held = new Promise(resolve => { release = resolve; });
  fs.open = async (...args) => {
    const handle = await originalOpen(...args);
    if (args[0] === selection.path) {
      const read = handle.read.bind(handle);
      handle.read = async (...values) => {
        started();
        await held;
        return read(...values);
      };
    }
    return handle;
  };
  try {
    const rejected = rejectRead(approved.selection.id, 0);
    await reading;
    await preview.update({ active });
    release();
    await rejected;
    assert.deepEqual(await preview.update({ active }), { active: approved.active, selection: null });
  } finally {
    release();
    fs.open = originalOpen;
  }
});

test("a snapshot superseded during approval cannot publish or revoke current capabilities", async t => {
  const { preview, active, selection } = await fixture(t);
  const current = await preview.update({ active });
  const originalOpen = fs.open;
  let started;
  const approving = new Promise(resolve => { started = resolve; });
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let isCurrent = true;
  fs.open = async (...args) => {
    const handle = await originalOpen(...args);
    if (args[0] === selection.path) {
      const read = handle.read.bind(handle);
      handle.read = async (...values) => { started(); await held; return read(...values); };
    }
    return handle;
  };
  try {
    const stale = assert.rejects(preview.update({ selection }, () => isCurrent), { errorCode: "invalid_media" });
    await approving;
    isCurrent = false;
    release();
    await stale;
    assert.equal((await preview.read(current.active.id, 0)).mimeType, "image/png",
      "Rejected stale approval must preserve the already published current capability");
    assert.deepEqual(await preview.update({ active }), current, "The queue remains usable after a stale approval");
  } finally {
    release();
    fs.open = originalOpen;
  }
});

test("revocation during the final file stat still rejects the pending chunk", async t => {
  const { preview, active, selection, rejectRead } = await fixture(t);
  const approved = await preview.update({ active, selection });
  const originalOpen = fs.open;
  let started;
  const checking = new Promise(resolve => { started = resolve; });
  let release;
  const held = new Promise(resolve => { release = resolve; });
  fs.open = async (...args) => {
    const handle = await originalOpen(...args);
    if (args[0] === selection.path) {
      const stat = handle.stat.bind(handle);
      let checks = 0;
      handle.stat = async () => {
        const result = await stat();
        if (++checks === 2) { started(); await held; }
        return result;
      };
    }
    return handle;
  };
  try {
    const rejected = rejectRead(approved.selection.id, 0);
    await checking;
    await preview.update({ active });
    release();
    await rejected;
  } finally {
    release();
    fs.open = originalOpen;
  }
});

test("revocation while closing the file still rejects the chunk before delivery", async t => {
  const { preview, active, selection, rejectRead } = await fixture(t);
  const approved = await preview.update({ active, selection });
  const originalOpen = fs.open;
  let started;
  const closing = new Promise(resolve => { started = resolve; });
  let release;
  const held = new Promise(resolve => { release = resolve; });
  fs.open = async (...args) => {
    const handle = await originalOpen(...args);
    if (args[0] === selection.path) {
      const close = handle.close.bind(handle);
      handle.close = async () => { started(); await held; return close(); };
    }
    return handle;
  };
  try {
    const rejected = rejectRead(approved.selection.id, 0);
    await closing;
    await preview.update({ active });
    release();
    await rejected;
  } finally {
    release();
    fs.open = originalOpen;
  }
});

test("a sparse 256 MiB original MP4 reads its first and final chunks without buffering the full file", async t => {
  const { preview, selection, videoPath } = await fixture(t);
  const tail = Buffer.from("original-tail-中文 🌙");
  const handle = await fs.open(videoPath, "r+");
  try {
    await handle.truncate(maxVideoBytes);
    await handle.write(tail, 0, tail.length, maxVideoBytes - tail.length);
  } finally { await handle.close(); }
  const media = await preview.update({ selection: { ...selection, bytes: maxVideoBytes } });
  assert.ok(media.selection);
  const first = await preview.read(media.selection.id, 0);
  assert.equal(first.total, maxVideoBytes);
  assert.equal(Buffer.from(first.data, "base64").length, PREVIEW_CHUNK_BYTES);
  assert.deepEqual(Buffer.from(first.data, "base64").subarray(0, videoHeader.length), videoHeader);
  const lastOffset = maxVideoBytes - PREVIEW_CHUNK_BYTES;
  const last = await preview.read(media.selection.id, lastOffset);
  const bytes = Buffer.from(last.data, "base64");
  assert.equal(bytes.length, PREVIEW_CHUNK_BYTES);
  assert.deepEqual(bytes.subarray(0, -tail.length), Buffer.alloc(PREVIEW_CHUNK_BYTES - tail.length));
  assert.deepEqual(bytes.subarray(-tail.length), tail);
  assert.deepEqual(Buffer.from((await preview.read(media.selection.id, maxVideoBytes - 3)).data, "base64"), tail.subarray(-3));
});

test("foreign tokens, malformed offsets, EOF and a different session cannot read approved files", async t => {
  const { preview, stateRoot, active, selection, rejectRead } = await fixture(t);
  const media = await preview.update({ active, selection });
  for (const token of [null, undefined, 4, "", "../private", `${media.active.id}?path=secret`, "b".repeat(64), media.active.id.toUpperCase()]) {
    await rejectRead(token, 0);
  }
  for (const offset of [undefined, null, "0", -1, .5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER,
    selection.bytes, selection.bytes + 1]) await rejectRead(media.selection.id, offset);
  const second = await createMediaPreview({ stateRoot });
  try {
    const next = await second.update({ active, selection });
    assert.notEqual(next.active.id, media.active.id);
    await assert.rejects(second.read(media.active.id, 0), { errorCode: "invalid_media" });
    await rejectRead(next.active.id, 0);
    assert.deepEqual(Buffer.from((await second.read(next.active.id, 0)).data, "base64"), image.subarray(0, PREVIEW_CHUNK_BYTES));
  } finally { await second.close(); }
});

test("only the approved active and selection directories can mint capabilities", async t => {
  const { directory, theme, pending, active, selection, preview } = await fixture(t);
  const outside = path.join(directory, "outside.png");
  await fs.writeFile(outside, image);
  const activeInSelection = path.join(pending, "image.png");
  await fs.writeFile(activeInSelection, image);
  const videoInTheme = path.join(theme, "video.mp4");
  await fs.writeFile(videoInTheme, videoHeader);
  for (const badActive of [
    { ...active, path: outside }, { ...active, path: activeInSelection },
    { ...active, path: path.join(theme, "..", "outside.png") },
    { ...active, path: "relative.png" }, { ...active, kind: "audio" },
  ]) {
    const media = await preview.update({ active: badActive, selection });
    assert.equal(media.active, null);
    assert.ok(media.selection, "A rejected active slot cannot disable the valid pending preview");
  }
  for (const badSelection of [
    { ...selection, id: "../escape" }, { ...selection, id: "" },
    { ...selection, path: videoInTheme }, { ...selection, path: path.join(pending, "nested", "video.mp4") },
    { ...selection, kind: "audio" },
  ]) {
    const media = await preview.update({ active, selection: badSelection });
    assert.ok(media.active, "A rejected selection cannot hide the saved background");
    assert.equal(media.selection, null);
  }
});

test("missing, empty, oversized, mislabeled and corrupt files fail independently in each slot", async t => {
  const { theme, pending, active, selection, preview } = await fixture(t);
  const invalidImages = [];
  for (const [name, bytes] of [["empty.png", Buffer.alloc(0)], ["fake.png", Buffer.from("not an image")],
    ["wrong.mp4", image], ["bad-dimensions.png", (() => {
      const bytes = Buffer.from(image);
      bytes.writeUInt32BE(50000, 16);
      return bytes;
    })()]]) {
    const file = path.join(theme, name);
    await fs.writeFile(file, bytes);
    invalidImages.push({ ...active, path: file, bytes: bytes.length });
  }
  const oversizedImage = path.join(theme, "large.png");
  const oversizedVideo = path.join(pending, "large.mp4");
  for (const [file, size, prefix] of [[oversizedImage, 16 * 1024 * 1024 + 1, image],
    [oversizedVideo, maxVideoBytes + 1, videoHeader]]) {
    const handle = await fs.open(file, "wx");
    try { await handle.write(prefix); await handle.truncate(size); }
    finally { await handle.close(); }
  }
  invalidImages.push({ ...active, path: oversizedImage, bytes: 16 * 1024 * 1024 + 1 },
    { ...active, path: path.join(theme, "missing.png") }, { ...active, bytes: active.bytes + 1 });
  for (const bad of invalidImages) {
    const result = await preview.update({ active: bad, selection });
    assert.equal(result.active, null, path.basename(bad.path));
    assert.ok(result.selection);
  }
  const invalidVideos = [];
  for (const [name, bytes] of [["empty.mp4", Buffer.alloc(0)], ["fake.mp4", Buffer.from("not an MP4 file")],
    ["wrong.png", videoHeader], ["truncated.mp4", videoHeader.subarray(0, 12)],
    ["bad-size.mp4", (() => { const bytes = Buffer.from(videoHeader); bytes.writeUInt32BE(1000); return bytes; })()]]) {
    const file = path.join(pending, name);
    await fs.writeFile(file, bytes);
    invalidVideos.push({ ...selection, path: file, bytes: bytes.length });
  }
  invalidVideos.push({ ...selection, path: oversizedVideo, bytes: maxVideoBytes + 1 },
    { ...selection, path: path.join(pending, "missing.mp4") }, { ...selection, bytes: selection.bytes + 1 });
  for (const bad of invalidVideos) {
    const result = await preview.update({ active, selection: bad });
    assert.ok(result.active);
    assert.equal(result.selection, null, path.basename(bad.path));
  }
});

test("both slots also support an active video and a pending image independently", async t => {
  const { theme, pending, active, selection, preview, video } = await fixture(t);
  const videoPath = path.join(theme, "saved.mp4");
  const imagePath = path.join(pending, "pending.png");
  await fs.writeFile(videoPath, video);
  await fs.writeFile(imagePath, image);
  const savedVideo = { ...active, kind: "video", path: videoPath, bytes: video.length };
  const pendingImage = { ...selection, kind: "image", path: imagePath, bytes: image.length };
  const media = await preview.update({ active: savedVideo, selection: pendingImage });
  assert.equal(media.active.mimeType, "video/mp4");
  assert.equal(media.selection.mimeType, "image/png");
  assert.deepEqual(Buffer.from((await preview.read(media.active.id, 0)).data, "base64"), video.subarray(0, PREVIEW_CHUNK_BYTES));
  assert.deepEqual(Buffer.from((await preview.read(media.selection.id, 0)).data, "base64"), image.subarray(0, PREVIEW_CHUNK_BYTES));
  const unavailableVideo = await preview.update({ active: { ...savedVideo, bytes: video.length + 1 }, selection: pendingImage });
  assert.equal(unavailableVideo.active, null);
  assert.ok(unavailableVideo.selection);
  const unavailableImage = await preview.update({ active: savedVideo, selection: { ...pendingImage, bytes: image.length + 1 } });
  assert.ok(unavailableImage.active);
  assert.equal(unavailableImage.selection, null);
});

test("file symlinks and an approved file swapped to a symlink never expose another file", async t => {
  const { directory, theme, imagePath, active, selection, preview, rejectRead } = await fixture(t);
  const outside = path.join(directory, "private.png");
  await fs.writeFile(outside, image);
  const link = path.join(theme, "link.png");
  await fs.symlink(outside, link);
  const linked = await preview.update({ active: { ...active, path: link }, selection });
  assert.equal(linked.active, null);
  assert.ok(linked.selection);
  const approved = await preview.update({ active, selection });
  await fs.rename(imagePath, `${imagePath}.old`);
  await fs.symlink(outside, imagePath);
  await rejectRead(approved.active.id, 0);
  assert.equal((await preview.update({ active, selection })).active, null);
});

test("directory symlinks before and after approval are rejected without invalidating the other slot", async t => {
  const { directory, theme, pending, active, selection, preview, rejectRead } = await fixture(t);
  const approved = await preview.update({ active, selection });
  await fs.rename(theme, `${theme}.old`);
  await fs.symlink(`${theme}.old`, theme, "dir");
  await rejectRead(approved.active.id, 0);
  const linkedActive = await preview.update({ active, selection });
  assert.equal(linkedActive.active, null);
  assert.ok(linkedActive.selection);
  await fs.unlink(theme);
  await fs.rename(`${theme}.old`, theme);
  const restored = await preview.update({ active, selection });
  await fs.rename(pending, `${pending}.old`);
  await fs.symlink(`${pending}.old`, pending, "dir");
  await rejectRead(restored.selection.id, 0);
  const linkedPending = await preview.update({ active, selection });
  assert.ok(linkedPending.active);
  assert.equal(linkedPending.selection, null);
  const linkedRoot = path.join(directory, "linked-root");
  await fs.symlink(path.dirname(theme), linkedRoot, "dir");
  const rootPreview = await createMediaPreview({ stateRoot: linkedRoot });
  try {
    assert.deepEqual(await rootPreview.update({ active: { ...active, path: path.join(linkedRoot, "theme", path.basename(active.path)) } }),
      { active: null, selection: null });
  } finally { await rootPreview.close(); }
});

test("replacement, deletion and in-place writes invalidate a previously approved file identity", async t => {
  const { imagePath, active, selection, preview, rejectRead } = await fixture(t);
  let approved = await preview.update({ active, selection });
  await fs.rename(imagePath, `${imagePath}.old`);
  await fs.writeFile(imagePath, image);
  await rejectRead(approved.active.id, 0);
  approved = await preview.update({ active, selection });
  assert.ok(approved.active);
  const handle = await fs.open(imagePath, "r+");
  try { await handle.write(Buffer.from([0]), 0, 1, image.length - 1); }
  finally { await handle.close(); }
  await fs.utimes(imagePath, new Date(0), new Date(1000));
  await rejectRead(approved.active.id, 0);
  approved = await preview.update({ active, selection });
  assert.ok(approved.active);
  await fs.unlink(imagePath);
  await rejectRead(approved.active.id, 0);
  assert.deepEqual(await preview.update({ active, selection: null }), { active: null, selection: null });
});

test("removed slots revoke their capabilities, and close is idempotent and final", async t => {
  const { preview, active, selection, rejectRead } = await fixture(t);
  const original = await preview.update({ active, selection });
  const saved = await preview.update({ active });
  assert.deepEqual(saved.active, original.active);
  assert.equal(saved.selection, null);
  await rejectRead(original.selection.id, 0);
  await preview.update({});
  await rejectRead(original.active.id, 0);
  const current = await preview.update({ active, selection });
  assert.notEqual(current.active.id, original.active.id);
  assert.notEqual(current.selection.id, original.selection.id);
  await preview.close();
  await preview.close();
  await rejectRead(current.active.id, 0);
  await rejectRead(current.selection.id, 0);
  await assert.rejects(preview.update({ active, selection }), { errorCode: "invalid_media" });
});

test("approval and all read exits close real descriptors, including abort and close after opening", async t => {
  const { preview, active, selection, imagePath, rejectRead } = await fixture(t);
  const originalOpen = fs.open;
  const descriptors = [];
  let opened;
  fs.open = async (...args) => {
    const handle = await originalOpen(...args);
    if (args[0] === imagePath || args[0] === selection.path) {
      descriptors.push(handle.fd);
      await opened?.();
    }
    return handle;
  };
  const closedDescriptors = () => {
    assert.ok(descriptors.length > 0);
    for (const descriptor of descriptors) assert.throws(() => fstatSync(descriptor), { code: "EBADF" });
    descriptors.length = 0;
  };
  try {
    await preview.update({ active, selection });
    closedDescriptors();
    assert.equal((await preview.update({ active: { ...active, bytes: active.bytes + 1 }, selection })).active, null);
    closedDescriptors();
    const approved = await preview.update({ active, selection });
    closedDescriptors();
    await preview.read(approved.active.id, 0);
    closedDescriptors();
    await rejectRead(approved.active.id, active.bytes);
    closedDescriptors();
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    await rejectRead(approved.active.id, 0, alreadyAborted.signal);
    assert.equal(descriptors.length, 0, "An already cancelled read must not open a descriptor");
    const abortAfterOpen = new AbortController();
    opened = () => abortAfterOpen.abort();
    await rejectRead(approved.active.id, 0, abortAfterOpen.signal);
    closedDescriptors();
    opened = () => preview.close();
    await rejectRead(approved.active.id, 0);
    closedDescriptors();
  } finally { fs.open = originalOpen; }
});
