// Own-browser fixture only: no official app, saved settings or real tools are accessed.
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const video = process.argv[2] ? await fs.readFile(process.argv[2]) : null;
const bundle = entry => build({ absWorkingDir: root, entryPoints: [entry], bundle: true, write: false,
  format: "iife", platform: "browser", target: "es2022", minify: true });
const [app, host, qa, css, template] = await Promise.all([
  bundle("ui/index.mjs"), bundle("tests/browser-host.mjs"), bundle("tests/browser-frame.mjs"),
  fs.readFile(path.join(root, "ui/studio.css"), "utf8"), fs.readFile(path.join(root, "ui/studio.html"), "utf8"),
]);
const html = template.replace("<!-- XSKIN_STYLE -->", () => `<style>${css}\nhtml{background:#181818!important}</style>`)
  .replace("<!-- XSKIN_SCRIPT -->", () => `<script>${app.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")}</script><script>${qa.outputFiles[0].text}</script>`);
const crc32 = bytes => {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
};
const pngChunk = (name, bytes) => {
  const type = Buffer.from(name);
  const header = Buffer.alloc(4); header.writeUInt32BE(bytes.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([type, bytes])));
  return Buffer.concat([header, type, bytes, crc]);
};
const width = 640, height = 360;
const rows = Buffer.alloc((width * 3 + 1) * height);
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const offset = y * (width * 3 + 1) + 1 + x * 3;
  let rgb = [27 + 190 * y / height, 57 + 104 * y / height, 93 + 25 * y / height];
  if ((x - 485) ** 2 + (y - 70) ** 2 < 27 ** 2) rgb = [255, 240, 204];
  if (y > 290 - 200 * Math.max(0, 1 - Math.abs(x - 165) / 170)) rgb = [41, 72, 71];
  if (y > 325 - 120 * Math.max(0, 1 - Math.abs(x - 445) / 200)) rgb = [23, 47, 56];
  rows.set(rgb.map(Math.round), offset);
}
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
const image = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(rows)), pngChunk("IEND", Buffer.alloc(0))]);
const fixtures = { image: { mimeType: "image/png", data: image.toString("base64") },
  video: { mimeType: "video/mp4", data: (video ?? Buffer.alloc(0)).toString("base64") } };
let hostOrigin;
const appServer = http.createServer((request, response) => {
  if (new URL(request.url, "http://127.0.0.1").pathname !== "/app.html") { response.writeHead(404).end(); return; }
  response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store",
    "Content-Security-Policy": `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src blob:; media-src blob:; font-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${hostOrigin}` }).end(html);
});
await new Promise(resolve => appServer.listen(0, "127.0.0.1", resolve));
const appOrigin = `http://127.0.0.1:${appServer.address().port}`;
const page = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Xskin own-browser QA</title>
<style>body{font:14px system-ui;margin:18px;background:#ddd;color:#222}nav{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px}button,select{font:inherit;padding:6px}.frame-wrap{position:relative;width:600px;background:linear-gradient(145deg,#15304d,#b1a28c);border:1px solid #888}iframe{display:block;border:0;height:680px;width:100%;background:transparent}.composer{position:absolute;bottom:0;left:16px;right:16px;height:148px;border:1px solid #8496b4;border-radius:22px;background:#172134d9;color:white;padding:16px;box-sizing:border-box;pointer-events:auto}pre{white-space:pre-wrap;max-width:1000px;max-height:150px;overflow:auto}label{display:flex;gap:5px;align-items:center}</style>
<h1>Xskin sample host</h1><p>Sample media and fake tools only. Separate iframe origin, Blob-only media CSP, simulated host composer.</p>
<nav><label>Width<select id="width"><option>320</option><option selected>600</option><option>1280</option></select></label>
<label>Theme<select id="theme"><option>dark</option><option>light</option></select></label>
<label>Embedder scheme<select id="canvas"><option>light</option><option>dark</option></select></label>
<label>Language<select id="language"><option>en</option><option>zh-Hant</option><option>zh-Hans</option><option>ja</option></select></label>
<button id="run">Run browser checks</button><button id="video">Video fixture</button><button id="empty">Empty fixture</button><button id="teardown">Teardown</button></nav>
<pre id="report">Loading own SDK fixture…</pre><pre id="receipt" hidden></pre><div class="frame-wrap"><iframe id="app" data-origin="${appOrigin}" title="Xskin embedded fixture" sandbox="allow-scripts allow-same-origin"></iframe><div class="composer">Sample host composer · the settings must scroll above this reserved area.</div></div>
<script id="fixture-data" type="application/json">${JSON.stringify(fixtures)}</script><script src="/host.js"></script>`;
const server = http.createServer((request, response) => {
  const route = new URL(request.url, "http://127.0.0.1").pathname;
  const entry = ({ "/": ["text/html", page], "/host.js": ["text/javascript", host.outputFiles[0].contents] })[route];
  if (!entry) { response.writeHead(404).end(); return; }
  response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": entry[0] }).end(entry[1]);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
hostOrigin = `http://127.0.0.1:${server.address().port}`;
console.log(`Xskin own-browser QA: ${hostOrigin} (app: ${appOrigin})`);
const close = () => { server.closeAllConnections(); appServer.closeAllConnections(); server.close(); appServer.close(); };
process.once("SIGTERM", close);
process.once("SIGINT", close);
