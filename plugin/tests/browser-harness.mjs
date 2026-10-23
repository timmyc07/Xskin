// Own-browser fixture only: no official app, saved settings or real tools are accessed.
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const video = process.argv[2] ? await fs.readFile(process.argv[2]) : null;
const [app, host, css, template] = await Promise.all([
  build({ absWorkingDir: root, entryPoints: ["ui/index.mjs"], bundle: true, write: false, format: "iife", platform: "browser", target: "es2022", minify: true }),
  build({ absWorkingDir: root, entryPoints: ["tests/browser-host.mjs"], bundle: true, write: false, format: "iife", platform: "browser", target: "es2022", minify: true }),
  fs.readFile(path.join(root, "ui/studio.css"), "utf8"),
  fs.readFile(path.join(root, "ui/studio.html"), "utf8"),
]);
const html = template.replace("<!-- XSKIN_STYLE -->", () => `<style>${css}</style>`)
  .replace("<!-- XSKIN_SCRIPT -->", () => `<script>${app.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")}</script>`);
const page = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Xskin own-browser QA</title>
<style>body{font:14px system-ui;margin:18px;background:#ddd;color:#222}nav{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px}button,select{font:inherit;padding:6px}iframe{display:block;border:1px solid #888;height:1600px;width:600px}pre{white-space:pre-wrap;max-width:1000px;max-height:150px;overflow:auto}label{display:flex;gap:5px;align-items:center}</style>
<h1>Xskin fixture host</h1><p>This page uses sample media and fake tools. It does not access Codex or your settings.</p>
<nav><label>Width<select id="width"><option>320</option><option selected>600</option><option>1280</option></select></label>
<label>Theme<select id="theme"><option>dark</option><option>light</option></select></label>
<label>Language<select id="language"><option>en</option><option>zh-Hant</option><option>zh-Hans</option><option>ja</option></select></label>
<button id="run">Run browser checks</button><button id="video">Video fixture</button><button id="empty">Empty fixture</button><button id="teardown">Teardown</button></nav>
<pre id="report">Loading own SDK fixture…</pre><iframe id="app" title="Xskin embedded fixture" sandbox="allow-scripts allow-same-origin"></iframe><script src="/host.js"></script>`;
const image = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#173b69"/><stop offset="1" stop-color="#f5b888"/></linearGradient></defs><rect width="1200" height="675" fill="url(#sky)"/><circle cx="920" cy="150" r="55" fill="#fff3d5"/><path d="M0 600 300 220 570 600 810 300 1200 610V675H0" fill="#294847"/><path d="m300 220-90 126 90-30 90 30z" fill="#dce8e3"/><path d="M0 620q300-90 600 0t600-5V675H0" fill="#172f38"/></svg>`;
const server = http.createServer((request, response) => {
  const route = new URL(request.url, "http://127.0.0.1").pathname;
  const entry = ({ "/": ["text/html", page], "/app.html": ["text/html", html],
    "/host.js": ["text/javascript", host.outputFiles[0].contents], "/sample.svg": ["image/svg+xml", image],
    "/sample.mp4": ["video/mp4", video] })[route];
  if (!entry || !entry[1]) { response.writeHead(404).end(); return; }
  const body = Buffer.isBuffer(entry[1]) ? entry[1] : Buffer.from(entry[1]);
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? "");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", entry[0]);
  if (range && route === "/sample.mp4") {
    const start = Number(range[1]);
    const end = Math.min(Number(range[2] || body.length - 1), body.length - 1);
    if (start > end) { response.writeHead(416).end(); return; }
    response.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${body.length}`, "Content-Length": end - start + 1, "Accept-Ranges": "bytes" }).end(body.subarray(start, end + 1));
  } else response.writeHead(200, { "Content-Length": body.length, "Accept-Ranges": "bytes" }).end(body);
});
server.listen(0, "127.0.0.1", () => console.log(`Xskin own-browser QA: http://127.0.0.1:${server.address().port}`));
process.once("SIGTERM", () => server.close());
process.once("SIGINT", () => server.close());
