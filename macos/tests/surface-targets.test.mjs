import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {detectSurface, earlyPayloadFor, isValidCdpTarget, waitForVerifiedSession, updateUsageOverlay, watchUsageOverlay} from '../scripts/injector.mjs';

const usageCalls = [];
let usageRequest = {visible:false, threadId:'current-thread'};
const usageSession = {async evaluate(expression) {
  usageCalls.push(expression);
  return usageCalls.length === 1 ? usageRequest : undefined;
}};
const usageReader = {
  async read(threadId) { usageCalls.push(threadId); return {threadId,totalTokens:42}; },
};
await updateUsageOverlay(usageSession, usageReader);
assert.equal(usageCalls.length, 1, 'Hidden surfaces must not read conversation logs.');
usageCalls.length = 0;
usageRequest = {visible:true, threadId:'current-thread'};
await updateUsageOverlay(usageSession, usageReader);
assert.equal(usageCalls[1], 'current-thread');
assert.match(usageCalls[2], /"threadId":"current-thread","totalTokens":42/);
assert.doesNotMatch(usageCalls[2], /updateMemory/);
usageCalls.length = 0;
usageRequest = {visible:true, threadId:null};
await updateUsageOverlay(usageSession, usageReader);
assert.equal(usageCalls.length, 2, 'Unknown threads must clear the overlay without reading a different session.');
assert.match(usageCalls[1], /update\(null\)/);

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const until = async predicate => {
  const deadline = Date.now() + 1500;
  while (!predicate() && Date.now() < deadline) await delay(5);
  assert.ok(predicate(), 'The route probe must switch the live subscription promptly.');
};
let currentUsage = {visible:true, threadId:'thread-a', installation:'one'};
const subscriptions = [];
const delivered = [];
const liveSession = {closed:false, async evaluate(expression) {
  if (expression === 'window.__CODEX_DREAM_SKIN_STATE__?.usageOverlay?.request()') return {...currentUsage};
  return vm.runInNewContext(expression, {window:{__CODEX_DREAM_SKIN_STATE__:{usageOverlay:{
    request:() => currentUsage, update:value => delivered.push(value),
  }}}});
}};
const liveReader = {watch(threadId, onSnapshot) {
  const subscription = {threadId, closed:false, onSnapshot,
    async refresh() {await onSnapshot({threadId,totalTokens:42});}, close() {this.closed = true;}};
  subscriptions.push(subscription);
  return subscription;
}};
const liveOverlay = watchUsageOverlay(liveSession, liveReader);
try {
  await until(() => delivered.length === 1);
  currentUsage = {...currentUsage, threadId:'thread-b'};
  await until(() => subscriptions.length === 2 && delivered.at(-1)?.threadId === 'thread-b');
  assert.equal(subscriptions[0].closed, true, 'Switching threads closes the old exact-file watcher.');
  const afterSwitch = delivered.length;
  await subscriptions[0].onSnapshot({threadId:'thread-a',totalTokens:999});
  assert.equal(delivered.length, afterSwitch, 'A late callback cannot publish another thread’s usage.');
  currentUsage = {...currentUsage, visible:false};
  await subscriptions[1].onSnapshot({threadId:'thread-b',totalTokens:100});
  assert.equal(delivered.length, afterSwitch, 'Hidden renderers must reject in-flight pushes.');
  await until(() => subscriptions[1].closed);
  currentUsage = {...currentUsage, visible:true};
  await until(() => subscriptions.length === 3);
  currentUsage = {...currentUsage, installation:'two'};
  await until(() => subscriptions.length === 4);
  assert.equal(subscriptions[2].closed, true, 'Reinjection must refresh even when the thread is unchanged.');
} finally { liveOverlay.close(); }
assert.equal(subscriptions.at(-1).closed, true, 'Disposing the host bridge closes its file watcher.');

const selectors = {
  codex: ['main[data-app-shell-main-surface]:not([data-app-shell-active-page="false"] *)', 'aside.app-shell-left-panel'],
  work: ['main#main #thread', '#prompt-textarea'],
  dot: ['.codex-avatar-root', '[data-avatar-overlay-native-surface-id="composer"]'],
};
const fixture = (url, markers) => ({
  location: new URL(url), URLSearchParams, window: {},
  document: {documentElement:{}, body:{}, querySelector: selector => markers.includes(selector) ? {} : null},
  setTimeout() {throw new Error('A recognized surface must install immediately');}, clearTimeout() {},
});
for (const [kind, url] of [
  ['codex', 'app://-/index.html'],
  ['work', 'https://chatgpt.com/?source=codex_app_embedded'],
  ['dot', 'app://-/index.html?initialRoute=%2Favatar-overlay'],
]) {
  const context = fixture(url, selectors[kind]);
  assert.equal(vm.runInNewContext(`(${detectSurface.toString()})()`, context), kind);
  vm.runInNewContext(earlyPayloadFor('window.installed = true', 'fixture'), context);
  assert.equal(context.window.installed, true);
}
for (const [url, markers] of [
  ['https://example.com/', selectors.codex],
  ['https://chatgpt.com.evil.example/', selectors.work],
  ['app://-/detached-window.html', []],
  ['app://-/index.html', [selectors.codex[0]]],
  ['app://-/index.html?initialRoute=%2Favatar-overlay', [selectors.dot[0]]],
]) assert.equal(vm.runInNewContext(`(${detectSurface.toString()})()`, fixture(url, markers)), null);

const target = {id:'fixture', type:'webview', url:'https://chatgpt.com/?source=codex_app_embedded',
  webSocketDebuggerUrl:'ws://127.0.0.1:9335/devtools/page/fixture'};
assert.equal(isValidCdpTarget(target, 9335), true);
for (const invalid of [
  {...target, url:'https://chatgpt.com.evil.example/'},
  {...target, url:'http://chatgpt.com/'},
  {...target, url:'https://user@chatgpt.com/'},
  {...target, type:'iframe'},
  {...target, type:'page'},
  {...target, webSocketDebuggerUrl:'ws://example.com:9335/devtools/page/fixture'},
  {...target, webSocketDebuggerUrl:'ws://127.0.0.1:9336/devtools/page/fixture'},
  {...target, webSocketDebuggerUrl:'ws://127.0.0.1:9335/devtools/page/different'},
]) assert.equal(isValidCdpTarget(invalid, 9335), false);
const theme = {id:'fixture', video:'original.mp4', videoKey:'original-key', maskOpacity:0.62};
for (const [opacity,decoded,clipped] of [[0.62,true,true],[0.3,true,true],[0.62,false,true],[0.62,true,false]]) {
  let calls = 0;
  const session = {async evaluate(expression) {
    assert.doesNotThrow(() => new vm.Script(expression), 'The browser verification expression must parse.');
    return {pass:true, surface:'dot', themeId:theme.id, videoKey:theme.videoKey,
      video:{decoded,currentTime:++calls/10,suspended:false}, dotClipVerified:clipped,
      wallpaperLayout:false, dotCards:[{video:true,poster:false,opacity}]};
  }};
  const result = await waitForVerifiedSession(session, 600, theme, true);
  assert.equal(result.pass, opacity === 0.62 && decoded && clipped,
    'Dot video requires real decoded progress, the selected mask and clipping to every visible card.');
}
console.log('PASS: Codex, embedded Work and Dot are detected; auxiliary and foreign surfaces stay untouched.');

for (const hostHidden of [true, false]) {
  const session = {async evaluate(expression) {
    assert.doesNotThrow(() => new vm.Script(expression));
    return {pass:true, surface:'work', themeId:theme.id, videoKey:theme.videoKey,
      video:{hostHidden, suspended:true, decoded:false}, wallpaperLayout:false};
  }};
  const result = await waitForVerifiedSession(session, 250, theme, true);
  assert.equal(result.pass, hostHidden, 'Only an explicitly hidden embedder may defer its first video frame.');
}

const version = (await fs.readFile(new URL('../VERSION', import.meta.url), 'utf8')).trim();
const messagingSelector = selectors.codex[0] + ' .messaging-root.messaging-embedded, ' +
  selectors.codex[0] + ' .messaging-root.messaging-embedded .thread-pane';
for (const blockedLayer of [-1, 0, 1, 2, 3, 'image']) {
  const clearStyle = {backgroundColor:'rgba(0, 0, 0, 0)', backgroundImage:'none', pointerEvents:'none'};
  const node = {querySelector: () => null,
    getBoundingClientRect: () => ({x:0, y:0, width:100, height:100}), style:clearStyle};
  const layers = Array.from({length:4}, (_, index) => ({style:{...clearStyle,
    ...(index === blockedLayer ? {backgroundColor:'rgb(24, 24, 24)'} : {}),
    ...(blockedLayer === 'image' && index === 3 ? {backgroundImage:'linear-gradient(black, black)'} : {}),
  }}));
  const session = {async evaluate(expression) {
    return vm.runInNewContext(expression, {
      innerWidth:100, innerHeight:100,
      window:{__CODEX_DREAM_SKIN_STATE__:{surface:'codex', version, themeId:'messaging', wallpaper:true}},
      getComputedStyle:(element, pseudo) => pseudo ? {backgroundColor:'rgba(0, 0, 0, 0.62)',
        backgroundImage:'none', position:'fixed', top:'0px', right:'0px', bottom:'0px', left:'0px', pointerEvents:'none'} : element.style,
      document:{body:node, documentElement:{classList:{contains:() => true},
        scrollWidth:100, clientWidth:100, scrollHeight:100, clientHeight:100},
        querySelector:selector => selectors.codex.includes(selector) ? node : null,
        querySelectorAll:selector => {
          if (selector.includes("data-app-shell-header-layout")) return [];
          assert.equal(selector, messagingSelector); return layers;
        },
        getElementById:id => ['codex-dream-skin-style', 'codex-dream-skin-chrome'].includes(id) ? node : null},
    });
  }};
  const result = await waitForVerifiedSession(session, 250, {id:'messaging', maskOpacity:0.62});
  assert.equal(result.wallpaperMask.messagingClear, blockedLayer === -1);
  assert.equal(result.pass, blockedLayer === -1,
    'Native Your dot verification must reject every opaque inner messaging surface, including background images.');
}

// Missing headers are a coverage gap; painted header layers must fail verification.
for (const blocked of ['none', 'background', 'before', 'after', 'blur', 'unused-pseudo', 'hidden', 'missing']) {
  const clearStyle = {backgroundColor:'rgba(0, 0, 0, 0)', backgroundImage:'none', backdropFilter:'none', pointerEvents:'none'};
  const header = {getBoundingClientRect:() => ({x:0,y:0,width:blocked === 'hidden' ? 0 : 100,height:40})};
  const node = {querySelector:() => null, style:clearStyle,
    getBoundingClientRect:() => ({x:0,y:0,width:100,height:100})};
  const session = {async evaluate(expression) {
    return vm.runInNewContext(expression, {
      innerWidth:100, innerHeight:100,
      window:{__CODEX_DREAM_SKIN_STATE__:{surface:'codex',version,themeId:'headers',wallpaper:true}},
      getComputedStyle:(element, pseudo) => {
        if (element === header) return {...clearStyle, content:pseudo ? '""' : 'normal',
          ...((blocked === 'background' && !pseudo) || (blocked === 'before' && pseudo === '::before')
            ? {backgroundColor:'rgb(24, 24, 24)'} : {}),
          ...(blocked === 'after' && pseudo === '::after' ? {backgroundImage:'linear-gradient(black, transparent)'} : {}),
          ...(blocked === 'blur' && !pseudo ? {backdropFilter:'blur(12px)'} : {}),
          ...(blocked === 'unused-pseudo' && pseudo ? {content:'none',backgroundColor:'rgb(24, 24, 24)'} : {}),
        };
        return pseudo ? {...clearStyle, backgroundColor:'rgba(0, 0, 0, 0.62)',
          position:'fixed',top:'0px',right:'0px',bottom:'0px',left:'0px'} : element.style;
      },
      document:{body:node,documentElement:{classList:{contains:() => true},
        scrollWidth:100,clientWidth:100,scrollHeight:100,clientHeight:100},
        querySelector:selector => selectors.codex.includes(selector) ? node : null,
        querySelectorAll:selector => selector.includes('data-app-shell-header-layout') && blocked !== 'missing' ? [header] : [],
        getElementById:id => ['codex-dream-skin-style','codex-dream-skin-chrome'].includes(id) ? node : null},
    });
  }};
  const result = await waitForVerifiedSession(session, 250, {id:'headers',maskOpacity:0.62});
  assert.equal(result.pass, ['none','unused-pseudo','hidden','missing'].includes(blocked),
    `Utility header verification must reject a painted ${blocked} layer.`);
  assert.equal(result.softNotes.utilityHeaderNotPresent, ['hidden','missing'].includes(blocked),
    'A missing/hidden header must be reported as untested, not as a verified transparent header.');
}
console.log('PASS: native utility header backgrounds, gradients, pseudo layers and blur are verified without reading page content.');
