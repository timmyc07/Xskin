import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "xskin-installer-"));
const runtime = path.join(temporary, "runtime");
const run = async (mode, port) => {
  const state = path.join(temporary, mode);
  await fs.mkdir(state);
  await fs.writeFile(path.join(state, "mode.txt"), mode);
  if (mode !== "cold") await fs.writeFile(path.join(state, "running.txt"), "running");
  if (mode === "paused") await fs.writeFile(path.join(state, "paused"), "paused");
  const result = await new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
      path.join(runtime, "scripts/install-dream-skin.ps1"), ...(mode === "shortcuts" ? [] : ["-NoShortcuts"]), "-StateRoot", state,
      ...(port ? ["-Port", String(port)] : [])], { windowsHide: true, timeout: 30000 });
    let output = "";
    child.stdout.on("data", value => { output += value; });
    child.stderr.on("data", value => { output += value; });
    child.on("error", reject);
    child.on("close", code => resolve({ code, output }));
    child.stdin.end();
  });
  const events = (await fs.readFile(path.join(state, "events.txt"), "utf8")).trim().split(/\r?\n/);
  return { ...result, events, state };
};

try {
  await fs.cp(path.join(root, "scripts"), path.join(runtime, "scripts"), { recursive: true });
  await fs.appendFile(path.join(runtime, "scripts/xskin-theme.ps1"), `
$script:fixtureState = [IO.Path]::GetFullPath($StateRoot)
$script:fixtureMode = [IO.File]::ReadAllText((Join-Path $script:fixtureState 'mode.txt'))
function Write-FixtureEvent([string]$Event) {
  [IO.File]::AppendAllText((Join-Path $script:fixtureState 'events.txt'), "$Event\n")
}
function Enter-DreamSkinOperationLock {
  [IO.File]::WriteAllText((Join-Path $script:fixtureState 'locked'), 'locked')
  Write-FixtureEvent 'lock'
  return 'fixture-lock'
}
function Exit-DreamSkinOperationLock {
  param([object]$Mutex)
  Remove-Item -LiteralPath (Join-Path $script:fixtureState 'locked')
  Write-FixtureEvent 'unlock'
}
function Get-DreamSkinNodeRuntime { return @{ Path = 'fixture-node.exe' } }
function Get-DreamSkinRegisteredCodexInstalls {
  $codex = [pscustomobject]@{ Executable = 'fixture-codex.exe'; PackageRoot = 'fixture-package' }
  if ($script:fixtureMode -eq 'multiple') { return @($codex,$codex) }
  return @($codex)
}
function Get-DreamSkinCodexProcesses {
  param([object]$Codex)
  if (Test-Path -LiteralPath (Join-Path $script:fixtureState 'running.txt')) { return @(@{ ProcessId = 1 }) }
  return @()
}
function Test-DreamSkinTrayActive { return $false }
function Stop-DreamSkinCodex {
  param([object]$Codex, [switch]$AllowForce)
  if ($PSBoundParameters.ContainsKey('AllowForce')) { throw 'Installer requested forced shutdown.' }
  Write-FixtureEvent 'stop'
  if ($script:fixtureMode -eq 'refused') { throw 'fixture refused close' }
  Remove-Item -LiteralPath (Join-Path $script:fixtureState 'running.txt')
}
function Start-DreamSkinCodex {
  param([object]$Codex)
  if (Test-Path -LiteralPath (Join-Path $script:fixtureState 'locked')) { throw 'Reopen occurred before the operation lock was released.' }
  Write-FixtureEvent 'reopen'
  [IO.File]::WriteAllText((Join-Path $script:fixtureState 'running.txt'), 'running')
}
function Get-DreamSkinRuntimeEnginePaths {
  return @{ Root = (Join-Path $script:fixtureState 'engine'); Start = (Join-Path $PSScriptRoot 'fixture-start.ps1') }
}
function Install-DreamSkinRuntimeEngine {
  if (Test-Path -LiteralPath (Join-Path $script:fixtureState 'running.txt')) { throw 'Runtime changed before Codex closed.' }
  Write-FixtureEvent 'engine'
  return Get-DreamSkinRuntimeEnginePaths
}
function Initialize-DreamSkinThemeStore { Write-FixtureEvent 'theme' }
function Install-DreamSkinBaseTheme {
  Write-FixtureEvent 'config'
  if ($script:fixtureMode -eq 'failure') { throw 'fixture config failure' }
}
function Initialize-XskinAutostart { Write-FixtureEvent 'automatic' }
function Get-DreamSkinQuietLauncher { return Join-Path $script:fixtureState 'engine\\scripts\\xskin-quiet.exe' }
function Set-DreamSkinShortcut {
  param([string]$Path, [string]$TargetPath, [string]$Arguments, [string]$WorkingDirectory, [string]$Description)
  $record = @{ path=$Path; target=$TargetPath; arguments=$Arguments; directory=$WorkingDirectory }
  [IO.File]::AppendAllText((Join-Path $script:fixtureState 'shortcuts.jsonl'), (($record | ConvertTo-Json -Compress) + "\n"))
}
`);
  await fs.writeFile(path.join(runtime, "scripts/fixture-start.ps1"), `
param([string]$StateRoot, [int]$Port)
if (Test-Path -LiteralPath (Join-Path $StateRoot 'locked')) { throw 'Skin started before the operation lock was released.' }
$suffix = if ($PSBoundParameters.ContainsKey('Port')) { "$Port" } else { 'saved' }
[IO.File]::AppendAllText((Join-Path $StateRoot 'events.txt'), "skin:$suffix\n")
if ([IO.File]::ReadAllText((Join-Path $StateRoot 'mode.txt')) -eq 'start-failure') { throw 'fixture start failure' }
[IO.File]::WriteAllText((Join-Path $StateRoot 'running.txt'), 'running')
`);

  const cold = await run("cold");
  assert.equal(cold.code, 0, cold.output);
  assert.deepEqual(cold.events, ["lock", "engine", "theme", "config", "automatic", "unlock"]);
  await assert.rejects(fs.stat(path.join(cold.state, "running.txt")), { code: "ENOENT" });
  for (const [mode, port] of [["active"], ["explicit-port", 9440]]) {
    const installed = await run(mode, port);
    assert.equal(installed.code, 0, installed.output);
    assert.deepEqual(installed.events, ["lock", "stop", "engine", "theme", "config", "automatic", "unlock", `skin:${port ?? "saved"}`]);
  }
  const paused = await run("paused");
  assert.equal(paused.code, 0, paused.output);
  assert.deepEqual(paused.events, ["lock", "stop", "engine", "theme", "config", "automatic", "unlock", "reopen"]);
  await fs.stat(path.join(paused.state, "paused"));
  const shortcuts = await run("shortcuts", 9440);
  assert.equal(shortcuts.code, 0, shortcuts.output);
  const links = (await fs.readFile(path.join(shortcuts.state, "shortcuts.jsonl"), "utf8")).trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(links.length, 5);
  for (const link of links) {
    assert.equal(link.target, path.join(shortcuts.state, "engine/scripts/xskin-quiet.exe"));
    assert.equal(link.directory, path.join(shortcuts.state, "engine"));
    assert.match(link.arguments, /^(start|restore|tray) /);
    assert.ok(link.arguments.includes(shortcuts.state));
    assert.match(link.arguments, /-Port 9440/);
  }
  for (const [mode, message] of [["failure", /fixture config failure/], ["start-failure", /fixture start failure/]]) {
    const failed = await run(mode);
    assert.equal(failed.code, 1, failed.output);
    assert.match(failed.output, message);
    assert.equal(failed.events.at(-1), "reopen");
    assert.ok(failed.events.indexOf("unlock") < failed.events.indexOf("reopen"));
    await fs.stat(path.join(failed.state, "running.txt"));
  }
  const refused = await run("refused");
  assert.equal(refused.code, 1, refused.output);
  assert.match(refused.output, /fixture refused close/);
  assert.deepEqual(refused.events, ["lock", "stop", "unlock"]);
  await fs.stat(path.join(refused.state, "running.txt"));
  const multiple = await run("multiple");
  assert.equal(multiple.code, 1, multiple.output);
  assert.match(multiple.output, /Multiple registered Codex/);
  assert.deepEqual(multiple.events, ["lock", "unlock"]);
} finally { await fs.rm(temporary, { recursive: true, force: true }); }
console.log("PASS: installer handles cold/active/paused Codex, graceful refusal and failure recovery without forced shutdown.");
