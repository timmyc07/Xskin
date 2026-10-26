import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { loadTheme } from "../scripts/injector.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const macosRoot = path.resolve(here, "..");
const stageScript = path.join(macosRoot, "scripts", "stage-theme.mjs");
const fixtureAsset = path.join(macosRoot, "assets", "portal-hero.png");
const tempRoot = await fs.mkdtemp(path.join("/tmp", "codex-dream-skin-stage-"));

function runStage(source, stage) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [stageScript, source, stage], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `stage-theme exited with ${code}`));
    });
  });
}

try {
  const source = path.join(tempRoot, "themes", "preset-race");
  const stage = path.join(tempRoot, "stage");
  await fs.mkdir(source, { recursive: true });
  await fs.mkdir(stage);
  await fs.copyFile(fixtureAsset, path.join(source, "background-a.png"));
  await fs.writeFile(
    path.join(source, "theme.json"),
    `${JSON.stringify({ schemaVersion: 1, id: "preset-race", name: "A", image: "background-a.png" })}\n`,
  );

  const imageName = await runStage(source, stage);
  assert.equal(imageName, "background-a.png");
  const stagedConfig = JSON.parse(await fs.readFile(path.join(stage, "theme.json"), "utf8"));
  assert.equal(stagedConfig.image, "background-a.png");
  const stagedBeforeMutation = await fs.readFile(path.join(stage, "background-a.png"));

  // A source edit after staging must not change the pair that is about to be
  // published. This is the regression for switch-theme's old copy-after-
  // validation TOCTOU window.
  await fs.copyFile(fixtureAsset, path.join(source, "background-b.png"));
  await fs.writeFile(
    path.join(source, "theme.json"),
    `${JSON.stringify({ schemaVersion: 1, id: "preset-race", name: "B", image: "background-b.png" })}\n`,
  );
  await fs.writeFile(path.join(source, "background-a.png"), Buffer.from("changed-after-stage"));
  assert.deepEqual(await fs.readFile(path.join(stage, "background-a.png")), stagedBeforeMutation);
  assert.equal(JSON.parse(await fs.readFile(path.join(stage, "theme.json"), "utf8")).name, "A");

  const outside = path.join(tempRoot, "outside.png");
  await fs.copyFile(fixtureAsset, outside);
  const traversal = path.join(tempRoot, "traversal");
  await fs.mkdir(traversal);
  await fs.writeFile(
    path.join(traversal, "theme.json"),
    `${JSON.stringify({ schemaVersion: 1, id: "bad", image: "../outside.png" })}\n`,
  );
  const traversalStage = path.join(tempRoot, "traversal-stage");
  await fs.mkdir(traversalStage);
  await assert.rejects(runStage(traversal, traversalStage), /inside its theme directory/);

  const symlink = path.join(tempRoot, "symlink");
  await fs.mkdir(symlink);
  await fs.symlink(outside, path.join(symlink, "background.png"));
  await fs.writeFile(
    path.join(symlink, "theme.json"),
    `${JSON.stringify({ schemaVersion: 1, id: "bad-link", image: "background.png" })}\n`,
  );
  const symlinkStage = path.join(tempRoot, "symlink-stage");
  await fs.mkdir(symlinkStage);
  await assert.rejects(runStage(symlink, symlinkStage), /symbolic link/);

  const run = promisify(execFile);
  const unsafe = path.join(tempRoot, "unsafe");
  await fs.mkdir(unsafe);
  const configBytes = Buffer.from(JSON.stringify({ schemaVersion: 1, image: "background.png" }));
  const imageBytes = await fs.readFile(fixtureAsset);
  const rejectUnsafe = async pattern => {
    for (const args of [
      [stageScript, unsafe, stage],
      [path.join(macosRoot, "scripts/injector.mjs"), "--check-payload", "--theme-dir", unsafe],
    ]) await assert.rejects(run(process.execPath, args, { timeout: 2000 }), pattern);
  };
  for (const filename of ["theme.json", "background.png"]) {
    await fs.writeFile(path.join(unsafe, "theme.json"), configBytes);
    await fs.writeFile(path.join(unsafe, "background.png"), imageBytes);
    await fs.unlink(path.join(unsafe, filename));
    await run("mkfifo", [path.join(unsafe, filename)]);
    await rejectUnsafe(/regular file|stable non-empty file/);
    await fs.unlink(path.join(unsafe, filename));
  }
  await fs.writeFile(path.join(unsafe, "background.png"), imageBytes);
  await fs.writeFile(path.join(unsafe, "theme.json"), Buffer.alloc(1024 * 1024 + 1, 0x20));
  await rejectUnsafe(/larger than|no larger than/);
  const unsafeConfig = path.join(unsafe, "theme.json");
  await fs.writeFile(unsafeConfig, Buffer.concat([
    Buffer.from('{"name":"'), Buffer.from([0xff]), Buffer.from('","schemaVersion":1,"image":"background.png"}'),
  ]));
  await rejectUnsafe(/encoded data|UTF-8/);
  await fs.writeFile(unsafeConfig, configBytes);
  const canonicalConfig = await fs.realpath(unsafeConfig);
  const originalOpen = fs.open;
  try {
    fs.open = async (...args) => {
      const handle = await originalOpen(...args);
      if (args[0] === canonicalConfig) {
        const read = handle.readFile.bind(handle);
        handle.readFile = async () => {
          const bytes = await read();
          await fs.appendFile(unsafeConfig, "\n");
          return bytes;
        };
      }
      return handle;
    };
    await assert.rejects(loadTheme(unsafe), /changed while loading/);
  } finally { fs.open = originalOpen; }
  assert.deepEqual(await fs.readFile(path.join(stage, "theme.json")), Buffer.from(`${JSON.stringify(stagedConfig)}\n`), "Rejected sources must preserve the previously staged configuration.");

  console.log("PASS: theme staging snapshots a matched, contained config/image pair.");
  console.log("PASS: theme loading and staging reject pipes, oversized config and invalid UTF-8 without blocking.");
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}
