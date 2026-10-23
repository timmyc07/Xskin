import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "xskin-startup-"));
const scripts = path.join(temporary, "scripts");
async function run(mode, state, flags = []) {
  await fs.mkdir(state, { recursive: true });
  await fs.writeFile(path.join(state, "mode.txt"), mode);
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
      path.join(scripts, "start-dream-skin.ps1"), "-StateRoot", state, ...flags], { windowsHide: true, timeout: 15000 });
    let output = "";
    child.stdout.on("data", value => { output += value; });
    child.stderr.on("data", value => { output += value; });
    child.on("error", reject);
    child.on("close", code => resolve({ code, output }));
    child.stdin.end();
  });
}
try {
  await fs.cp(path.join(root, "scripts"), scripts, { recursive: true });
  await fs.appendFile(path.join(scripts, "xskin-theme.ps1"), `
$script:fixtureState = $StateRoot
$script:fixtureMode = [IO.File]::ReadAllText((Join-Path $StateRoot 'mode.txt'))
function Event([string]$Value) { [IO.File]::AppendAllText((Join-Path $script:fixtureState 'events.txt'), "$Value\n") }
function Resolve-DreamSkinStateRoot { param($StateRoot) return $StateRoot }
function Enter-DreamSkinOperationLock { Event 'lock'; return 'fixture' }
function Exit-DreamSkinOperationLock { Event 'unlock' }
function Get-DreamSkinNodeRuntime { return @{ Path = 'fixture-node.exe'; Version = '24.0.0' } }
function Get-DreamSkinCodexInstall { return [pscustomobject]@{ Executable = 'C:\\Store\\ChatGPT.exe'; PackageRoot = 'C:\\Store'; PackageFullName = 'OpenAI.Codex_fixture'; PackageFamilyName = 'OpenAI.Codex_family' } }
function Get-DreamSkinCodexStatePathCandidate { return $null }
function Get-DreamSkinCodexInstallFromState { return $null }
function Get-DreamSkinCodexProcesses {
  if ($script:fixtureMode.StartsWith('auto') -and -not (Test-Path (Join-Path $script:fixtureState 'stopped'))) { return ,@(@{ ProcessId = 12345 }) }
  if ($script:fixtureMode -eq 'ordinary' -or (Test-Path (Join-Path $script:fixtureState 'running'))) { return ,@(@{ ProcessId = 12345 }) }
  return ,@()
}
function Get-DreamSkinRegisteredCodexInstalls { return @(Get-DreamSkinCodexInstall) }
function Get-DreamSkinAutostart { return @{ Enabled = $true } }
function Test-DreamSkinNewCodexLaunch { return $true }
function Stop-DreamSkinNewCodexLaunch {
  Event 'graceful'
  if ($script:fixtureMode -eq 'auto-refused') { throw 'fixture quit refused' }
  [IO.File]::WriteAllText((Join-Path $script:fixtureState 'stopped'), 'stopped')
}
function Get-DreamSkinThemePaths { return @{ Root = $StateRoot; Active = $StateRoot; PauseFile = (Join-Path $StateRoot 'paused') } }
function Initialize-DreamSkinThemeStore { return Get-DreamSkinThemePaths }
function Get-DreamSkinVerifiedCdpIdentity {
  if ($script:fixtureMode -ne 'ordinary' -and (Test-Path (Join-Path $script:fixtureState 'running'))) { return @{ BrowserId = 'fixture-browser' } }
  return $null
}
function Test-DreamSkinPortAvailable { return $true }
function Start-DreamSkinCodex {
  param($Codex, $Arguments)
  Event $(if ($Arguments) { 'launch' } elseif (Test-Path (Join-Path $script:fixtureState 'running')) { 'activate' } else { 'normal' })
  if ($script:fixtureMode -eq 'launch-failure' -or ($script:fixtureMode -eq 'auto-launch-failure' -and $Arguments)) { throw 'fixture launch failure' }
  [IO.File]::WriteAllText((Join-Path $script:fixtureState 'running'), 'running')
}
function Stop-DreamSkinCodex { throw 'Official Codex must never be closed.' }
function Stop-DreamSkinRecordedInjector {
  param($State, [switch]$CheckOnly)
  if ($CheckOnly) { return Test-Path (Join-Path $script:fixtureState 'injector') }
  if (Test-Path (Join-Path $script:fixtureState 'injector')) { Event 'stop-injector'; Remove-Item (Join-Path $script:fixtureState 'injector') }
  return $true
}
function Start-Process {
  Event 'injector'
  [IO.File]::WriteAllText((Join-Path $script:fixtureState 'injector'), 'running')
  return @{ Id = 12345; HasExited = $false }
}
function Get-DreamSkinProcessStartedAt { return [datetime]::UtcNow.ToString('o') }
function Invoke-DreamSkinNative {
  param($FilePath, $ArgumentList, [switch]$DiscardStderr)
  if ($ArgumentList -contains '--check-payload') { Event 'preflight'; return @{ ExitCode = 0; Output = @('{}') } }
  if ($ArgumentList -contains '--remove') { Event 'remove'; return @{ ExitCode = 0; Output = @('{}') } }
  Event 'verify'
  return @{ ExitCode = $(if ($script:fixtureMode -eq 'verify-failure') { 2 } else { 0 }); Output = @('{}') }
}
`);
  for (let attempt = 0; attempt < 3; attempt++) {
    const state = path.join(temporary, `cold ${attempt} 中文 🌙`);
    let result = await run("cold", state);
    assert.equal(result.code, 0, result.output);
    result = await run("repeat", state);
    assert.equal(result.code, 0, result.output);
    assert.equal(await fs.readFile(path.join(state, "events.txt"), "utf8"), "lock\nlaunch\ninjector\nverify\nunlock\nlock\nactivate\nunlock\n");
  }
  const existing = path.join(temporary, "existing-only");
  const refusedExisting = await run("ordinary", existing, ["-ExistingOnly"]);
  assert.equal(refusedExisting.code, 1, refusedExisting.output);
  assert.equal(await fs.readFile(path.join(existing, "events.txt"), "utf8"), "lock\nunlock\n");
  await fs.writeFile(path.join(existing, "running"), "running");
  await fs.writeFile(path.join(existing, "paused"), "paused");
  const appliedExisting = await run("repeat", existing, ["-ExistingOnly", "-Resume"]);
  assert.equal(appliedExisting.code, 0, appliedExisting.output);
  const reusedExisting = await run("repeat", existing, ["-ExistingOnly"]);
  assert.equal(reusedExisting.code, 0, reusedExisting.output);
  assert.equal(await fs.readFile(path.join(existing, "events.txt"), "utf8"), "lock\nunlock\nlock\ninjector\nverify\nunlock\nlock\nunlock\n");
  const failedExisting = await run("verify-failure", existing, ["-ExistingOnly", "-Resume"]);
  assert.equal(failedExisting.code, 1, failedExisting.output);
  const existingEvents = await fs.readFile(path.join(existing, "events.txt"), "utf8");
  assert.ok(!/activate|launch|normal/.test(existingEvents), existingEvents);
  for (const mode of ["auto", "auto-refused", "auto-launch-failure"]) {
    const state = path.join(temporary, mode);
    const automatic = await run(mode, state, ["-NewLaunchPid", "12345", "-NewLaunchStartedAt", "fixture"]);
    assert.equal(automatic.code, mode === "auto" ? 0 : 1, automatic.output);
    const events = await fs.readFile(path.join(state, "events.txt"), "utf8");
    if (mode === "auto") assert.equal(events, "lock\npreflight\ngraceful\nlaunch\ninjector\nverify\nunlock\n");
    if (mode === "auto-refused") assert.equal(events, "lock\npreflight\ngraceful\nunlock\n");
    if (mode === "auto-launch-failure") assert.equal(events, "lock\npreflight\ngraceful\nlaunch\nnormal\nunlock\n");
  }
  const moved = path.join(temporary, 'different-engine');
  assert.equal((await run('cold', moved)).code, 0);
  const savedPath = path.join(moved, 'state.json');
  const prior = JSON.parse(await fs.readFile(savedPath, 'utf8'));
  prior.injectorPath = path.join(temporary, 'old-engine', 'injector.mjs');
  await fs.writeFile(savedPath, JSON.stringify(prior));
  const migrated = await run('repeat', moved);
  assert.equal(migrated.code, 0, migrated.output);
  assert.equal(await fs.readFile(path.join(moved, 'events.txt'), 'utf8'), 'lock\nlaunch\ninjector\nverify\nunlock\nlock\nstop-injector\ninjector\nverify\nunlock\n');
  const ordinary = path.join(temporary, "ordinary");
  const result = await run("ordinary", ordinary);
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /Codex is already open/);
  assert.equal(await fs.readFile(path.join(ordinary, "events.txt"), "utf8"), "lock\nunlock\n");
  const paused = path.join(temporary, "paused");
  await fs.mkdir(paused);
  await fs.writeFile(path.join(paused, "paused"), "keep");
  assert.equal((await run("paused", paused)).code, 0);
  assert.equal(await fs.readFile(path.join(paused, "paused"), "utf8"), "keep");
  assert.equal(await fs.readFile(path.join(paused, "events.txt"), "utf8"), "lock\nnormal\nunlock\n");
  for (const mode of ["launch-failure", "verify-failure"]) {
    const state = path.join(temporary, mode);
    const failed = await run(mode, state);
    assert.equal(failed.code, 1, failed.output);
    const events = await fs.readFile(path.join(state, "events.txt"), "utf8");
    assert.equal(events.split("\n").filter(x => x === "launch").length, 1);
    assert.ok(!events.includes("normal"));
    if (mode === "verify-failure") {
      assert.ok(events.includes("stop-injector\nremove"));
      await fs.stat(path.join(state, "running"));
    }
  }
} finally { await fs.rm(temporary, { recursive: true, force: true }); }
console.log("PASS: direct cold starts/reuse, ExistingOnly without activation, fresh graceful handoffs, refused quit and failed-activation ordinary recovery.");
