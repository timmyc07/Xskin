import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "xskin-install-"));
const runtime = path.join(temporary, "runtime");
try {
  await fs.cp(path.join(root, "scripts"), path.join(runtime, "scripts"), { recursive: true });
  await fs.appendFile(path.join(runtime, "scripts/xskin-theme.ps1"), `
function Resolve-DreamSkinStateRoot { param($StateRoot) return $StateRoot }
function Enter-DreamSkinOperationLock { return 'fixture' }
function Exit-DreamSkinOperationLock { }
function Get-DreamSkinNodeRuntime { return @{ Path = 'fixture-node.exe' } }
function Get-DreamSkinCodexInstall { return @{} }
function Test-DreamSkinTrayActive { return $false }
function Stop-DreamSkinCodex { throw 'Installer must leave official Codex running.' }
function Start-DreamSkinCodex { throw 'Installer must not reopen official Codex.' }
function Install-DreamSkinRuntimeEngine { return @{ Root = $SkillRoot } }
function Initialize-DreamSkinThemeStore { }
function Install-DreamSkinBaseTheme { if (Test-Path (Join-Path $StateRoot 'fail')) { throw 'fixture config failure' } }
function Save-XskinStateRoot { }
function Initialize-XskinAutostart { }
function Set-XskinLaunchShortcuts { [IO.File]::WriteAllText((Join-Path $StateRoot 'shortcut'), $StateRoot) }
function Remove-DreamSkinLegacyAutostart { }
`);
  for (const mode of ["cold", "active", "paused", "failure"]) {
    const state = path.join(temporary, `${mode} 中文 🌙`);
    await fs.mkdir(state);
    await fs.writeFile(path.join(state, "preferences"), "language=zh-Hant;mask=0.42");
    if (mode !== "cold") await fs.writeFile(path.join(state, "running"), "same official PID");
    if (mode === "paused") await fs.writeFile(path.join(state, "paused"), "keep");
    if (mode === "failure") await fs.writeFile(path.join(state, "fail"), "fail");
    const result = await new Promise((resolve, reject) => {
      const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
        path.join(runtime, "scripts/install-dream-skin.ps1"), "-StateRoot", state, "-Port", "9440"], { windowsHide: true, timeout: 20000 });
      let output = "";
      child.stdout.on("data", value => { output += value; });
      child.stderr.on("data", value => { output += value; });
      child.on("error", reject);
      child.on("close", code => resolve({ code, output }));
      child.stdin.end();
    });
    assert.equal(result.code, mode === "failure" ? 1 : 0, result.output);
    assert.equal(await fs.readFile(path.join(state, "preferences"), "utf8"), "language=zh-Hant;mask=0.42");
    if (mode !== "cold") assert.equal(await fs.readFile(path.join(state, "running"), "utf8"), "same official PID");
    if (mode === "paused") assert.equal(await fs.readFile(path.join(state, "paused"), "utf8"), "keep");
    if (mode !== "failure") {
      assert.equal(await fs.readFile(path.join(state, "shortcut"), "utf8"), state);
      assert.equal(JSON.parse(await fs.readFile(path.join(state, "studio.json"), "utf8")).launchPort, 9440);
    }
  }
} finally { await fs.rm(temporary, { recursive: true, force: true }); }
console.log("PASS: install/update preserve active Codex, Unicode state roots, preferences and pause, including failed configuration.");
