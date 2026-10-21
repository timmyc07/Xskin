import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "xskin-panel-"));
const stateRoot = path.join(temporary, "state");
const run = (action, request = {}) => new Promise((resolve, reject) => {
  const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
    path.join(root, "scripts/xskin-command.ps1"), "-Action", action, "-StateRoot", stateRoot], { windowsHide: true });
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
  child.stdin.end(JSON.stringify(request));
});
try {
  const initial = await run("state");
  assert.equal(initial.code, 0);
  assert.equal(initial.state.pending, false);
  const originalMetadata = await fs.readFile(path.join(stateRoot, "active-theme/theme.json"), "utf8");
  const source = path.join(temporary, "中文 $& picture.jpg");
  await fs.copyFile(path.join(root, "assets/dream-reference.jpg"), source);
  const imported = await run("import", { path: source });
  assert.equal(imported.code, 0);
  assert.equal(imported.state.pending, true);
  assert.equal(imported.state.name, "中文 $& picture");
  assert.equal(await fs.readFile(path.join(stateRoot, "active-theme/theme.json"), "utf8"), originalMetadata);
  for (const maskOpacity of [-1, 2, "0.5", true]) {
    const invalid = await run("apply", { maskOpacity });
    assert.equal(invalid.code, 1);
    assert.match(invalid.error, /Mask opacity/);
  }
  const paused = await run("pause");
  for (const maskOpacity of [0, 1]) {
    const stale = await run("apply", { maskOpacity, imagePath: source });
    assert.equal(stale.code, 1);
    assert.match(stale.error, /preview changed/);
  }
  const longSource = path.join(temporary, "a".repeat(130) + ".jpg");
  await fs.copyFile(source, longSource);
  const longName = await run("import", { path: longSource });
  assert.equal(longName.code, 0);
  assert.equal(longName.state.name.length, 80);
  assert.equal(paused.state.paused, true);
  assert.equal((await run("pause")).state.paused, false);
  const escaped = await run("select", { directory: temporary });
  assert.equal(escaped.code, 1);
  assert.match(escaped.error, /saved theme/);
  assert.equal(await fs.readFile(path.join(stateRoot, "active-theme/theme.json"), "utf8"), originalMetadata);
} finally { await fs.rm(temporary, { recursive: true, force: true }); }
console.log("PASS: Flutter bridge UTF-8 round-trip, preview isolation, mask validation, pause and path boundaries.");
