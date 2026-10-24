import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "xskin-panel-")));
const stateRoot = path.join(temporary, "state");
const runtimeRoot = path.join(temporary, "runtime");
const run = async (action, request = {}, embedded = false, targetRoot = stateRoot) => {
  const requestPath = path.join(temporary, "request.json");
  await fs.writeFile(requestPath, JSON.stringify(request));
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
      path.join(runtimeRoot, "scripts/xskin-command.ps1"), "-Action", action, "-StateRoot", targetRoot,
      "-RequestPath", requestPath, ...(embedded ? ["-Embedded"] : [])], { windowsHide: true, timeout: 30000,
      env: { ...process.env, PSModulePath: path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/Modules') } });
    let output = "";
    let errors = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", value => { output += value; });
    child.stderr.on("data", value => { errors += value; });
    child.on("error", reject);
    child.on("close", code => {
      try {
        const line = output.split(/\r?\n/).find(line => line.startsWith("XSKIN_RESULT:"));
        assert.ok(line, errors || output);
        resolve({ code, ...JSON.parse(line.slice("XSKIN_RESULT:".length)) });
      } catch (error) { reject(error); }
    });
    child.stdin.end();
  });
};
try {
  for (const directory of ['scripts','assets','presets']) {
    await fs.cp(path.join(root,directory),path.join(runtimeRoot,directory),{recursive:true});
  }
  await fs.copyFile(path.join(root, 'VERSION'), path.join(runtimeRoot, 'VERSION'));
  const helpers = path.join(runtimeRoot,'scripts/autostart-windows.ps1');
  const startupPath = path.join(temporary,'startup.lnk').replaceAll("'","''");
  await fs.writeFile(helpers,(await fs.readFile(helpers,'utf8')).replace(
    "return Join-Path ([Environment]::GetFolderPath('Startup')) 'Xskin Codex backgrounds.lnk'",
    `return '${startupPath}'`).replace(
    "return 'Xskin-Codex-backgrounds-' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value",
    `return 'Xskin-panel-${path.basename(temporary)}'`));
  await fs.appendFile(path.join(runtimeRoot, "scripts/xskin-theme.ps1"), `
function Get-XskinAutostart {
  param([string]$StateRoot)
  $enabled = Test-Path -LiteralPath (Join-Path $StateRoot 'automatic-enabled.txt')
  return @{ Enabled = $enabled; Loaded = $enabled; Foreign = $false }
}
function Set-XskinAutostart {
  param([bool]$Enabled, [string]$SkillRoot, [string]$StateRoot)
  $file = Join-Path $StateRoot 'automatic-enabled.txt'
  if ($Enabled) {
    [IO.File]::WriteAllText($file, 'enabled')
    [IO.File]::AppendAllText((Join-Path $StateRoot 'automatic-setups.txt'), 'setup')
  } elseif (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file }
  Write-XskinSettings -StateRoot $StateRoot -Values @{ launchSetupVersion = 3; shortcutSkinEnabled = $Enabled }
}
function Install-DreamSkinRuntimeEngine {
  param([string]$StateRoot)
  [IO.Directory]::CreateDirectory($StateRoot) | Out-Null
  [IO.File]::WriteAllText((Join-Path $StateRoot 'runtime-prepared.txt'), 'prepared')
  return @{ Start = (Join-Path $PSScriptRoot 'fixture-resume.ps1') }
}
`);
  const unprepared = await run('status', {}, true);
  assert.equal(unprepared.code, 0, unprepared.error);
  assert.equal(unprepared.state.needsSetup, true);
  assert.equal(unprepared.state.maskOpacity, .62);
  assert.equal(unprepared.state.language, 'en');
  assert.equal(await fs.stat(stateRoot).then(() => true, () => false), false, 'Read-only status never creates a store or launch entries.');
  const preferencesRoot = path.join(temporary, 'preferences before import');
  const firstPreferences = await run('preferences', { language: 'ja' }, true, preferencesRoot);
  assert.equal(firstPreferences.code, 0, firstPreferences.error);
  assert.equal(firstPreferences.state.needsSetup, true);
  assert.equal(firstPreferences.state.language, 'ja');
  for (const directory of ['active-theme', 'engine', 'themes']) {
    assert.equal(await fs.access(path.join(preferencesRoot, directory)).then(() => true, () => false), false,
      'Choosing a language before import never prepares media, a runtime or launch monitoring.');
  }
  assert.equal((await run('status', {}, true, preferencesRoot)).state.needsSetup, true);
  const firstImportRoot = path.join(temporary, 'first embedded import');
  const firstSource = path.join(temporary, 'first image.jpg');
  await fs.copyFile(path.join(root, 'assets/dream-reference.jpg'), firstSource);
  const firstImport = await run('import', { path: firstSource }, true, firstImportRoot);
  assert.equal(firstImport.code, 0, firstImport.error);
  assert.equal(firstImport.state.pending, true);
  assert.equal(firstImport.state.autostart, false);
  assert.equal(await fs.readFile(path.join(firstImportRoot, 'runtime-prepared.txt'), 'utf8'), 'prepared');
  assert.equal(await fs.access(path.join(firstImportRoot, 'automatic-enabled.txt')).then(() => true, () => false), false,
    'An embedded first import prepares local media/runtime without enabling launch monitoring.');
  const initial = await run("state");
  assert.equal(initial.code, 0, initial.error);
  assert.equal(initial.state.autostart, true);
  const repeated = await run("state");
  assert.equal(repeated.code, 0, repeated.error);
  assert.equal(repeated.state.autostart, true);
  assert.equal(await fs.readFile(path.join(stateRoot, "automatic-setups.txt"), "utf8"), "setup");
  assert.equal((await run("autostart", { enabled: false })).state.autostart, false);
  assert.equal((await run("state")).state.autostart, false);
  assert.equal(initial.state.pending, false);
  assert.ok(initial.state.saved.length > 0);
  assert.equal(initial.state.saved.length, 6);
  assert.equal(initial.state.activeName, '午夜极光');
  assert.equal(typeof initial.state.saved[0].directory, 'string');
  assert.equal(typeof initial.state.saved[0].name, 'string');
  const originalMetadata = await fs.readFile(path.join(stateRoot, "active-theme/theme.json"), "utf8");
  const source = path.join(temporary, "中文 $& picture.jpg");
  await fs.copyFile(path.join(root, "assets/dream-reference.jpg"), source);
  const imported = await run("import", { path: source });
  assert.equal(imported.code, 0, imported.error);
  assert.equal(imported.state.pending, true);
  assert.equal(imported.state.name, "中文 $& picture.jpg");
  assert.match(imported.state.selectionId, /^[a-f0-9]{32}$/);
  assert.equal(imported.messageCode, 'imported');
  assert.equal(await fs.readFile(path.join(stateRoot, "active-theme/theme.json"), "utf8"), originalMetadata);
  for (const maskOpacity of [-1, 2, "0.5", true]) {
    const invalid = await run("apply", { maskOpacity });
    assert.equal(invalid.code, 1);
    assert.match(invalid.error, /Mask opacity/);
    assert.equal(invalid.errorCode, 'invalidMask');
  }
  // Resume explicitly starts the engine; use a local stub with the actual StateRoot contract.
  await fs.writeFile(path.join(runtimeRoot, 'scripts/fixture-resume.ps1'), 'param([switch]$Resume, [string]$StateRoot)');
  await fs.appendFile(path.join(runtimeRoot, 'scripts/xskin-theme.ps1'), "\nfunction Install-DreamSkinRuntimeEngine { return @{ Start = (Join-Path $PSScriptRoot 'fixture-resume.ps1') } }\n");
  const paused = await run("pause");
  assert.equal(paused.code, 0, paused.error);
  for (const maskOpacity of [0, 1]) {
    const stale = await run("apply", { maskOpacity, imagePath: source });
    assert.equal(stale.code, 1);
    assert.match(stale.error, /preview changed/);
  }
  const longSource = path.join(temporary, "a".repeat(130) + ".jpg");
  await fs.copyFile(source, longSource);
  const longName = await run("import", { path: longSource });
  assert.equal(longName.code, 0, longName.error);
  assert.equal(longName.state.name, path.basename(longSource));
  assert.equal(paused.state.paused, true);
  assert.equal((await run("pause")).state.paused, false);
  const escaped = await run("select", { directory: temporary });
  assert.equal(escaped.code, 1);
  assert.match(escaped.error, /saved theme/);
  assert.equal(await fs.readFile(path.join(stateRoot, "active-theme/theme.json"), "utf8"), originalMetadata);
  const preferences = await run("preferences", { language: "zh-Hant" });
  assert.equal(preferences.state.language, "zh-Hant");
  const invalidLanguage = await run("preferences", { language: "unknown" });
  assert.equal(invalidLanguage.code, 1);
  const unsupported = path.join(temporary, 'unsupported.txt');
  await fs.writeFile(unsupported, 'file');
  assert.equal((await run('import', { path: unsupported })).errorCode, 'unsupportedFormat');
  const mask = await run("mask", { maskOpacity: 0.27 });
  assert.equal(mask.state.maskOpacity, 0.27);
  assert.equal(mask.state.pending, true);
  assert.equal(mask.state.language, "zh-Hant");
  const movie = path.join(temporary, "original.mp4");
  const movieBytes = Buffer.from("000000186674797069736f6d0000020069736f6d6d703431", "hex");
  await fs.writeFile(movie, movieBytes);
  const importedMovie = await run("import", { path: movie });
  assert.equal(importedMovie.code, 0);
  assert.equal(importedMovie.state.pending, true);
  assert.equal(importedMovie.state.language, "zh-Hant");
  assert.equal(importedMovie.state.maskOpacity, 0.27);
  assert.deepEqual(await fs.readFile(importedMovie.state.videoPath), movieBytes);
  assert.ok(importedMovie.state.imagePath, "A video uses the active image fallback without waiting for a poster screenshot.");
  await fs.appendFile(path.join(runtimeRoot, "scripts/xskin-theme.ps1"),
    "\nfunction Test-XskinApplied { param([string]$StateRoot) return $true }\n" +
    "function Install-DreamSkinRuntimeEngine { param([string]$SkillRoot, [string]$StateRoot) return @{ Start = (Join-Path $PSScriptRoot 'start-dream-skin.ps1') } }\n");
  for (const action of ["start", "verify", "restore"]) {
    await fs.writeFile(path.join(runtimeRoot, `scripts/${action}-dream-skin.ps1`), `
param([switch]$PromptRestart, [switch]$Resume, [switch]$ExistingOnly, [switch]$ReuseWatcher, [string]$StateRoot)
if ([IO.Path]::GetFullPath($StateRoot) -ine '${stateRoot.replaceAll("'", "''")}') {
  throw ('The panel did not forward its custom state root: actual=' + $StateRoot + '; expected=' + '${stateRoot.replaceAll("'", "''")}')
}
[IO.File]::WriteAllText((Join-Path $StateRoot '${action}-root.txt'), $StateRoot)
if ($ExistingOnly) { [IO.File]::AppendAllText((Join-Path $StateRoot 'existing-only.txt'), '${action}\n') }
if ($ReuseWatcher) { [IO.File]::AppendAllText((Join-Path $StateRoot 'reuse-watcher.txt'), '${action}\n') }
$global:LASTEXITCODE = 0
`);
  }
  for (const [action, request] of [["launch", {}], ["mask", { maskOpacity: 0.31 }], ["restore", {}]]) {
    const result = await run(action, request);
    assert.equal(result.code, 0, result.error);
  }
  for (const action of ["start", "verify", "restore"]) {
    assert.equal(await fs.readFile(path.join(stateRoot, `${action}-root.txt`), "utf8"), stateRoot);
  }
  const pending = (await run('status', {}, true)).state;
  const staleSelection = await run('apply', { imagePath: pending.imagePath, selectionId: '0'.repeat(32), maskOpacity: .31 }, true);
  assert.equal(staleSelection.errorCode, 'selectMedia');
  const embeddedMask = await run('mask', { maskOpacity: .42 }, true);
  assert.equal(embeddedMask.code, 0, embeddedMask.error);
  assert.equal(embeddedMask.state.selectionId, pending.selectionId);
  const embeddedApplied = await run('apply', { imagePath: pending.imagePath, selectionId: pending.selectionId, maskOpacity: .42 }, true);
  assert.equal(embeddedApplied.code, 0, embeddedApplied.error);
  assert.equal(embeddedApplied.state.pending, false);
  assert.equal(embeddedApplied.state.autostart, false);
  assert.equal((await run('resume', {}, true)).code, 0);
  assert.equal(await fs.readFile(path.join(stateRoot, 'existing-only.txt'), 'utf8'), 'start\nstart\nstart\n');
  assert.equal(await fs.readFile(path.join(stateRoot, 'reuse-watcher.txt'), 'utf8'), 'start\nstart\n');
  assert.equal((await run('recover', {}, true)).recovered, false);
  const startScript = path.join(runtimeRoot, 'scripts/start-dream-skin.ps1');
  const originalStart = await fs.readFile(startScript);
  for (const action of ['mask', 'apply']) {
    if (action === 'apply') assert.equal((await run('import', { path: source })).code, 0);
    const before = (await run('status', {}, true)).state;
    const activeMetadata = path.join(stateRoot, 'active-theme/theme.json');
    const previous = await fs.readFile(activeMetadata);
    const calls = path.join(stateRoot, 'rollback-calls.txt');
    await fs.rm(calls, { force: true });
    await fs.writeFile(startScript, `
param([switch]$ExistingOnly, [switch]$ReuseWatcher, [switch]$Resume, [string]$StateRoot)
if (-not $ExistingOnly -or -not $ReuseWatcher) { throw 'Embedded apply and rollback must reuse the existing watcher.' }
$calls = Join-Path $StateRoot 'rollback-calls.txt'
$first = -not (Test-Path -LiteralPath $calls)
[IO.File]::AppendAllText($calls, 'reapply')
if ($first) { throw 'fixture verification failure' }
`);
    const failed = await run(action, { maskOpacity: .81, imagePath: before.imagePath, selectionId: before.selectionId }, true);
    assert.equal(failed.code, 1);
    assert.equal(failed.errorCode, action === 'apply' ? 'applyFailedRestored' : 'maskFailedRestored');
    assert.equal(await fs.readFile(calls, 'utf8'), 'reapplyreapply', 'Rollback uses the same hot-apply path.');
    assert.deepEqual(await fs.readFile(activeMetadata), previous);
    assert.equal((await run('status', {}, true)).state.selectionId, before.selectionId);
    await fs.writeFile(startScript, originalStart);
  }
  for (const action of ['mask', 'apply']) {
    if (action === 'apply') assert.equal((await run('import', { path: source })).code, 0);
    const before = (await run('status', {}, true)).state;
    const activeMetadata = path.join(stateRoot, 'active-theme/theme.json');
    const previous = await fs.readFile(activeMetadata);
    const started = path.join(stateRoot, 'blocked-operation.txt');
    await fs.writeFile(startScript, `
param([switch]$ExistingOnly, [switch]$ReuseWatcher, [switch]$Resume, [string]$StateRoot)
if (-not $ExistingOnly -or -not $ReuseWatcher) { throw 'Embedded operations must reuse an existing watcher.' }
[IO.File]::WriteAllText((Join-Path $StateRoot 'blocked-operation.txt'), 'started')
Start-Sleep -Seconds 120
`);
    const requestPath = path.join(temporary, 'blocked-request.json');
    await fs.writeFile(requestPath, JSON.stringify({ maskOpacity: .81, imagePath: before.imagePath, selectionId: before.selectionId }));
    const blocked = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(runtimeRoot, 'scripts/xskin-command.ps1'), '-Embedded', '-Action', action, '-StateRoot', stateRoot,
      '-RequestPath', requestPath], { windowsHide: true, stdio: 'ignore',
      env: { ...process.env, PSModulePath: path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/Modules') } });
    const stopped = once(blocked, 'close');
    try {
      for (let attempt = 0; ; attempt++) {
        if (await fs.access(started).then(() => true, () => false)) break;
        if (attempt === 100) throw new Error('The interrupted operation did not reach verification.');
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const during = await run('status', {}, true);
      assert.equal(during.code, 0, during.error);
      assert.equal(during.state.pendingRecovery, true, 'Read-only status reports the journal while a change holds the lock.');
      assert.equal((await run('recover', {}, true)).errorCode, 'operationBusy');
    } finally {
      blocked.kill('SIGKILL');
      await stopped;
      await fs.writeFile(startScript, originalStart);
      await fs.rm(started, { force: true });
    }
    const recovered = await run('recover', {}, true);
    assert.equal(recovered.code, 0, recovered.error);
    assert.equal(recovered.recovered, true);
    assert.equal(recovered.state.selectionId, before.selectionId, 'Interrupted changes keep the pending import for retry.');
    assert.deepEqual(await fs.readFile(activeMetadata), previous, 'Recovery restores the exact previous metadata.');
    assert.equal((await run('recover', {}, true)).recovered, false);
  }
} finally { await fs.rm(temporary, { recursive: true, force: true }); }
console.log("PASS: panel UTF-8/import isolation, six presets, structured errors, read-only embedded status, selection identity, existing-only operations and killed apply/mask recovery.");
