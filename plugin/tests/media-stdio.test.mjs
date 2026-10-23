import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const chunkBytes = 512 * 1024;
const mediaId = "a".repeat(64);
const mediaMeta = "com.xskin/media";
const fixtureSource = `
import fs from "node:fs/promises";
import { appendFileSync } from "node:fs";
import { createMcpServer } from ${JSON.stringify(new URL("../server.mjs", import.meta.url).href)};
import { StdioServerTransport } from ${JSON.stringify(import.meta.resolve("@modelcontextprotocol/server/stdio"))};
const [file, auditPath, waitForCancellation] = process.argv.slice(2);
const audit = value => appendFileSync(auditPath, JSON.stringify({ pid: process.pid, ...value }) + "\\n");
const write = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, ...args) => {
  audit({ event: "frame", bytes: Buffer.byteLength(chunk) });
  return write(chunk, ...args);
};
const handle = await fs.open(file, "r");
const { size } = await handle.stat();
let closed = false;
const waiting = new Set();
const failed = () => Object.assign(new Error("Fixture media unavailable"), { errorCode: "invalid_media" });
const studio = {
  async status() { return { version: "1.9.0", platform: "macos", language: "en", maskOpacity: .62 }; },
  async readMedia(id, offset, signal) {
    audit({ event: "read", id, offset });
    if (closed || id !== ${JSON.stringify(mediaId)} || !Number.isSafeInteger(offset) || offset < 0 || offset >= size) throw failed();
    if (waitForCancellation === "wait") {
      audit({ event: "waiting" });
      await new Promise((resolve, reject) => {
        const timer = setInterval(() => {}, 1000);
        const finish = () => {
          clearInterval(timer);
          waiting.delete(finish);
          audit({ event: "cancelled", aborted: signal?.aborted === true });
          reject(failed());
        };
        waiting.add(finish);
        if (signal?.aborted) finish();
        else signal?.addEventListener("abort", finish, { once: true });
      });
    }
    if (signal?.aborted) throw failed();
    const bytes = Buffer.alloc(Math.min(${chunkBytes}, size - offset));
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, offset);
    if (signal?.aborted || bytesRead !== bytes.length) throw failed();
    return { offset, total: size, mimeType: "video/mp4", data: bytes.toString("base64") };
  },
  async close() {
    if (closed) return;
    closed = true;
    for (const finish of [...waiting]) finish();
    await handle.close();
    let descriptorClosed = false;
    try { await handle.stat(); } catch (error) { descriptorClosed = error.code === "EBADF"; }
    audit({ event: "closed", descriptorClosed, waiting: waiting.size });
  },
};
process.once("exit", code => audit({ event: "exit", code }));
const server = createMcpServer(studio, "<!doctype html><title>stdio fixture</title>");
await server.connect(new StdioServerTransport());
`;

async function fixture(t, { large = false, wait = false } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "xskin-stdio-中文 🌙 "));
  const file = path.join(directory, "original.mp4");
  const auditPath = path.join(directory, "events.jsonl");
  const executable = path.join(directory, "fixture.mjs");
  const originalHash = createHash("sha256");
  const content = Buffer.alloc(chunkBytes);
  for (let i = 0; i < content.length; i++) content[i] = i % 251;
  const handle = await fs.open(file, "wx", 0o600);
  try {
    for (let i = 0; i < (large ? 192 : 1); i++) {
      await handle.writeFile(content);
      originalHash.update(content);
    }
    await handle.writeFile(content.subarray(0, 17));
    originalHash.update(content.subarray(0, 17));
  } finally { await handle.close(); }
  await fs.writeFile(executable, fixtureSource);
  const client = new Client({ name: "xskin-large-media-stdio-fixture", version: "1.0.0" });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [executable, file, auditPath, wait ? "wait" : "read"],
    stderr: "pipe", maxBufferSize: 1024 * 1024 });
  let stderr = "";
  transport.stderr.on("data", chunk => { stderr += chunk; });
  t.after(async () => {
    await client.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  await client.connect(transport);
  const pid = transport.pid;
  const events = async () => (await fs.readFile(auditPath, "utf8")).trim().split("\n")
    .filter(Boolean).map(line => JSON.parse(line)).filter(event => event.pid === pid);
  const waitFor = async predicate => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await events()).some(predicate)) return;
      await delay(10);
    }
    assert.fail("The actual stdio child did not finish its expected lifecycle event");
  };
  const close = async () => {
    await client.close();
    await waitFor(event => event.event === "exit");
    const receipt = await events();
    assert.deepEqual(receipt.find(event => event.event === "closed"), {
      pid, event: "closed", descriptorClosed: true, waiting: 0,
    });
    assert.deepEqual(receipt.find(event => event.event === "exit"), { pid, event: "exit", code: 0 });
    assert.equal(stderr, "", "Stdio diagnostics must stay clean");
    return receipt;
  };
  return { client, events, waitFor, close, originalHash: originalHash.digest("hex"),
    total: (large ? 96 * 1024 * 1024 : chunkBytes) + 17 };
}

test("96 MiB media crosses real stdio in bounded private frames with its exact original bytes", { timeout: 30000 }, async t => {
  const { client, total, originalHash, close } = await fixture(t, { large: true });
  const { tools } = await client.listTools();
  const tool = tools.find(value => value.name === "xskin_read_media");
  assert.ok(tool);
  assert.deepEqual(tool._meta.ui.visibility, ["app"]);
  assert.equal(tool.annotations.readOnlyHint, true);
  const received = createHash("sha256");
  let offset = 0;
  while (offset < total) {
    const result = await client.callTool({ name: "xskin_read_media", arguments: { mediaId, offset } });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent, undefined, "Private media must not become model-visible structured content");
    const media = result._meta[mediaMeta];
    assert.equal(media.offset, offset);
    assert.equal(media.total, total);
    assert.equal(media.mimeType, "video/mp4");
    const bytes = Buffer.from(media.data, "base64");
    assert.equal(bytes.length, Math.min(chunkBytes, total - offset));
    assert.equal(bytes.toString("base64"), media.data);
    assert.equal(JSON.stringify(result.content).includes(media.data.slice(0, 100)), false);
    received.update(bytes);
    offset += bytes.length;
  }
  assert.equal(offset, total);
  assert.equal(received.digest("hex"), originalHash, "The source MP4 bytes must not be transcoded or corrupted");
  const receipt = await close();
  assert.equal(receipt.filter(event => event.event === "read").length, 193);
  const frames = receipt.filter(event => event.event === "frame");
  assert.ok(frames.length >= 194);
  assert.ok(frames.every(event => event.bytes < 1024 * 1024), "Every actual stdout write stays below 1 MiB");
});

test("stdio media rejects foreign capabilities and malformed offsets without exposing bytes", { timeout: 10000 }, async t => {
  const { client, events, close, total } = await fixture(t);
  const malformed = [
    { mediaId: "../private-file", offset: 0 }, { mediaId, offset: -1 },
    { mediaId, offset: .5 }, { mediaId, offset: "0" }, { mediaId, offset: null },
    { mediaId, offset: 0, path: "/private/fixture" },
  ];
  for (const args of malformed) {
    const result = await client.callTool({ name: "xskin_read_media", arguments: args });
    assert.equal(result.isError, true);
    assert.equal(result._meta?.[mediaMeta], undefined);
  }
  assert.equal((await events()).filter(event => event.event === "read").length, 0,
    "Schema-invalid requests must stop before the local file reader");
  for (const args of [{ mediaId: "b".repeat(64), offset: 0 }, { mediaId, offset: total }]) {
    const result = await client.callTool({ name: "xskin_read_media", arguments: args });
    assert.equal(result.isError, true);
    assert.equal(result._meta?.[mediaMeta], undefined);
    assert.doesNotMatch(JSON.stringify(result), /\/private\/|original\.mp4|Fixture media/);
  }
  const good = await client.callTool({ name: "xskin_read_media", arguments: { mediaId, offset: 0 } });
  assert.equal(good.isError, undefined, "Rejected reads must leave the valid media readable");
  await close();
});

test("cancelling an actual stdio media request reaches its server signal and EOF closes the file", { timeout: 10000 }, async t => {
  const { client, waitFor, close } = await fixture(t, { wait: true });
  const cancellation = new AbortController();
  const pending = client.callTool({ name: "xskin_read_media", arguments: { mediaId, offset: 0 } }, { signal: cancellation.signal });
  const rejected = assert.rejects(pending);
  await waitFor(event => event.event === "waiting");
  cancellation.abort();
  await rejected;
  await waitFor(event => event.event === "cancelled" && event.aborted === true);
  const status = await client.callTool({ name: "xskin_status", arguments: {} });
  assert.equal(status.isError, undefined, "Cancellation must leave the connection usable");
  await close();
});

test("stdin EOF releases a pending stdio media operation and lets the child exit naturally", { timeout: 10000 }, async t => {
  const { client, waitFor, close } = await fixture(t, { wait: true });
  const pending = client.callTool({ name: "xskin_read_media", arguments: { mediaId, offset: 0 } });
  const rejected = assert.rejects(pending);
  await waitFor(event => event.event === "waiting");
  await close();
  await rejected;
});
