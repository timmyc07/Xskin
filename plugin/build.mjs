import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.dirname(fileURLToPath(import.meta.url));
const options = { absWorkingDir: root, bundle: true, write: false, metafile: true, legalComments: "inline", logLevel: "warning" };
const [server, app, css, template] = await Promise.all([
  build({ ...options, entryPoints: ["server.mjs"], platform: "node", format: "esm", target: "node20.10", minify: true }),
  build({ ...options, entryPoints: ["ui/index.mjs"], platform: "browser", format: "iife", target: "es2022", minify: true }),
  fs.readFile(path.join(root, "ui/studio.css"), "utf8"),
  fs.readFile(path.join(root, "ui/studio.html"), "utf8"),
]);
for (const marker of ["<!-- XSKIN_STYLE -->", "<!-- XSKIN_SCRIPT -->"]) {
  if (template.split(marker).length !== 2) throw new Error(`Expected one ${marker}`);
}
const html = template.replace("<!-- XSKIN_STYLE -->", () => `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`)
  .replace("<!-- XSKIN_SCRIPT -->", () => `<script>${app.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")}</script>`);

// Bundle notices too: end users do not install node_modules.
const packages = new Set();
for (const input of [...Object.keys(server.metafile.inputs), ...Object.keys(app.metafile.inputs)]) {
  const match = /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(input);
  if (match) packages.add(match[1]);
}
const notices = [];
for (const name of [...packages].sort()) {
  const directory = path.join(root, "node_modules", name);
  const manifest = JSON.parse(await fs.readFile(path.join(directory, "package.json"), "utf8"));
  const files = (await fs.readdir(directory)).filter(file => /^(licen[sc]e|notice)(\.|$)/i.test(file)).sort();
  if (!files.length) throw new Error(`Missing bundled license: ${name}`);
  notices.push(`${name} ${manifest.version} (${manifest.license})\n${"=".repeat(60)}\n` +
    (await Promise.all(files.map(async file => `${file}\n${await fs.readFile(path.join(directory, file), "utf8")}`))).join("\n"));
}
const output = path.join(root, "dist");
await fs.mkdir(output, { recursive: true });
await Promise.all([
  fs.writeFile(path.join(output, "server.mjs"), server.outputFiles[0].contents),
  fs.writeFile(path.join(output, "studio.html"), html),
  fs.writeFile(path.join(output, "THIRD_PARTY_NOTICES.txt"), notices.join("\n\n").replace(/[\t ]+$/gm, "")),
]);
console.log("Built Xskin's self-contained MCP server and in-app studio.");
