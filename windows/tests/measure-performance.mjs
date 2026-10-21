// Run manually against an already-enabled Codex session; never reads chat content.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CdpSession } from '../scripts/injector.mjs';

const state = JSON.parse(await fs.readFile(path.join(process.env.LOCALAPPDATA, 'CodexDreamSkin', 'state.json'), 'utf8'));
const get = async endpoint => (await fetch(`http://127.0.0.1:${state.port}${endpoint}`, {redirect:'error', signal:AbortSignal.timeout(3000)})).json();
assert.equal(new URL((await get('/json/version')).webSocketDebuggerUrl).pathname, `/devtools/browser/${state.browserId}`);
let session;
for (const target of (await get('/json/list')).filter(t => t.type === 'page' && t.url.startsWith('app://'))) {
  const candidate = await new CdpSession(target, state.port).open();
  if (await candidate.evaluate('Boolean(window.__CODEX_DREAM_SKIN_STATE__ && document.querySelector("[data-app-shell-active-page=true] main[data-app-shell-main-surface]"))')) { session = candidate; break; }
  candidate.close();
}
assert.ok(session, 'An enabled Codex background is required');
try {
  await session.send('Page.bringToFront');
  await session.send('Performance.enable');
  const sample = async () => ({
    browser: Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(m => [m.name,m.value])),
    skin: await session.evaluate('({...window.__CODEX_DREAM_SKIN_STATE__.metrics})'),
    video: await session.evaluate('(() => {const v=document.getElementById("codex-dream-skin-video"); return v ? {time:v.currentTime,frames:v.getVideoPlaybackQuality().totalVideoFrames,width:v.videoWidth,height:v.videoHeight,paused:v.paused} : null;})()'),
  });
  const before = await sample();
  await session.evaluate(`(async () => {
    const host = document.createElement('div');
    host.id = 'xskin-performance-fixture';
    host.hidden = true;
    document.querySelector('[data-app-shell-active-page=true] main[data-app-shell-main-surface]').appendChild(host);
    try {
      for (let i=0;i<100;i++) {
        if (document.hidden) throw new Error('Keep Codex visible during measurement');
        host.appendChild(document.createElement('span'));
        await new Promise(resolve=>setTimeout(resolve,50));
      }
    } finally { host.remove(); }
    await new Promise(resolve=>setTimeout(resolve,150));
  })()`);
  const after = await sample();
  const report = {
    durationSeconds: after.browser.Timestamp-before.browser.Timestamp,
    routePasses: after.skin.routePasses-before.skin.routePasses,
    layoutReads: after.skin.layoutReads-before.skin.layoutReads,
    scriptSeconds: after.browser.ScriptDuration-before.browser.ScriptDuration,
    taskSeconds: after.browser.TaskDuration-before.browser.TaskDuration,
    video: after.video,
    decodedFrames: after.video && before.video ? after.video.frames-before.video.frames : null,
  };
  console.log(JSON.stringify(report,null,2));
  if (process.argv[2]) await fs.writeFile(process.argv[2], JSON.stringify(report,null,2));
} finally { session.close(); }
