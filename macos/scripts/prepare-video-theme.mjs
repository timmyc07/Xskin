import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { loadTheme } from "./injector.mjs";
import { copyVideo } from "./video-file.mjs";

const [source, destination, name = "My Codex Dream Skin"] = process.argv.slice(2);
if (!source || !destination || /\p{Cc}|\u2028|\u2029/u.test(name) || !name.trim() || name.length > 80) {
  throw new Error("Usage: prepare-video-theme.mjs VIDEO.mp4 THEME_DIR [NAME up to 80 characters]");
}
const { art, extension, raw, assetsRoot } = await loadTheme(destination);
const id = `custom-video-${randomUUID()}`;
const imageName = `background-${id}${extension}`;
const videoName = `background-${id}.mp4`;
const theme = {
  ...raw, id, name: name.trim(), image: imageName, video: videoName,
  appearance: "dark", art: { ...raw.art, taskMode: "ambient" },
};
const temporary = path.join(assetsRoot, `.theme-${randomUUID()}.json`);
let published = false;
try {
  await fs.writeFile(path.join(assetsRoot, imageName), art, { mode: 0o600, flag: "wx" });
  await copyVideo(path.resolve(source), path.join(assetsRoot, videoName));
  await fs.writeFile(temporary, `${JSON.stringify(theme, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  await fs.rename(temporary, path.join(assetsRoot, "theme.json"));
  published = true;
} finally {
  await fs.rm(temporary, { force: true });
  if (!published) {
    await fs.rm(path.join(assetsRoot, imageName), { force: true });
    await fs.rm(path.join(assetsRoot, videoName), { force: true });
  }
}
for (const oldName of [raw.image, raw.video]) {
  if (oldName?.startsWith("background-") && ![imageName, videoName].includes(oldName)) {
    await fs.rm(path.join(assetsRoot, oldName), { force: true });
  }
}
console.log(`Prepared video theme “${theme.name}” with the current image as its fallback.`);
