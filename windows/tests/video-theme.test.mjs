import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_VIDEO_BYTES, readVideo, validateVideoName } from "../scripts/video-file.mjs";
import { attachVideoToSession, loadPayload, waitForVerifiedSession } from "../scripts/injector.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "xskin-video-"));
const mp4 = Buffer.from("000000186674797069736f6d0000020069736f6d6d703431", "hex");
try {
  const video = path.join(temporary, "background.mp4");
  await fs.writeFile(video, mp4);
  assert.deepEqual(await readVideo(video), mp4);
  assert.deepEqual(await readVideo(video, { headerOnly: true }), mp4);
  for (const name of ["../a.mp4", "a/b.mp4", "a\\b.mp4", "C:movie.mp4", "a.mp4:stream.mp4", "a\n.mp4", "a.webm"]) {
    assert.throws(() => validateVideoName(name));
  }
  await fs.writeFile(path.join(temporary, "bad.mp4"), "not an MP4 container");
  await assert.rejects(readVideo(path.join(temporary, "bad.mp4")), /MP4/);
  await assert.rejects(readVideo(path.join(temporary, "bad.mp4"), { headerOnly: true }), /MP4/);
  const oversized = path.join(temporary, "big.mp4");
  await fs.writeFile(oversized, mp4);
  await fs.truncate(oversized, MAX_VIDEO_BYTES + 1);
  await assert.rejects(readVideo(oversized), /256 MiB/);

  await fs.copyFile(path.join(root, "assets/dream-reference.jpg"), path.join(temporary, "background.jpg"));
  const theme = { name: "中文 $& theme", image: "background.jpg", video: "background.mp4", layout: "wallpaper", maskOpacity: 0.62 };
  const metadata = path.join(temporary, "theme.json");
  await fs.writeFile(metadata, JSON.stringify(theme));
  const loaded = await loadPayload(temporary);
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
