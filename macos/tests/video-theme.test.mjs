import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import { createHash } from "node:crypto";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MAX_VIDEO_BYTES, inspectVideo, copyVideo, validateVideoName } from "../scripts/video-file.mjs";
import { attachVideoToSession, loadPayload, waitForVerifiedSession } from "../scripts/injector.mjs";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "dream-skin-video-test-"));
const mp4 = Buffer.from("000000186674797069736f6d0000020069736f6d6d703431", "hex");
try {
  const source = path.join(temporary, "source.mp4");
  await fs.writeFile(source, mp4);
  assert.deepEqual(await inspectVideo(source), { size: mp4.length, key: createHash("sha256").update(mp4).digest("hex") });
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
    assert.equal((await inspectVideo(source)).key, createHash("sha256").update(mp4).digest("hex"), "Partial file reads must not invalidate a valid MP4 header or hash.");
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
  for (const name of ["../outside.mp4", "nested/movie.mp4", "x\\movie.mp4", "x\n.mp4", "movie.webm", "", null]) {
    assert.throws(() => validateVideoName(name), /MP4 filename/);
  }
  const link = path.join(temporary, "link.mp4");
  await fs.symlink(source, link);
  await assert.rejects(inspectVideo(link), /ELOOP/);
  const invalid = path.join(temporary, "invalid.mp4");
  await fs.writeFile(invalid, "this is not an MP4 video file");
  await assert.rejects(inspectVideo(invalid), /not an MP4/);
  const oversized = path.join(temporary, "oversized.mp4");
  await fs.writeFile(oversized, mp4);
  await fs.truncate(oversized, MAX_VIDEO_BYTES + 1);
  await assert.rejects(inspectVideo(oversized), /256 MiB/);

  const copiedVideo = path.join(temporary, "copied.mp4");
  await copyVideo(source, copiedVideo);
  assert.deepEqual(await fs.readFile(copiedVideo), mp4, "Copy preserves the exact original video bytes");
  await assert.rejects(copyVideo(source, copiedVideo), /EEXIST/);
  assert.deepEqual(await fs.readFile(copiedVideo), mp4, "A failed exclusive copy preserves the existing destination");
  const originalCopy = fs.copyFile;
  try {
    fs.copyFile = async (...args) => {
      await originalCopy(...args);
      await fs.appendFile(args[1], "changed");
    };
    const changedCopy = path.join(temporary, "changed-copy.mp4");
    await assert.rejects(copyVideo(source, changedCopy), /changed while being copied/);
    await assert.rejects(fs.access(changedCopy), /ENOENT/, "A mismatched copy cannot be published");
  } finally { fs.copyFile = originalCopy; }

  const themeDir = path.join(temporary, "theme");
  const stage = path.join(temporary, "stage");
  await fs.mkdir(themeDir);
  await fs.mkdir(stage);
  await fs.copyFile(path.join(root, "presets/preset-midnight-aurora/background.jpg"), path.join(themeDir, "background.jpg"));
  const initial = { schemaVersion: 1, id: "test", name: "中文 $& theme", image: "background.jpg" };
  const configPath = path.join(themeDir, "theme.json");
  await fs.writeFile(configPath, JSON.stringify(initial));
  const imageOnly = await loadPayload(themeDir);
  assert.equal(imageOnly.videoBytes, 0);
  assert.equal(imageOnly.theme.maskOpacity, 0.62);
  for (const maskOpacity of [-0.01, 1.01, "0.5", null]) {
    await fs.writeFile(configPath, JSON.stringify({ ...initial, maskOpacity }));
    await assert.rejects(loadPayload(themeDir), /invalid maskOpacity field/);
  }
  await fs.writeFile(configPath, JSON.stringify({ ...initial, maskOpacity: 0 }));
  assert.equal((await loadPayload(themeDir)).theme.maskOpacity, 0);
  await fs.writeFile(configPath, JSON.stringify(initial));
  const prepare = (file) => run(process.execPath, [path.join(root, "scripts/prepare-video-theme.mjs"), file, themeDir]);
  await assert.rejects(prepare(invalid), /not an MP4/);
  assert.deepEqual(JSON.parse(await fs.readFile(configPath)), initial, "Rejected video preserves the existing theme");
  await prepare(source);
  const prepared = JSON.parse(await fs.readFile(configPath));
  assert.ok(prepared.video.endsWith(".mp4"));
  assert.equal(prepared.appearance, "dark");
  const loaded = await loadPayload(themeDir);
  assert.equal(loaded.videoBytes, mp4.length);
  assert.ok(!loaded.payload.includes("data:video/mp4;base64,"), "Original video bytes must not inflate the CDP payload");
  assert.equal(loaded.videoSource.size, mp4.length);
  assert.ok(!loaded.payload.includes("__DREAM_SKIN_VIDEO_JSON__"));
  await run(process.execPath, [path.join(root, "scripts/stage-theme.mjs"), themeDir, stage]);
  assert.deepEqual(await fs.readFile(path.join(stage, prepared.video)), mp4);
  const calls = [];
  const session = { send: async (method, params) => {
    calls.push({ method, params });
    if (method === "Runtime.evaluate") return { result: { objectId: "private-video-input" } };
    if (method === "Runtime.callFunctionOn") return { result: { value: true } };
    return {};
  } };
  await attachVideoToSession(session, loaded.videoSource);
  assert.deepEqual(calls.map(x => x.method), ["Runtime.evaluate", "DOM.setFileInputFiles", "Runtime.callFunctionOn", "Runtime.releaseObject"]);
  assert.deepEqual(calls[1].params.files, [loaded.videoSource.path]);
  assert.equal(calls[2].params.arguments[0].value, loaded.theme.videoKey);
  const failingCalls = [];
  await assert.rejects(attachVideoToSession({ send: async (method) => {
    failingCalls.push(method);
    if (method === "Runtime.evaluate") return { result: { objectId: "failed-input" } };
    if (method === "DOM.setFileInputFiles") throw new Error("handoff unavailable");
    return {};
  } }, loaded.videoSource), /handoff unavailable/);
  assert.equal(failingCalls.at(-1), "Runtime.releaseObject");
  await fs.appendFile(path.join(themeDir, prepared.video), Buffer.from("changed"));
  await assert.rejects(attachVideoToSession(session, loaded.videoSource), /changed before handoff/);
  assert.notEqual((await loadPayload(themeDir)).revision, loaded.revision, "Video edits change the payload fingerprint");
  assert.deepEqual(await fs.readFile(path.join(stage, prepared.video)), mp4, "Staged media is isolated from source edits");

  await fs.writeFile(configPath, JSON.stringify({ ...prepared, video: "../source.mp4" }));
  await assert.rejects(loadPayload(themeDir), /MP4 filename/);
  await fs.writeFile(configPath, JSON.stringify({ ...prepared, video: "link.mp4" }));
  await fs.symlink(source, path.join(themeDir, "link.mp4"));
  await assert.rejects(loadPayload(themeDir), /regular file/);

  const fixtureVideoTheme = { id: "test", video: "test.mp4", videoKey: "fixture-video-key" };
  const fixtureIdentity = { themeId: fixtureVideoTheme.id, videoKey: fixtureVideoTheme.videoKey };
  const frozen = await waitForVerifiedSession({ evaluate: async () => ({ ...fixtureIdentity, pass: true, video: { ready: true, currentTime: 0 } }) }, 250, fixtureVideoTheme);
  assert.equal(frozen.pass, false, "Verify rejects a video whose playhead never advances");
  let time = 0;
  const playing = await waitForVerifiedSession({ evaluate: async () => ({ ...fixtureIdentity, pass: true, video: { ready: true, currentTime: time++ } }) }, 1200, fixtureVideoTheme);
  assert.equal(playing.pass, true);
  const videoQuality = (sampledAtMs, totalFrames, droppedFrames) => ({ sampledAtMs, totalFrames, droppedFrames });
  const qualitySnapshot = (quality, overrides = {}) => ({ ...fixtureIdentity, pass: true,
    videoBox: { visible: true }, startupFrames: { documentHidden: false },
    video: { ready: true, paused: false, suspended: false, currentTime: 1, quality }, ...overrides });
  const measureQuality = async samples => {
    let index = 0;
    let elapsed = 0;
    return vm.runInNewContext(`(${waitForVerifiedSession.toString()})(null, 1500, expectedTheme)`, {
      expectedTheme: fixtureVideoTheme,
      verifySession: async () => {
        const snapshot = structuredClone(samples[Math.min(index, samples.length - 1)]);
        snapshot.video.currentTime += index++;
        return snapshot;
      },
      Date: { now: () => elapsed },
      setTimeout(callback, ms) { elapsed += ms; callback(); },
    });
  };
  const firstQuality = videoQuality(1000, 100, 2);
  const nextQuality = videoQuality(1500, 130, 4);
  const measured = await measureQuality([qualitySnapshot(firstQuality), qualitySnapshot(nextQuality)]);
  assert.equal(measured.pass, true, "Playback quality diagnostics must retain the existing pass decision.");
  assert.deepEqual(JSON.parse(JSON.stringify(measured.video.playbackSample)),
    { sampleMs: 500, presentedFps: 56, dropRatio: 2 / 30 }, "Presented FPS excludes source-reported dropped frames over the actual sample interval.");
  for (const second of [
    qualitySnapshot(null), qualitySnapshot({}),
    qualitySnapshot(videoQuality(1000, 130, 4)),
    qualitySnapshot(videoQuality(900, 130, 4)),
    qualitySnapshot(videoQuality(1500, 99, 2)),
    qualitySnapshot(videoQuality(1500, 130, 1)),
    qualitySnapshot(videoQuality(1500, 101, 4)),
    qualitySnapshot(videoQuality(1500, 100, 2)),
    qualitySnapshot(nextQuality, { videoBox: { visible: false } }),
    qualitySnapshot(nextQuality, { startupFrames: { documentHidden: true } }),
    qualitySnapshot(nextQuality, { video: { ready: true, paused: true, suspended: false, currentTime: 1, quality: nextQuality } }),
    qualitySnapshot(nextQuality, { video: { ready: true, paused: true, suspended: true, currentTime: 1, quality: nextQuality } }),
    qualitySnapshot(nextQuality, { videoKey: "another-video" }),
  ]) {
    const unavailable = await measureQuality([qualitySnapshot(firstQuality), second]);
    assert.equal(unavailable.video.playbackSample, null,
      "Missing/reset/hidden/paused/replaced samples cannot establish a frame rate.");
  }
  const resumed = await measureQuality([
    qualitySnapshot(firstQuality, { videoBox: { visible: false } }), qualitySnapshot(nextQuality),
  ]);
  assert.equal(resumed.video.playbackSample, null, "An interval crossing a hidden sample must not include those frames.");
  const node = { getBoundingClientRect: () => ({ x: 0, y: 0, width: 1000, height: 700 }) };
  const videoNode = { ...node };
  let videoVisible = false;
  let homeRoute = false;
  let homePresent = false;
  let maskOpacity = 0.62;
  let maskGradient = false;
  let mainTint = false;
  const homeNode = { ...node, querySelector: () => null };
  const verificationContext = {
    window: { __CODEX_DREAM_SKIN_STATE__: {
      ...fixtureIdentity,
      version: (await fs.readFile(path.join(root, "VERSION"), "utf8")).trim(),
      videoStatus: () => ({ ready: true, suspended: false, currentTime: time++ }),
    } },
    document: {
      documentElement: { classList: { contains: () => true }, scrollWidth: 1000, clientWidth: 1000, scrollHeight: 700, clientHeight: 700 },
      body: node,
      querySelector(selector) {
        if (selector === '[data-app-shell-active-page="true"]') return { querySelector: selector => {
          if (selector === '[data-feature="game-source"]' && homeRoute) return { closest: () => homeNode };
          if (selector === '[role="main"].dream-skin-home, [role="main"].dream-skin-video-home' && homePresent) return homeNode;
          return null;
        } };
        if (selector === '[data-composer-body]:not([data-app-shell-active-page="false"] *)') return node;
        if (selector === 'aside.app-shell-left-panel' || selector === 'main[data-app-shell-main-surface]:not([data-app-shell-active-page="false"] *)') return node;
        return null;
      },
      querySelectorAll() { return []; },
      getElementById(id) { return id === "codex-dream-skin-video" ? videoNode : node; },
    },
    getComputedStyle: (element, pseudo) => ({
      display: element === videoNode && !videoVisible ? "none" : "block", visibility: "visible", pointerEvents: "none",
      position: "fixed", top: "0px", right: "0px", bottom: "0px", left: "0px",
      backgroundColor: pseudo ? `rgba(0, 0, 0, ${maskOpacity})` : mainTint ? "rgba(0, 0, 0, 0.8)" : "rgba(0, 0, 0, 0)",
      backgroundImage: maskGradient ? "linear-gradient(black, transparent)" : "none",
    }),
    innerWidth: 1000, innerHeight: 700,
  };
  const rendererSession = { evaluate: async expression => vm.runInNewContext(expression, verificationContext) };
  assert.equal((await waitForVerifiedSession(rendererSession, 250, fixtureVideoTheme)).pass, false, "Decoded playback alone cannot verify a hidden video layer");
  videoVisible = true;
  assert.equal((await waitForVerifiedSession(rendererSession, 1200, fixtureVideoTheme)).pass, true, "The active native surface and a visible progressing video must verify");
  homeRoute = true;
  assert.equal((await waitForVerifiedSession(rendererSession, 250, fixtureVideoTheme)).pass, false, "Home must carry its route styles before verification succeeds.");
  homePresent = true;
  assert.equal((await waitForVerifiedSession(rendererSession, 1200, fixtureVideoTheme)).pass, true, "A full-window video Home verifies with its native composer before optional suggestion cards appear.");
  const expectedVideoTheme = { id: "selected-video", video: "selected.mp4", videoKey: "selected-video-key" };
  const rendererState = verificationContext.window.__CODEX_DREAM_SKIN_STATE__;
  rendererState.themeId = "previous-video";
  rendererState.videoKey = "previous-video-key";
  assert.equal((await waitForVerifiedSession(rendererSession, 600, expectedVideoTheme)).pass, false, "A still-playing previous background must not verify the newly selected theme.");
  rendererState.themeId = expectedVideoTheme.id;
  assert.equal((await waitForVerifiedSession(rendererSession, 600, expectedVideoTheme)).pass, false, "The selected theme ID cannot verify an old video fingerprint.");
  rendererState.videoKey = expectedVideoTheme.videoKey;
  assert.equal((await waitForVerifiedSession(rendererSession, 1200, expectedVideoTheme)).pass, true, "The selected, progressing video verifies after its handoff completes.");
  rendererState.videoStatus = () => ({ ready: false, suspended: true, currentTime: 0 });
  assert.equal((await waitForVerifiedSession(rendererSession, 250, expectedVideoTheme)).pass, true, "Intentional hidden/reduced-motion suspension remains valid for the selected video.");
  assert.equal((await waitForVerifiedSession(rendererSession, 250, expectedVideoTheme, true)).pass, false, "A prepared launch cannot present a video before its first decoded frame.");
  rendererState.videoStatus = () => ({ ready: false, suspended: true, decoded: true, currentTime: 0 });
  assert.equal((await waitForVerifiedSession(rendererSession, 250, expectedVideoTheme, true)).pass, true, "A decoded paused video can be prepared before the window is shown.");
  const expectedImageTheme = { id: "selected-image" };
  rendererState.themeId = expectedImageTheme.id;
  assert.equal((await waitForVerifiedSession(rendererSession, 250, expectedImageTheme)).pass, false, "Switching to an image must remove the previous video controller before verifying.");
  delete rendererState.videoStatus;
  delete rendererState.videoKey;
  rendererState.wallpaper = true;
  assert.equal((await waitForVerifiedSession(rendererSession, 250, expectedImageTheme)).pass, true, "The selected image verifies after the previous video is removed.");
  maskGradient = true;
  assert.equal((await waitForVerifiedSession(rendererSession, 250, expectedImageTheme)).pass, false, "A directional mask cannot pass as a uniform full-window mask.");
  maskGradient = false;
  mainTint = true;
  assert.equal((await waitForVerifiedSession(rendererSession, 250, expectedImageTheme)).pass, false, "A second tint on a structural surface must fail verification.");
  mainTint = false;
  maskOpacity = 0.85;
  assert.equal((await waitForVerifiedSession(rendererSession, 250, expectedImageTheme)).pass, false, "An old mask depth cannot verify a new mask setting.");
  assert.equal((await waitForVerifiedSession(rendererSession, 250, { ...expectedImageTheme, maskOpacity: 0.85 })).pass, true);
  maskOpacity = 0;
  assert.equal((await waitForVerifiedSession(rendererSession, 250, { ...expectedImageTheme, maskOpacity: 0 })).pass, true, "A fully clear mask remains a valid user setting.");
  maskOpacity = 1;
  assert.equal((await waitForVerifiedSession(rendererSession, 250, { ...expectedImageTheme, maskOpacity: 1 })).pass, true, "A fully dark mask remains a valid user setting.");
  rendererState.themeId = expectedVideoTheme.id;
  rendererState.videoKey = expectedVideoTheme.videoKey;
  assert.equal((await waitForVerifiedSession(rendererSession, 250, expectedVideoTheme)).pass, false, "A selected video without its controller must not verify as a static background.");
  console.log("PASS: video validation, atomic preparation, staging, fingerprints, and playback verification.");
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
