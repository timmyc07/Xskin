// Run in separate fresh Node processes on each revision; never imports or changes media.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { loadPayload } from '../scripts/injector.mjs';

const themeDir = path.join(process.env.LOCALAPPDATA, 'CodexDreamSkin', 'active-theme');
const startCpu = process.cpuUsage();
const startTime = performance.now();
let videoKey;
let loaded;
for (let index = 0; index < 30; index++) {
  loaded = await loadPayload(themeDir);
  assert.ok(loaded.theme.videoKey, 'Select a video background before measuring');
  videoKey ??= loaded.theme.videoKey;
  assert.equal(loaded.theme.videoKey, videoKey, 'Discard this run: the video changed');
}
const cpu = process.cpuUsage(startCpu);
const report = {
  loads: 30,
  cpuMs: (cpu.user + cpu.system) / 1000,
  wallMs: performance.now() - startTime,
  peakRssMiB: process.resourceUsage().maxRSS / 1024,
  externalMiB: process.memoryUsage().external / 1024 / 1024,
  videoBytes: loaded.theme.videoBytes,
  videoKey,
};
const json = JSON.stringify(report, null, 2);
if (process.argv[2]) await fs.writeFile(process.argv[2], json);
console.log(json);
