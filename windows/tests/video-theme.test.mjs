import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { MAX_VIDEO_BYTES, inspectVideo, validateVideoName } from "../scripts/video-file.mjs";
import { attachVideoToSession, loadPayload, waitForVerifiedSession } from "../scripts/injector.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "xskin-video-"));
const mp4 = Buffer.from("000000186674797069736f6d0000020069736f6d6d703431", "hex");
try {
  const video = path.join(temporary, "background.mp4");
  await fs.writeFile(video, mp4);
  assert.deepEqual(await inspectVideo(video), { size: mp4.length, key: createHash("sha256").update(mp4).digest("hex") });
  assert.deepEqual(await inspectVideo(video, { headerOnly: true }), { size: mp4.length, key: null });
  const chunked = path.join(temporary, "chunked.mp4");
  const chunkedBytes = Buffer.concat([mp4, Buffer.alloc(2 * 1024 * 1024 + 123, 0x37)]);
  await fs.writeFile(chunked, chunkedBytes);
  assert.deepEqual(await inspectVideo(chunked), { size: chunkedBytes.length, key: createHash("sha256").update(chunkedBytes).digest("hex") }, "Hash every chunk, including the partial tail, without retaining the video.");
  const originalOpen = fs.open;
  try {
    fs.open = async (...args) => {
      const handle = await originalOpen(...args);
      const read = handle.read.bind(handle);
      handle.read = (buffer, offset, length, position) => read(buffer, offset, Math.min(7, length), position);
      return handle;
    };
    assert.equal((await inspectVideo(video)).key, createHash("sha256").update(mp4).digest("hex"), "Partial file reads must not invalidate a valid MP4 header or hash.");
    fs.open = async (...args) => {
      const handle = await originalOpen(...args);
      const read = handle.read.bind(handle);
      handle.read = async (...readArgs) => {
        const result = await read(...readArgs);
        if (readArgs[3] === 0) await fs.appendFile(chunked, "changed");
        return result;
      };
      return handle;
    };
    await assert.rejects(inspectVideo(chunked), /changed while being read/, "Streaming must retain the full-read mutation guard.");
  } finally {
    fs.open = originalOpen;
  }
  for (const name of ["../a.mp4", "a/b.mp4", "a\\b.mp4", "C:movie.mp4", "a.mp4:stream.mp4", "a\n.mp4", "a.webm"]) {
    assert.throws(() => validateVideoName(name));
  }
  await fs.writeFile(path.join(temporary, "bad.mp4"), "not an MP4 container");
  await assert.rejects(inspectVideo(path.join(temporary, "bad.mp4")), /MP4/);
  await assert.rejects(inspectVideo(path.join(temporary, "bad.mp4"), { headerOnly: true }), /MP4/);
  const oversized = path.join(temporary, "big.mp4");
  await fs.writeFile(oversized, mp4);
  await fs.truncate(oversized, MAX_VIDEO_BYTES + 1);
  await assert.rejects(inspectVideo(oversized), /256 MiB/);

  await fs.copyFile(path.join(root, "assets/dream-reference.jpg"), path.join(temporary, "background.jpg"));
  const theme = { name: "中文 $& theme", image: "background.jpg", video: "background.mp4", layout: "wallpaper", maskOpacity: 0.62 };
  const metadata = path.join(temporary, "theme.json");
  await fs.writeFile(metadata, JSON.stringify(theme));
  const loaded = await loadPayload(temporary);
  const realpath = fs.realpath;
  const lstat = fs.lstat;
  const virtualTheme = path.join(temporary, "virtual-theme");
  const virtualConfig = path.join(virtualTheme, "theme.json");
  try {
    fs.realpath = async filename => path.resolve(filename) === virtualConfig ? realpath(metadata)
      : path.resolve(filename) === virtualTheme ? virtualTheme : realpath(filename);
    fs.lstat = async filename => lstat(path.resolve(filename) === virtualConfig ? metadata : filename);
    const redirected = await loadPayload(virtualTheme);
    assert.equal(redirected.theme.videoKey, loaded.theme.videoKey,
      "MSIX file redirection must resolve media beside the canonical configuration file.");
  } finally {
    fs.realpath = realpath;
    fs.lstat = lstat;
  }
  try {
    fs.lstat = async filename => path.resolve(filename) === metadata ? { isFile: () => false } : lstat(filename);
    await assert.rejects(loadPayload(temporary), /configuration must be a regular file/,
      "A linked configuration cannot move the trusted media directory elsewhere.");
  } finally { fs.lstat = lstat; }
  assert.equal(loaded.theme.maskOpacity, 0.62);
  assert.equal(loaded.theme.videoBytes, mp4.length, "The Mac renderer requires the original file length during handoff.");
  assert.ok(loaded.payload.includes("中文 $& theme"), "Replacement preserves literal dollar substitution sequences.");
  assert.ok(!loaded.payload.includes("data:video/"), "Videos never expand the CDP injection payload.");
  const calls = [];
  const session = { send: async (method, params) => {
    calls.push({ method, params });
    if (method === "Runtime.evaluate") return { result: { objectId: "file-input" } };
    if (method === "Runtime.callFunctionOn") return { result: { value: true } };
    return {};
  } };
  await attachVideoToSession(session, loaded.videoSource);
  assert.deepEqual(calls.map(x => x.method), ["Runtime.evaluate", "DOM.setFileInputFiles", "Runtime.callFunctionOn", "Runtime.releaseObject"]);
  assert.deepEqual(calls[1].params.files, [await fs.realpath(video)]);
  await assert.rejects(attachVideoToSession({ send: async (method) => {
    if (method === 'Runtime.evaluate') return { result: { objectId: 'file-input' } };
    if (method === 'Runtime.callFunctionOn') return { exceptionDetails: { exception: { description: 'Video file does not match the selected theme' } } };
    return {};
  } }, loaded.videoSource), /does not match the selected theme/, 'Keep the real renderer error in diagnostics.');
  const failingCalls = [];
  await assert.rejects(attachVideoToSession({ send: async (method) => {
    failingCalls.push(method);
    if (method === "Runtime.evaluate") return { result: { objectId: "file-input" } };
    if (method === "DOM.setFileInputFiles") throw new Error("handoff failed");
    return {};
  } }, loaded.videoSource), /handoff failed/);
  assert.equal(failingCalls.at(-1), "Runtime.releaseObject");
  await fs.appendFile(video, "changed");
  await assert.rejects(attachVideoToSession(session, loaded.videoSource), /changed before handoff/);
  const changed = await loadPayload(temporary);
  assert.notEqual(changed.fingerprint, loaded.fingerprint);
  for (const maskOpacity of [-0.1, 1.1, "0.5", true]) {
    await fs.writeFile(metadata, JSON.stringify({ ...theme, maskOpacity }));
    await assert.rejects(loadPayload(temporary), /maskOpacity/);
  }
  for (const maskOpacity of [0, 1]) {
    await fs.writeFile(metadata, JSON.stringify({ ...theme, maskOpacity }));
    assert.equal((await loadPayload(temporary)).theme.maskOpacity, maskOpacity);
  }
  const expected = { id: 'current', video: 'background.mp4', videoKey: 'fixture' };
  const identity = { themeId: expected.id, videoKey: expected.videoKey };
  const frozen = await waitForVerifiedSession({ evaluate: async () => ({ ...identity, pass: true, video: { ready: true, currentTime: 0 } }) }, 250, expected);
  assert.equal(frozen.pass, false, 'A decoded but frozen video must not pass verification.');
  let time = 0;
  const playing = await waitForVerifiedSession({ evaluate: async () => ({ ...identity, pass: true, video: { ready: true, currentTime: time++ } }) }, 1200, expected);
  assert.equal(playing.pass, true);
  const stale = await waitForVerifiedSession({ evaluate: async () => ({ ...identity, themeId: 'previous', pass: true, video: { ready: true, suspended: true } }) }, 250, expected);
  assert.equal(stale.pass, false, 'A previous theme must not pass verification for a new Apply.');
  await fs.writeFile(metadata, JSON.stringify({ ...theme, video: "../background.mp4" }));
  await assert.rejects(loadPayload(temporary), /MP4 filename/);
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
console.log("PASS: MP4 validation, bounded payloads, file handoff, cleanup, mutation detection and mask limits.");
