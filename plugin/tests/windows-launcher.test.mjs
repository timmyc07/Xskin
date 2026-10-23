import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import manifest from "../package.json" with { type: "json" };

const run = promisify(execFile);
const quote = value => `'${value.replaceAll("'", "''")}'`;
const source = fileURLToPath(new URL("..", import.meta.url));

test("the Windows manifest starts a contained compiled studio with private read-only status and clean EOF", {
  skip: process.platform !== "win32", timeout: 30000,
}, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "xskin-windows-launcher-"));
  const packageRoot = path.join(directory, "套件 中文 🌙 with spaces");
  const plugin = path.join(packageRoot, "plugin");
  const runtime = path.join(packageRoot, "windows");
  const scripts = path.join(runtime, "scripts");
  const home = path.join(directory, "隔離 home 中文 🌙");
  const stateRoot = path.join(home, "CodexDreamSkin");
  const events = path.join(directory, "backend-events.txt");
  let child;
  let closed;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.stdin.end();
      await run("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"]).catch(() => {});
    }
    await closed;
    await fs.rm(directory, { recursive: true, force: true });
  });
  await fs.mkdir(scripts, { recursive: true });
  await fs.mkdir(plugin, { recursive: true });
  // Windows PowerShell initializes its roaming shell folder even for read-only commands.
  await fs.mkdir(path.join(home, "AppData", "Roaming"), { recursive: true });
  const initialHome = await fs.readdir(home, { recursive: true });
  await run(process.execPath, [path.join(source, "build.mjs")], { timeout: 15000 });
  await fs.cp(path.join(source, "dist"), path.join(plugin, "dist"), { recursive: true });
  await fs.copyFile(path.join(source, "launch-windows.ps1"), path.join(plugin, "launch-windows.ps1"));
  const configuration = JSON.parse(await fs.readFile(new URL("../../mcp.windows.json", import.meta.url), "utf8")).mcpServers.xskin;
  assert.equal(configuration.type, "stdio");
  assert.equal(configuration.command, "powershell.exe");
  const expand = value => value.replaceAll("${PLUGIN_ROOT}", packageRoot);
  const args = configuration.args.map(expand);
  const launcher = args[args.indexOf("-File") + 1];
  const relative = path.relative(packageRoot, await fs.realpath(launcher));
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  await fs.writeFile(path.join(runtime, "VERSION"), `${manifest.version}\n`);
  await fs.writeFile(path.join(scripts, "common-windows.ps1"),
    `function Get-DreamSkinNodeRuntime { [pscustomobject]@{ Path = ${quote(process.execPath)} } }\n`);
  await fs.writeFile(path.join(scripts, "xskin-command.ps1"), `\uFEFFparam(
  [switch]$Embedded, [string]$Action, [string]$RequestPath, [string]$StateRoot
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
if (-not $Embedded -or $Action -cne 'status') { throw 'Fixture refuses mutations.' }
if (([IO.File]::ReadAllText($RequestPath)).Trim() -cne '{}') { throw 'Fixture refuses unexpected requests.' }
if ($StateRoot -and $StateRoot -cne ${quote(stateRoot)}) { throw 'Fixture refuses foreign state.' }
[IO.File]::AppendAllText(${quote(events)}, "status\n")
$state = @{ version = ${quote(manifest.version)}; stateRoot = ${quote(stateRoot)};
  needsSetup = $true; activeImagePath = $null; activeVideoPath = $null; pending = $false;
  maskOpacity = 0.62; autostart = $false; autostartLoaded = $false; pendingRecovery = $false; language = 'zh-Hant' }
[Console]::Out.WriteLine('XSKIN_RESULT:' + (@{ ok = $true; state = $state } | ConvertTo-Json -Depth 5 -Compress))
`);
  child = spawn(configuration.command, args, {
    cwd: expand(configuration.cwd), windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, HOME: home, USERPROFILE: home, LOCALAPPDATA: home,
      CODEX_HOME: path.join(home, ".codex"), NODE_PATH: "" },
  });
  closed = once(child, "close");
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const request = async (id, method, params) => {
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    for (;;) {
      const line = await lines.next();
      assert.equal(line.done, false, `The compiled server closed before ${method}: ${stderr}`);
      const response = JSON.parse(line.value);
      if (response.id !== id) continue;
      assert.equal(response.error, undefined);
      return response.result;
    }
  };
  const initialized = await request(1, "initialize", {
    protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "xskin-windows-launcher-fixture", version: "1.0.0" },
  });
  assert.equal(initialized.serverInfo.name, "xskin");
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  const resource = await request(2, "resources/read", { uri: `ui://xskin/studio-${manifest.version}.html` });
  assert.deepEqual(resource.contents[0]._meta.ui.csp, { connectDomains: [], resourceDomains: ["blob:"], frameDomains: [] });
  const { tools } = await request(3, "tools/list", {});
  assert.equal(tools.find(tool => tool.name === "xskin_open").annotations.readOnlyHint, true);
  assert.deepEqual(tools.find(tool => tool.name === "xskin_read_media")._meta.ui.visibility, ["app"]);
  await assert.rejects(fs.access(events), { code: "ENOENT" },
    "MCP startup, navigation metadata and resources must remain available without a backend status request");
  for (const [id, name] of [[4, "xskin_open"], [5, "xskin_status"]]) {
    const result = await request(id, "tools/call", { name, arguments: {} });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent, undefined);
    assert.deepEqual(result.content, [{ type: "text", text: "Xskin background settings are ready." }]);
    const state = result._meta["com.xskin/studio"];
    assert.equal(state.platform, "windows");
    assert.equal(state.needsSetup, true);
    assert.equal(state.language, "zh-Hant");
    assert.equal(state.active, null);
    assert.equal(state.selection, null);
    assert.doesNotMatch(JSON.stringify(result), /CodexDreamSkin|xskin-windows-launcher-|隔離|stateRoot|request\.json/);
  }
  child.stdin.end();
  assert.deepEqual(await closed, [0, null], "Closing the host's stdin must naturally close PowerShell and its server");
  assert.equal(stderr, "");
  assert.deepEqual(await fs.readdir(home, { recursive: true }), initialHome,
    "Read-only startup/status must not create settings or account files");
  assert.equal(await fs.readFile(events, "utf8"), "status\nstatus\n");
});
