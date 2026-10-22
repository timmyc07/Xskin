import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "xskin-panel-"));
const stateRoot = path.join(temporary, "state");
const runtimeRoot = path.join(temporary, "runtime");
const run = async (action, request = {}) => {
  const requestPath = path.join(temporary, "request.json");
  await fs.writeFile(requestPath, JSON.stringify(request));
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
      path.join(runtimeRoot, "scripts/xskin-command.ps1"), "-Action", action, "-StateRoot", stateRoot,
      "-RequestPath", requestPath], { windowsHide: true, timeout: 30000 });
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
  for (const directory of ['scripts','assets']) {
    await fs.cp(path.join(root,directory),path.join(runtimeRoot,directory),{recursive:true});
  }
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
  Write-XskinSettings -StateRoot $StateRoot -Values @{ automaticSetupComplete = $true }
}
`);
  const initial = await run("state");
  assert.equal(initial.code, 0, initial.error);
  assert.equal(initial.state.autostart, true);
  assert.equal((await run("state")).state.autostart, true);
  assert.equal(await fs.readFile(path.join(stateRoot, "automatic-setups.txt"), "utf8"), "setup");
  assert.equal((await run("autostart", { enabled: false })).state.autostart, false);
  assert.equal((await run("state")).state.autostart, false);
  assert.equal(initial.state.pending, false);
  assert.ok(initial.state.saved.length > 0);
  assert.equal(typeof initial.state.saved[0].directory, 'string');
  assert.equal(typeof initial.state.saved[0].name, 'string');
  const originalMetadata = await fs.readFile(path.join(stateRoot, "active-theme/theme.json"), "utf8");
  const source = path.join(temporary, "中文 $& picture.jpg");
  await fs.copyFile(path.join(root, "assets/dream-reference.jpg"), source);
  const imported = await run("import", { path: source });
  assert.equal(imported.code, 0, imported.error);
  assert.equal(imported.state.pending, true);
  assert.equal(imported.state.name, "中文 $& picture");
  assert.equal(await fs.readFile(path.join(stateRoot, "active-theme/theme.json"), "utf8"), originalMetadata);
  for (const maskOpacity of [-1, 2, "0.5", true]) {
    const invalid = await run("apply", { maskOpacity });
    assert.equal(invalid.code, 1);
    assert.match(invalid.error, /Mask opacity/);
  }
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
  assert.equal(longName.state.name.length, 80);
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
param([switch]$PromptRestart, [string]$StateRoot)
if ([IO.Path]::GetFullPath($StateRoot) -ine '${stateRoot.replaceAll("'", "''")}') {
  throw 'The panel did not forward its custom state root.'
}
[IO.File]::WriteAllText((Join-Path $StateRoot '${action}-root.txt'), $StateRoot)
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
} finally { await fs.rm(temporary, { recursive: true, force: true }); }
console.log("PASS: Flutter bridge UTF-8 round-trip, preview isolation, mask validation, pause and path boundaries.");
