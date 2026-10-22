import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "xskin-startup-"));
const scripts = path.join(temporary, "scripts");
const run = async mode => {
  const state = path.join(temporary, `${mode}-中文`);
  await fs.mkdir(state);
  await fs.writeFile(path.join(state, "mode.txt"), mode);
  const result = await new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
      path.join(scripts, "start-dream-skin.ps1"), ...(mode.startsWith("saved-") ? ["-RestartExisting"] : [
        "-NewLaunchPid", "12345", "-NewLaunchStartedAt", new Date().toISOString().replace(/Z$/, "0000Z")]),
      "-StateRoot", state], { windowsHide: true, timeout: 20000 });
    let output = "";
    child.stdout.on("data", value => { output += value; });
    child.stderr.on("data", value => { output += value; });
    child.on("error", reject);
    child.on("close", code => resolve({ code, output }));
    child.stdin.end();
  });
  const events = (await fs.readFile(path.join(state, "events.txt"), "utf8")).trim().split(/\r?\n/);
  return { ...result, events };
};

try {
  await fs.cp(path.join(root, "scripts"), scripts, { recursive: true });
  await fs.appendFile(path.join(scripts, "theme-windows.ps1"), `
$script:fixtureState = $StateRoot
$script:fixtureMode = [IO.File]::ReadAllText((Join-Path $StateRoot 'mode.txt'))
$script:fixtureRunning = 'original'
$script:fixtureCurrentRunning = $false
$script:fixtureIdentityChecks = 0
function Write-FixtureEvent([string]$Event) {
  [IO.File]::AppendAllText((Join-Path $script:fixtureState 'events.txt'), "$Event\n")
}
function Resolve-DreamSkinStateRoot { param([string]$StateRoot) return $StateRoot }
function Enter-DreamSkinOperationLock { Write-FixtureEvent 'lock'; return 'fixture-lock' }
function Exit-DreamSkinOperationLock { param([object]$Mutex) Write-FixtureEvent 'unlock' }
function Get-DreamSkinNodeRuntime { return @{ Path = 'fixture-node.exe' } }
function Get-DreamSkinCodexInstall {
  return [pscustomobject]@{ Executable = 'C:\\fixture\\ChatGPT.exe'; PackageRoot = 'C:\\fixture' }
}
function Get-FixtureSavedCodex { return [pscustomobject]@{ Executable = 'C:\\saved-fixture\\ChatGPT.exe'; PackageRoot = 'C:\\saved-fixture' } }
function Get-DreamSkinRegisteredCodexInstalls {
  Get-DreamSkinCodexInstall
  if ($script:fixtureMode -like 'saved-*') { Get-FixtureSavedCodex }
}
function Get-DreamSkinThemePaths { return @{ Root = $StateRoot; Active = $StateRoot; PauseFile = (Join-Path $StateRoot 'paused') } }
function Initialize-DreamSkinThemeStore { return Get-DreamSkinThemePaths }
function Test-DreamSkinPaused { return $false }
function Get-DreamSkinCodexStatePathCandidate { if ($script:fixtureMode -like 'saved-*') { return Get-FixtureSavedCodex }; return $null }
function Get-DreamSkinCodexInstallFromState { return Get-DreamSkinCodexStatePathCandidate }
function Get-DreamSkinVerifiedCdpIdentity { return $null }
function Test-DreamSkinPortAvailable { return $true }
function Get-DreamSkinCodexProcesses {
  param([object]$Codex)
  if ($script:fixtureMode -like 'saved-*' -and $Codex.Executable -notlike '*saved-fixture*') {
    if ($script:fixtureCurrentRunning) { return ,@([pscustomobject]@{ ProcessId = 23456; CommandLine = 'C:\\fixture\\ChatGPT.exe'; Count = 1 }) }
    return ,@()
  }
  if ($script:fixtureRunning -eq 'none') { return ,@() }
  $id = if ($script:fixtureRunning -eq 'replacement') { 23456 } else { 12345 }
  return ,@([pscustomobject]@{ ProcessId = $id; CommandLine = 'C:\\fixture\\ChatGPT.exe'; Count = 1 })
}
function Get-CimInstance {
  return [pscustomobject]@{
    ProcessId = 12345; ExecutablePath = 'C:\\fixture\\ChatGPT.exe'; CommandLine = 'C:\\fixture\\ChatGPT.exe'
    SessionId = [Diagnostics.Process]::GetCurrentProcess().SessionId
  }
}
function Get-DreamSkinProcessStartedAt {
  $script:fixtureIdentityChecks++
  if ($script:fixtureMode -eq 'identity' -and $script:fixtureIdentityChecks -gt 1) {
    $script:fixtureRunning = 'none'
    return '2000-01-01T00:00:00.0000000Z'
  }
  return $NewLaunchStartedAt
}
function Get-Process {
  $process = [pscustomobject]@{ Id = 12345; StartTime = [datetime]$NewLaunchStartedAt; Path = 'C:\\fixture\\ChatGPT.exe' }
  $process | Add-Member -MemberType ScriptMethod -Name WaitForExit -Value {
    if ($script:fixtureMode -in @('post-quit','replacement')) { throw 'fixture post-quit failure' }
    return $true
  }
  return $process
}
function Request-DreamSkinCodexQuit {
  param([object]$Process)
  Write-FixtureEvent 'quit'
  if ($script:fixtureMode -eq 'refused') { throw 'fixture refused quit' }
  $script:fixtureRunning = if ($script:fixtureMode -eq 'replacement') { 'replacement' } else { 'none' }
}
function Test-DreamSkinCodexPortOwner { return $false }
function Stop-DreamSkinCodex {
  if ($script:fixtureMode -notlike 'saved-*') { throw 'Automatic rollback must not close a replacement app.' }
  Write-FixtureEvent 'quit'
  if ($script:fixtureMode -eq 'saved-refused') { throw 'fixture refused quit' }
  $script:fixtureRunning = 'none'
  $script:fixtureCurrentRunning = $script:fixtureMode -eq 'saved-conflict'
  throw 'fixture post-quit failure'
}
function Start-DreamSkinCodex {
  param([object]$Codex, [string[]]$Arguments)
  if ($Arguments.Count -gt 0) {
    Write-FixtureEvent 'debug-launch'
    throw 'fixture debug launch failure'
  }
  if ($script:fixtureRunning -ne 'none') { throw 'Recovery tried to replace a running app.' }
  if ($script:fixtureMode -like 'saved-*') {
    if ($Codex.Executable -notlike '*saved-fixture*') { throw 'Recovery reopened a different package version.' }
    Write-FixtureEvent 'reopen-old'
  } else { Write-FixtureEvent 'reopen' }
  $script:fixtureRunning = 'recovered'
}
`);
  const postQuit = await run("post-quit");
  assert.equal(postQuit.code, 1, postQuit.output);
  assert.match(postQuit.output, /fixture post-quit failure/);
  assert.deepEqual(postQuit.events, ["lock", "quit", "reopen", "unlock"]);
  const launchFailure = await run("launch-failure");
  assert.equal(launchFailure.code, 1, launchFailure.output);
  assert.match(launchFailure.output, /fixture debug launch failure/);
  assert.deepEqual(launchFailure.events, ["lock", "quit", "debug-launch", "reopen", "unlock"]);
  const refused = await run("refused");
  assert.equal(refused.code, 1, refused.output);
  assert.match(refused.output, /fixture refused quit/);
  assert.deepEqual(refused.events, ["lock", "quit", "unlock"]);
  const replacement = await run("replacement");
  assert.equal(replacement.code, 1, replacement.output);
  assert.match(replacement.output, /fixture post-quit failure/);
  assert.deepEqual(replacement.events, ["lock", "quit", "unlock"]);
  const changedIdentity = await run("identity");
  assert.equal(changedIdentity.code, 1, changedIdentity.output);
  assert.match(changedIdentity.output, /identity or launch age changed/);
  assert.deepEqual(changedIdentity.events, ["lock", "unlock"]);
  for (const [mode, events, message] of [
    ["saved-refused", ["lock", "quit", "unlock"], /fixture refused quit/],
    ["saved-post-quit", ["lock", "quit", "reopen-old", "unlock"], /fixture post-quit failure/],
    ["saved-conflict", ["lock", "quit", "unlock"], /fixture post-quit failure/],
  ]) {
    const failed = await run(mode);
    assert.equal(failed.code, 1, failed.output);
    assert.match(failed.output, message);
    assert.deepEqual(failed.events, events);
  }
} finally { await fs.rm(temporary, { recursive: true, force: true }); }
console.log("PASS: automatic startup recovers after a verified quit failure and leaves refused, changed and replacement launches untouched.");
