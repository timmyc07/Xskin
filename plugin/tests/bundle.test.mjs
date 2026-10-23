import assert from "node:assert/strict";
import test, { after } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const source = fileURLToPath(new URL("..", import.meta.url));
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "xskin-bundle-"));
after(() => fs.rm(temporary, { recursive: true, force: true }));
const packageRoot = path.join(temporary, "套件 中文 🌙 with spaces");
const plugin = path.join(packageRoot, "plugin");
const runtime = path.join(packageRoot, "macos");
await fs.mkdir(packageRoot, { recursive: true });
await fs.copyFile(new URL("../../mcp.json", import.meta.url), path.join(packageRoot, "mcp.json"));
await fs.cp(source, plugin, {
  recursive: true,
  filter: file => !["node_modules", "dist", "tests"].some(part => path.relative(source, file).split(path.sep).includes(part)),
});
await fs.mkdir(path.join(runtime, "scripts"), { recursive: true });
await fs.copyFile(new URL("../../macos/scripts/image-metadata.mjs", import.meta.url), path.join(runtime, "scripts/image-metadata.mjs"));
const manifest = JSON.parse(await fs.readFile(path.join(plugin, "package.json"), "utf8"));
await fs.writeFile(path.join(runtime, "VERSION"), `${manifest.version}\n`);
await fs.symlink(path.join(source, "node_modules"), path.join(plugin, "node_modules"), process.platform === "win32" ? "junction" : "dir");
await run(process.execPath, [path.join(plugin, "build.mjs")], { timeout: 15000 });
await fs.unlink(path.join(plugin, "node_modules"));

test("a freshly compiled bundle runs independently of its source and node_modules", async () => {
  const independent = path.join(temporary, "獨立 runtime 🌙 space");
  await fs.cp(path.join(plugin, "dist"), independent, { recursive: true });
  const probe = `
    import assert from 'node:assert/strict';
    const { createMcpServer, RESOURCE } = await import('./server.mjs');
    assert.equal(RESOURCE, 'ui://xskin/studio-${manifest.version}.html');
    const server = createMcpServer({ close: async () => {} }, '<p>fixture</p>');
    assert.equal(typeof server.connect, 'function');
    await server.close();
    console.log('SELF_CONTAINED');
  `;
  const { stdout, stderr } = await run(process.execPath, ["--input-type=module", "--eval", probe], {
    cwd: independent, timeout: 5000, env: { ...process.env, NODE_PATH: "" },
  });
  assert.equal(stdout.trim(), "SELF_CONTAINED");
  assert.equal(stderr, "");
  assert.deepEqual((await fs.readdir(independent)).sort(), ["THIRD_PARTY_NOTICES.txt", "server.mjs", "studio.html"]);
  const html = await fs.readFile(path.join(independent, "studio.html"), "utf8");
  assert.doesNotMatch(html, /<!-- XSKIN_(?:STYLE|SCRIPT) -->/);
  assert.match(html, /<style>/);
  assert.match(html, /<script>/);
  assert.doesNotMatch(html, /<(?:script|link)\b[^>]*(?:src|href)=["']https?:\/\//i);
  const notices = await fs.readFile(path.join(independent, "THIRD_PARTY_NOTICES.txt"), "utf8");
  assert.match(notices, /@modelcontextprotocol\/server 2\.3\.1 \(Apache-2\.0\)/);
  assert.match(notices, /@modelcontextprotocol\/ext-apps 2\.0\.3/);
  assert.match(notices, /Apache License[\s\S]*Version 2\.0/);
  assert.match(notices, /Permission is hereby granted, free of charge/);
});

test("the portable manifest launches its contained executable and preserves Unicode, emoji and spaces", {
  skip: process.platform === "win32",
}, async () => {
  const configuration = JSON.parse(await fs.readFile(path.join(packageRoot, "mcp.json"), "utf8")).mcpServers.xskin;
  const expandRoot = value => value.replaceAll("${PLUGIN_ROOT}", packageRoot);
  assert.equal(configuration.type, "stdio");
  assert.match(configuration.command, /^\.\//, "Agent Plugins 1.0 requires a plugin-relative ./ command");
  assert.ok(!configuration.command.split("/").includes(".."), "The command cannot traverse outside the plugin");
  const launcher = await fs.realpath(path.resolve(packageRoot, configuration.command));
  const relative = path.relative(await fs.realpath(packageRoot), launcher);
  assert.ok(relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), "The executable must stay inside the installed plugin");
  assert.equal((await fs.stat(launcher)).mode & 0o777, 0o755, "The declared command must be executable without a shell wrapper");
  const executable = path.join(temporary, "fixture node 中文 🌙");
  const argumentsFile = path.join(temporary, "launcher-arguments");
  const eventsFile = path.join(temporary, "launcher-events");
  await fs.writeFile(executable, '#!/bin/bash\nset -euo pipefail\nprintf "%s\\0" "$@" > "$FIXTURE_ARGS"\n', { mode: 0o755 });
  await fs.writeFile(path.join(runtime, "scripts/common-macos.sh"), [
    'discover_codex_app() { printf "discover\\n" >> "$FIXTURE_EVENTS"; }',
    'require_macos_runtime() { printf "runtime\\n" >> "$FIXTURE_EVENTS"; NODE="$FIXTURE_NODE"; }',
    "",
  ].join("\n"));
  const { stdout, stderr } = await run(launcher, (configuration.args ?? []).map(expandRoot), {
    cwd: path.resolve(packageRoot, expandRoot(configuration.cwd ?? ".")),
    env: { ...process.env, FIXTURE_NODE: executable, FIXTURE_ARGS: argumentsFile, FIXTURE_EVENTS: eventsFile },
    timeout: 5000,
  });
  assert.equal(stdout, "", "The launcher leaves stdout exclusively for the MCP protocol");
  assert.equal(stderr, "");
  assert.deepEqual((await fs.readFile(argumentsFile, "utf8")).split("\0"), [
    path.join(await fs.realpath(plugin), "dist/server.mjs"), await fs.realpath(runtime), "",
  ]);
  assert.equal(await fs.readFile(eventsFile, "utf8"), "discover\nruntime\n");
});

test("stdin EOF closes the compiled server without a preview listener", {
  skip: process.platform !== "darwin", timeout: 15000,
}, async t => {
  const home = path.join(temporary, "隔離 home 中文 🌙");
  await fs.mkdir(home);
  const child = spawn(process.execPath, [path.join(plugin, "dist/server.mjs"), runtime], {
    cwd: temporary, env: { ...process.env, HOME: home, NODE_PATH: "" }, stdio: ["pipe", "pipe", "pipe"],
  });
  const closed = once(child, "close");
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await closed;
  });
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const request = async (id, method, params) => {
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    for (;;) {
      const line = await lines.next();
      assert.equal(line.done, false, "The server must answer before closing stdout");
      const response = JSON.parse(line.value);
      if (response.id !== id) continue;
      assert.equal(response.error, undefined);
      return response.result;
    }
  };
  const initialized = await request(1, "initialize", {
    protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "xskin-eof-fixture", version: "1.0.0" },
  });
  assert.equal(initialized.serverInfo.name, "xskin");
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  const resource = await request(2, "resources/read", { uri: `ui://xskin/studio-${manifest.version}.html` });
  assert.deepEqual(resource.contents[0]._meta.ui.csp, { connectDomains: [], resourceDomains: ["blob:"], frameDomains: [] });
  child.stdin.end();
  assert.deepEqual(await closed, [0, null], "EOF must finish naturally, without a signal or a forced exit");
  assert.equal(stderr, "");
  assert.deepEqual(await fs.readdir(home), [], "The protocol fixture never creates settings or account files");
});
