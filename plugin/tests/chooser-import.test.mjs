import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { createStudio } from "../studio.mjs";

const run = promisify(execFile);
const shellQuote = value => `'${value.replaceAll("'", "'\\''")}'`;

test("chooser imports through the real wrapper/backend and preserves actionable private failures", {
  skip: process.platform !== "darwin",
}, async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "xskin-chooser-import-"));
  const home = path.join(temporary, "隔離 家目錄 🌙 with spaces");
  const engine = path.join(home, ".codex/codex-dream-skin-studio");
  const scripts = path.join(engine, "scripts");
  const state = path.join(home, "Library/Application Support/CodexDreamSkinStudio");
  const theme = path.join(state, "theme");
  const preload = path.join(temporary, "permission-fixture.mjs");
  let selected = "";
  let fault = "";
  let pickerError = false;
  let studio;
  try {
    await fs.mkdir(theme, { recursive: true });
    await fs.cp(new URL("../../macos/scripts", import.meta.url), scripts, { recursive: true });
    await fs.copyFile(new URL("../../macos/VERSION", import.meta.url), path.join(engine, "VERSION"));
    await fs.copyFile(new URL("../../macos/assets/portal-hero.png", import.meta.url), path.join(theme, "initial.png"));
    await fs.writeFile(path.join(theme, "theme.json"), JSON.stringify({
      schemaVersion: 1, id: "chooser-fixture", name: "fixture", image: "initial.png",
    }));
    // Stub discovery and app controls before executing any real runtime script.
    await fs.writeFile(path.join(scripts, "common-macos.sh"), `PROJECT_ROOT=${shellQuote(engine)}
INSTALL_ROOT=${shellQuote(engine)}
SCRIPT_DIR=${shellQuote(scripts)}
STATE_ROOT="$HOME/Library/Application Support/CodexDreamSkinStudio"
THEME_DIR="$STATE_ROOT/theme"
NODE=${shellQuote(process.execPath)}
discover_codex_app(){ :; }
require_macos_runtime(){ :; }
ensure_state_root(){ test -d "$THEME_DIR"; }
`);
    await fs.writeFile(path.join(scripts, "status-dream-skin-macos.sh"), '#!/bin/bash\nprintf \'{"session":"active"}\\n\'\n');
    await fs.writeFile(path.join(scripts, "autostart-dream-skin-macos.sh"), '#!/bin/bash\nprintf \'enabled=false\\nloaded=false\\n\'\n');
    for (const name of ["start-dream-skin-macos.sh", "pause-dream-skin-macos.sh"]) {
      await fs.writeFile(path.join(scripts, name), '#!/bin/bash\n: > "$HOME/unexpected-app-control"\nexit 97\n');
    }
    await fs.writeFile(preload, `import fs from "node:fs/promises";
import path from "node:path";
for (const name of ["lstat", "copyFile", "mkdir", "open", "writeFile", "rename", "chmod"]) {
  const original = fs[name];
  fs[name] = async (file, ...args) => {
    const mode = process.env.XSKIN_FIXTURE_PERMISSION;
    const insideImport = typeof file === "string" && file.includes("/studio/import-");
    const denied = (mode === name && file === process.env.XSKIN_FIXTURE_SOURCE) ||
      (mode === "studio-mkdir" && name === "mkdir" && path.basename(file) === "studio") ||
      (mode === "lock-open" && name === "open" && path.basename(file) === "operation.lock") ||
      (mode === "import-mkdir" && name === "mkdir" && insideImport) ||
      (mode === "import-write" && name === "writeFile" && insideImport && path.basename(file).startsWith("source.")) ||
      (mode === "import-rename" && name === "rename" && insideImport && path.basename(file).startsWith("source.")) ||
      (mode === "import-chmod" && name === "chmod" && insideImport && file.endsWith(".png")) ||
      (mode === "theme-write" && name === "writeFile" && insideImport && path.basename(file).startsWith("theme.json.")) ||
      (mode === "selection-rename" && name === "rename" && typeof args[0] === "string" && args[0].endsWith("/studio/selection.json"));
    if (denied) {
      throw Object.assign(new Error("PRIVATE_PERMISSION_DETAIL"), {code: "EPERM"});
    }
    return original.call(fs, file, ...args);
  };
}
`);
    studio = await createStudio(engine, { home, platform: "darwin", execute: async (file, args, options) => {
      if (file === "/usr/bin/osascript") {
        if (pickerError) throw new Error("PRIVATE_CHOOSER_DETAIL");
        return { stdout: `${selected}\n` };
      }
      if (file === "/usr/bin/defaults") return { stdout: "en\n" };
      assert.ok((file === "/bin/bash" && args[0] === path.join(scripts, "studio-command-macos.sh")) ||
        (file === process.execPath && args[0] === path.join(scripts, "background-studio.mjs")));
      return run(file, args, { ...options, env: { ...options.env,
        NODE_OPTIONS: `--import=${pathToFileURL(preload).href}`,
        XSKIN_FIXTURE_PERMISSION: fault, XSKIN_FIXTURE_SOURCE: selected,
      } });
    } });
    const mp4 = Buffer.from("000000186674797069736f6d0000020069736f6d6d703431", "hex");
    const source = path.join(temporary, "原始 影片 🌙.mp4");
    selected = source;
    await fs.writeFile(source, mp4);
    const imported = await studio.choose();
    assert.equal(imported.selection.name, path.basename(source));
    assert.equal(imported.selection.bytes, mp4.length);
    assert.equal(imported.selection.previewError, false);
    const previousId = imported.selection.id;
    const previousActive = imported.active;
    const rejected = async errorCode => {
      await assert.rejects(studio.choose(), error => {
        assert.equal(error.errorCode, errorCode);
        assert.doesNotMatch(error.message, /PRIVATE|xskin-chooser-import-|Application Support/);
        return true;
      });
      const current = await studio.status();
      assert.equal(current.selection.id, previousId);
      assert.deepEqual(current.active, previousActive);
    };
    for (const name of ["lstat", "copyFile"]) {
      fault = name;
      await rejected("file_access_denied");
    }
    for (const name of ["studio-mkdir", "lock-open", "import-mkdir", "import-rename", "import-chmod", "theme-write", "selection-rename"]) {
      fault = name;
      await rejected("file_access_denied");
    }
    fault = "";
    const imageSource = path.join(temporary, "convert.png");
    await fs.copyFile(path.join(theme, "initial.png"), imageSource);
    selected = imageSource;
    fault = "import-write";
    await rejected("file_access_denied");
    fault = "";
    const backend = path.join(scripts, "background-studio.mjs");
    const backendSource = await fs.readFile(backend, "utf8");
    const sipsFixture = path.join(temporary, "sips-fixture.sh");
    await fs.writeFile(sipsFixture, `#!/bin/bash
if [ "$1" = -s ]; then
  printf 'PRIVATE_CONVERSION_STDOUT\\n'
  printf 'PRIVATE_CONVERSION_STDERR\\n' >&2
  exit 42
fi
exec /usr/bin/sips "$@"
`, { mode: 0o700 });
    await fs.writeFile(backend, backendSource.replaceAll('"/usr/bin/sips"', JSON.stringify(sipsFixture)));
    try { await rejected("image_conversion"); }
    finally { await fs.writeFile(backend, backendSource); }
    selected = source;
    if (process.getuid() !== 0) {
      await fs.chmod(source, 0);
      try { await rejected("file_access_denied"); }
      finally { await fs.chmod(source, 0o600); }
      selected = path.join(temporary, "unreadable.png");
      await fs.copyFile(path.join(theme, "initial.png"), selected);
      await fs.chmod(selected, 0);
      try { await rejected("file_access_denied"); }
      finally { await fs.chmod(selected, 0o600); }
    }
    selected = path.join(temporary, "oversized.mp4");
    const oversized = await fs.open(selected, "wx");
    await oversized.truncate(256 * 1024 * 1024 + 1);
    await oversized.close();
    await rejected("video_size_limit");
    selected = path.join(temporary, "broken.mp4");
    await fs.writeFile(selected, "not an mp4 container");
    await rejected("invalid_video");
    selected = path.join(temporary, "embedded\nnewline.mp4");
    await rejected("invalid_local_file");
    selected = "";
    const cancelled = await studio.choose();
    assert.equal(cancelled.cancelled, true);
    assert.equal(cancelled.selection.id, previousId);
    pickerError = true;
    await rejected("operation_failed");
    pickerError = false;
    selected = source;
    assert.notEqual((await studio.choose()).selection.id, previousId,
      "An unsuccessful selection must release the adapter's busy state for the next chooser.");
    await assert.rejects(fs.access(path.join(home, "unexpected-app-control")), { code: "ENOENT" });
  } finally {
    await studio?.close();
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
