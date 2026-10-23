import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const repository = fileURLToPath(new URL("../..", import.meta.url));

test("the Windows plugin archive retains marketplace discovery, contained launcher, docs and bundled runtime", {
  skip: process.platform !== "win32", timeout: 60000,
}, async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "xskin-package-"));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const fixture = path.join(temporary, "套件 中文 🌙 with spaces");
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toLowerCase() !== "psmodulepath"));
  const runtime = path.join(fixture, "portable runtime");
  for (const directory of ["windows/scripts", "plugin", ".agents/plugins", "docs", "skills/background-studio", "portable runtime/scripts"]) {
    await fs.mkdir(path.join(fixture, directory), { recursive: true });
  }
  for (const file of ["plugin.json", "mcp.windows.json", ".agents/plugins/marketplace.json", "plugin/launch-windows.ps1",
    "skills/background-studio/SKILL.md", "windows/VERSION", "windows/scripts/build-plugin-release.ps1", "windows/scripts/prepare-package-docs.ps1", "windows/scripts/config-utf8.ps1"]) {
    await fs.copyFile(path.join(repository, file), path.join(fixture, file));
  }
  for (const file of await fs.readdir(path.join(repository, "docs"))) {
    if (file.endsWith(".md")) await fs.copyFile(path.join(repository, "docs", file), path.join(fixture, "docs", file));
  }
  for (const file of ["README.md", "README.en.md", "VERSION"]) {
    await fs.copyFile(path.join(repository, "windows", file), path.join(runtime, file));
  }
  await fs.copyFile(process.execPath, path.join(runtime, "scripts/node.exe"));
  await fs.writeFile(path.join(fixture, ".env"), "PACKAGING_FIXTURE_SECRET=never-ship\n");
  await fs.writeFile(path.join(fixture, "docs/.env"), "PACKAGING_FIXTURE_SECRET=never-ship\n");
  await fs.writeFile(path.join(fixture, "plugin/build.mjs"), `
    import fs from 'node:fs/promises';
    await fs.mkdir(new URL('./dist/', import.meta.url), { recursive: true });
    await Promise.all(['server.mjs', 'studio.html', 'THIRD_PARTY_NOTICES.txt'].map(file =>
      fs.writeFile(new URL('./dist/' + file, import.meta.url), 'fixture bundle')));
  `);
  await run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
    path.join(fixture, "windows/scripts/build-plugin-release.ps1"), "-RuntimeRoot", runtime], { timeout: 45000, windowsHide: true, env });
  const version = (await fs.readFile(path.join(runtime, "VERSION"), "utf8")).trim();
  const zip = path.join(fixture, "build/windows", `xskin-plugin-v${version}-windows-x64.zip`);
  const hash = createHash("sha256").update(await fs.readFile(zip)).digest("hex");
  assert.equal(await fs.readFile(`${zip}.sha256`, "utf8"), `${hash}  ${path.basename(zip)}\n`);
  const expand = path.join(temporary, "expand.ps1");
  const extracted = path.join(temporary, "extracted");
  await fs.writeFile(expand, "param([string]$Archive, [string]$Destination)\n$ErrorActionPreference = 'Stop'\nExpand-Archive -LiteralPath $Archive -DestinationPath $Destination\n");
  await run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", expand, "-Archive", zip, "-Destination", extracted], { timeout: 15000, windowsHide: true, env });
  const entries = await fs.readdir(extracted);
  assert.equal(entries.length, 1, "The archive must retain one complete plugin root");
  const packaged = path.join(extracted, entries[0]);
  for (const file of ["plugin.json", "mcp.json", ".agents/plugins/marketplace.json", "skills/background-studio/SKILL.md",
    "plugin/launch-windows.ps1", "plugin/dist/server.mjs", "plugin/dist/studio.html", "plugin/dist/THIRD_PARTY_NOTICES.txt",
    "windows/scripts/node.exe", "windows/VERSION", "docs/in-app-studio.md", "docs/windows-parity.md", "docs/usage-fields.md"]) {
    assert.equal((await fs.stat(path.join(packaged, file))).isFile(), true, file);
  }
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(packaged, "mcp.json"), "utf8")),
    JSON.parse(await fs.readFile(path.join(repository, "mcp.windows.json"), "utf8")));
  const config = JSON.parse(await fs.readFile(path.join(packaged, "mcp.json"), "utf8")).mcpServers.xskin;
  const launcher = config.args[config.args.indexOf("-File") + 1].replaceAll("${PLUGIN_ROOT}", packaged);
  const relative = path.relative(packaged, await fs.realpath(launcher));
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  const files = await fs.readdir(packaged, { recursive: true });
  assert.ok(!files.some(file => /(?:^|[\\/])(?:\.env(?:\.[^\\/]*)?|auth\.json|node_modules)(?:$|[\\/])/i.test(file)),
    "Only bundled runtime and public documentation belong in the archive");
  for (const file of ["windows/README.md", "windows/README.en.md"]) {
    const markdown = await fs.readFile(path.join(packaged, file), "utf8");
    for (const [, target] of markdown.matchAll(/\]\(([^)]+)\)/g)) {
      if (/^(?:https?:|#)/i.test(target)) continue;
      await fs.access(path.resolve(packaged, path.dirname(file), target.split("#")[0]));
    }
  }
});
