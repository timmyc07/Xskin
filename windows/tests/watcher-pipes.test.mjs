import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "xskin-watcher-pipes-"));
const source = path.join(temporary, "source");
const state = path.join(temporary, "state 中文 & ; 🌙");
const fixture = path.join(temporary, "operation.ps1");
const shell = path.join(process.env.SystemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe");
const quote = value => `'${value.replaceAll("'", "''")}'`;
const options = { windowsHide: true, timeout: 30000,
  env: { ...process.env, PSModulePath: path.join(path.dirname(shell), "Modules") } };
const args = action => ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", fixture, "-Action", action];
let original;
let update;
let deadline;
try {
  for (const item of ["scripts", "assets", "presets", "VERSION"]) {
    await fs.cp(path.join(root, item), path.join(source, item), { recursive: true });
  }
  await fs.writeFile(path.join(source, "scripts/injector.mjs"),
    'console.log("watcher stdout"); console.log(JSON.stringify(process.argv.slice(2))); console.error("watcher stderr"); setInterval(() => {}, 1000);');
  await fs.writeFile(fixture, `\ufeffparam([string]$Action)
$ErrorActionPreference = 'Stop'
. ${quote(path.join(root, "scripts/common-windows.ps1"))}
. ${quote(path.join(root, "scripts/theme-windows.ps1"))}
$StateRoot = ${quote(state)}
$NodePath = ${quote(process.execPath)}
function Get-DreamSkinAutostartTask { return $null }
function Stop-DreamSkinAutostart { }
function Get-DreamSkinNodeRuntime { return @{ Path = $NodePath } }
if ($Action -eq 'cleanup') {
  $null = Stop-DreamSkinRecordedInjector -State (Read-DreamSkinState -Path (Join-Path $StateRoot 'state.json'))
  exit 0
}
if ($Action -eq 'failure') {
  $rejected = $false
  try {
    $null = Start-DreamSkinWatcher -NodePath (Join-Path $StateRoot 'missing-node.exe') -Arguments @((Join-Path $StateRoot 'engine\\scripts\\injector.mjs')) -WorkingDirectory $StateRoot -StdoutPath (Join-Path $StateRoot 'failed.log') -StderrPath (Join-Path $StateRoot 'failed-error.log')
  } catch { $rejected = $true }
  if (-not $rejected) { throw 'A failed native watcher spawn was reported as successful.' }
  exit 0
}
if ($Action -eq 'update') {
  $original = [int][IO.File]::ReadAllText(${quote(path.join(temporary, "original.pid"))})
  Write-DreamSkinState -Path (Join-Path $StateRoot 'state.json') -State ([pscustomobject]@{
    injectorPid = $original; injectorStartedAt = Get-DreamSkinProcessStartedAt -ProcessId $original
    injectorPath = Join-Path $StateRoot 'engine\\scripts\\injector.mjs'; nodePath = $NodePath
    port = 9335; browserId = '01234567-89ab-cdef-0123-456789abcdef'
  })
}
$null = Install-DreamSkinRuntimeEngine -SkillRoot ${quote(source)} -StateRoot $StateRoot
if ($Action -eq 'update') {
  $native = Invoke-DreamSkinNative -FilePath $NodePath -ArgumentList @('-e', "process.stdout.write('native stdout');process.stderr.write('native stderr');process.exit(7)")
  if ($native.ExitCode -ne 7 -or ($native.Output -join '') -notmatch 'native stdout' -or
    ($native.Output -join '') -notmatch 'native stderr') { throw 'Protecting watcher pipes damaged later native output.' }
}
[Console]::Out.WriteLine('XSKIN_RESULT:complete')
`);
  await run(shell, args("prepare"), options);
  original = spawn(process.execPath, [path.join(state, "engine/scripts/injector.mjs"), "--watch", "--port", "9335",
    "--browser-id", "01234567-89ab-cdef-0123-456789abcdef"], { windowsHide: true, stdio: "ignore" });
  await new Promise((resolve, reject) => { original.once("spawn", resolve); original.once("error", reject); });
  await fs.writeFile(path.join(temporary, "original.pid"), String(original.pid));
  update = run(shell, args("update"), options);
  let output = "";
  update.child.stdout.on("data", value => { output += value; });
  update.child.stderr.on("data", value => { output += value; });
  const result = await Promise.race([update, new Promise((_, reject) => {
    deadline = setTimeout(() => reject(new Error(`The MCP command still waits for its persistent watcher's inherited pipes (exit=${update.child.exitCode}): ${output}`)), 15000);
  })]);
  assert.match(result.stdout, /XSKIN_RESULT:complete/);
  const resumed = JSON.parse(await fs.readFile(path.join(state, "state.json"), "utf8"));
  assert.notEqual(resumed.injectorPid, original.pid);
  assert.doesNotThrow(() => process.kill(resumed.injectorPid, 0), "The resumed watcher must survive the MCP command's completed pipe EOF.");
  const log = await fs.readFile(path.join(state, "injector.log"), "utf8");
  assert.match(log, /watcher stdout/);
  const invocation = JSON.parse(log.split(/\r?\n/).find(line => line.startsWith("[")));
  assert.equal(invocation[invocation.indexOf("--theme-dir") + 1], path.join(state, "active-theme"));
  assert.match(await fs.readFile(path.join(state, "injector-error.log"), "utf8"), /watcher stderr/);
  await run(shell, args("failure"), options);
} finally {
  clearTimeout(deadline);
  if (await fs.stat(fixture).then(() => true, () => false)) await run(shell, args("cleanup"), options);
  if (original?.exitCode === null && original?.signalCode === null) original.kill();
  await update?.catch(() => {});
  await fs.rm(temporary, { recursive: true, force: true });
}
console.log("PASS: a real Windows PowerShell runtime update completes MCP pipes while its persistent watcher and diagnostic logs survive.");
