import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { Client, InMemoryTransport, SdkError, SdkErrorCode } from "@modelcontextprotocol/client";
import { createMcpServer, RESOURCE } from "../server.mjs";
import manifest from "../package.json" with { type: "json" };

const selectionId = "11111111-2222-4333-8444-555555555555";
const html = "<!doctype html><title>Xskin fixture</title>";
const state = {
  version: manifest.version, platform: "macos", language: "zh-Hant",
  active: { name: "背景 中文 🌙.png", kind: "image", applied: true,
    previewId: "a".repeat(64), previewMimeType: "image/png" },
  selection: null, maskOpacity: 0.62, autostart: false, needsSetup: false,
};
const argumentsByTool = {
  xskin_open: {}, xskin_status: {}, xskin_choose_media: {},
  xskin_apply: { selectionId }, xskin_mask: { opacity: 0.07 },
  xskin_autostart: { enabled: false }, xskin_pause: {}, xskin_resume: {},
  xskin_set_language: { language: "ja" }, xskin_recover: {},
};

async function fixture(t, overrides = {}) {
  const calls = [];
  let closed = 0;
  const studio = { close: async () => { closed += 1; } };
  for (const method of ["status", "choose", "apply", "mask", "autostart", "pause", "resume", "setLanguage", "recover"]) {
    studio[method] = async (...args) => { calls.push([method, ...args]); return state; };
  }
  Object.assign(studio, overrides);
  const server = createMcpServer(studio, html);
  const client = new Client({ name: "xskin-isolated-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server, calls, get closed() { return closed; } };
}

test("the official global entrypoint opens only the Xskin app resource", async t => {
  const { client } = await fixture(t);
  const implementation = client.getServerVersion();
  assert.equal(implementation.name, "xskin");
  assert.equal(implementation.title, "Xskin");
  assert.equal(implementation.version, manifest.version);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name).sort(), [...Object.keys(argumentsByTool), "xskin_read_media"].sort());
  const open = tools.find(tool => tool.name === "xskin_open");
  assert.equal(open.title, "Xskin");
  assert.equal(open._meta.ui.resourceUri, RESOURCE);
  assert.deepEqual(open._meta["openai/ui"].entrypoints, [{ type: "global" }]);
  assert.deepEqual(open.inputSchema.properties, {});
  assert.equal(open.annotations.readOnlyHint, true);
  assert.equal(open.annotations.openWorldHint, false);
  assert.equal(open.icons[0].mimeType, "image/svg+xml");
  assert.match(open.icons[0].src, /^data:image\/svg\+xml;base64,/);
  assert.equal(tools.find(tool => tool.name === "xskin_recover").annotations.readOnlyHint, false,
    "Recovery is an explicit app-only mutation; ordinary status remains read-only");
  assert.equal(tools.find(tool => tool.name === "xskin_status").annotations.readOnlyHint, true);
  for (const tool of tools) {
    assert.equal(tool.inputSchema.additionalProperties, false, `${tool.name} rejects extra inputs`);
    if (tool !== open) {
      assert.deepEqual(tool._meta.ui.visibility, ["app"]);
      assert.equal(tool._meta.ui.resourceUri, undefined);
      assert.equal(tool._meta["openai/ui"], undefined);
    }
  }
});

test("tool calls return state privately and pass only validated setting values", async t => {
  const { client, calls } = await fixture(t);
  for (const [name, args] of Object.entries(argumentsByTool)) {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, undefined, name);
    assert.deepEqual(result._meta["com.xskin/studio"], state);
    assert.equal(result.structuredContent, undefined);
    assert.deepEqual(result.content, [{ type: "text", text: "Xskin background settings are ready." }]);
    assert.doesNotMatch(JSON.stringify(result.content), /private-preview-token|背景|23456/);
  }
  assert.deepEqual(calls.slice(0, 2), [["status"], ["status"]]);
  assert.equal(calls[2][0], "choose");
  assert.ok(calls[2][1] instanceof AbortSignal);
  assert.deepEqual(calls.slice(3), [
    ["apply", selectionId], ["mask", 0.07], ["autostart", false],
    ["pause"], ["resume"], ["setLanguage", "ja"], ["recover"],
  ]);
  for (const opacity of [0, 1, 0.29]) {
    assert.equal((await client.callTool({ name: "xskin_mask", arguments: { opacity } })).isError, undefined);
    assert.deepEqual(calls.at(-1), ["mask", opacity]);
  }
  for (const language of ["en", "zh-Hant", "zh-Hans", "ja"]) {
    assert.equal((await client.callTool({ name: "xskin_set_language", arguments: { language } })).isError, undefined);
    assert.deepEqual(calls.at(-1), ["setLanguage", language]);
  }
});

test("invalid or unknown tool inputs never reach the local backend", async t => {
  const { client, calls } = await fixture(t);
  const invalid = [
    ["xskin_apply", {}], ["xskin_apply", { selectionId: "../private-file" }],
    ["xskin_apply", { selectionId: selectionId.toUpperCase().replace("1111", "AAAA") }],
    ["xskin_mask", {}], ...[-0.01, 1.01, 0.001, "0.5", null].map(opacity => ["xskin_mask", { opacity }]),
    ["xskin_autostart", {}], ["xskin_autostart", { enabled: "true" }],
    ["xskin_set_language", { language: "fr" }],
    ...Object.entries(argumentsByTool).map(([name, args]) => [name, { ...args, path: "/private/fixture" }]),
  ];
  for (const [name, args] of invalid) {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, true, `${name}: ${JSON.stringify(args)}`);
  }
  for (const opacity of [NaN, Infinity, -Infinity]) {
    const result = await client.callTool({ name: "xskin_mask", arguments: { opacity } });
    assert.equal(result.isError, true);
  }
  await assert.rejects(client.callTool({ name: "xskin_execute_command", arguments: { command: "fixture" } }), { name: "ProtocolError" });
  assert.deepEqual(calls, []);
});

test("backend errors expose only a safe code, never private paths or logs", async t => {
  let error = Object.assign(new Error("PRIVATE_STDERR /Users/private/fixture"), { errorCode: "operation_busy" });
  const { client } = await fixture(t, { status: async () => { throw error; } });
  for (const [errorCode, expected] of [
    ["operation_busy", "operation_busy"], ["/Users/private/fixture", "operation_failed"],
    ["UPPERCASE", "operation_failed"], ["x".repeat(51), "operation_failed"], [undefined, "operation_failed"],
  ]) {
    error.errorCode = errorCode;
    const result = await client.callTool({ name: "xskin_status", arguments: {} });
    assert.equal(result.isError, true);
    assert.deepEqual(result._meta, { "com.xskin/error": expected });
    assert.deepEqual(result.content, [{ type: "text", text: "Xskin could not complete the operation." }]);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_STDERR|\/Users\/private/);
    assert.equal(result.structuredContent, undefined);
  }
});

test("the HTML resource permits only Blob previews without network access", async t => {
  const { client } = await fixture(t);
  const { resources } = await client.listResources();
  assert.deepEqual(resources.map(resource => resource.uri), [RESOURCE]);
  const { contents } = await client.readResource({ uri: RESOURCE });
  assert.equal(contents.length, 1);
  assert.equal(contents[0].uri, RESOURCE);
  assert.equal(contents[0].mimeType, "text/html;profile=mcp-app");
  assert.equal(contents[0].text, html);
  assert.deepEqual(contents[0]._meta.ui, {
    prefersBorder: false,
    csp: { connectDomains: [], resourceDomains: ["blob:"], frameDomains: [] },
  });
  for (const uri of ["file:///private/fixture", "ui://xskin/../private", `${RESOURCE}?path=fixture`]) {
    await assert.rejects(client.readResource({ uri }));
  }
});

test("host cancellation reaches only the native chooser's request signal", { timeout: 3000 }, async t => {
  let started;
  const choosing = new Promise(resolve => { started = resolve; });
  let cancelled;
  const cancellation = new Promise(resolve => { cancelled = resolve; });
  const { client } = await fixture(t, {
    choose: signal => new Promise((resolve, reject) => {
      started(signal);
      signal.addEventListener("abort", () => {
        cancelled();
        reject(Object.assign(new Error("Fixture chooser cancelled"), { errorCode: "cancelled" }));
      }, { once: true });
    }),
  });
  const controller = new AbortController();
  const request = client.callTool({ name: "xskin_choose_media", arguments: {} }, { signal: controller.signal });
  // SDK 2.3.1 wraps explicit cancellation in its RequestTimeout error.
  const rejection = assert.rejects(request, error => controller.signal.aborted &&
    error instanceof SdkError && error.code === SdkErrorCode.RequestTimeout &&
    error.message === String(controller.signal.reason));
  const signal = await choosing;
  assert.ok(signal instanceof AbortSignal);
  assert.equal(signal.aborted, false);
  controller.abort();
  await rejection;
  await cancellation;
  assert.equal(signal.aborted, true);
});

test("closing the MCP connection releases the studio preview service", async t => {
  const connection = await fixture(t);
  assert.equal(connection.closed, 0);
  await connection.client.close();
  await setImmediate();
  assert.equal(connection.closed, 1);
  await connection.server.close();
  assert.equal(connection.closed, 1);
});
