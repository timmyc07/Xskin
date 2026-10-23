import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import * as z from "zod/v4";
import manifest from "./package.json" with { type: "json" };
import { createStudio } from "./studio.mjs";

export const RESOURCE = "ui://xskin/studio.html";
const icon = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="7" fill="#d94255"/><path d="m7 7 10 10M17 7 7 17" stroke="white" stroke-width="3" stroke-linecap="round"/></svg>').toString("base64")}`;
const icons = [{ src: icon, mimeType: "image/svg+xml", sizes: ["any"] }];
const empty = z.strictObject({});

export function createMcpServer(studio, html) {
  const server = new McpServer({ name: "xskin", version: manifest.version, title: "Xskin", icons });
  const execute = operation => async (args, context) => {
    try {
      const state = await operation(args, context);
      return { content: [{ type: "text", text: "Xskin background settings are ready." }],
        _meta: { "com.xskin/studio": state } };
    } catch (error) {
      const code = typeof error.errorCode === "string" && /^[a-z_]{1,50}$/.test(error.errorCode)
        ? error.errorCode : "operation_failed";
      return { isError: true, content: [{ type: "text", text: "Xskin could not complete the operation." }],
        _meta: { "com.xskin/error": code } };
    }
  };
  registerAppTool(server, "xskin_open", {
    title: "Xskin", description: "Open Xskin's background studio inside the app.", icons,
    inputSchema: empty,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: RESOURCE }, "openai/ui": { entrypoints: [{ type: "global" }] } },
  }, execute(() => studio.status()));

  const tool = (name, description, inputSchema, readOnly, operation, idempotent = true) => {
    server.registerTool(name, {
      description, inputSchema,
      annotations: { readOnlyHint: readOnly, destructiveHint: false, idempotentHint: idempotent, openWorldHint: false },
      _meta: { ui: { visibility: ["app"] } },
    }, execute(operation));
  };
  tool("xskin_status", "Refresh the local background studio.", empty, true, () => studio.status());
  tool("xskin_choose_media", "Let the user choose an image or MP4 in the native file picker; prepare a preview only.",
    empty, false, (_args, context) => studio.choose(context.mcpReq.signal), false);
  tool("xskin_apply", "Apply the pending background selected in Xskin.",
    z.strictObject({ selectionId: z.string().regex(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/) }),
    false, ({ selectionId }) => studio.apply(selectionId));
  tool("xskin_mask", "Set the full-window background mask.",
    z.strictObject({ opacity: z.number().min(0).max(1).multipleOf(0.01) }), false, ({ opacity }) => studio.mask(opacity));
  tool("xskin_autostart", "Change automatic background application for future official app launches.",
    z.strictObject({ enabled: z.boolean() }), false, ({ enabled }) => studio.autostart(enabled));
  tool("xskin_pause", "Pause the background while preserving saved settings.", empty, false, () => studio.pause());
  tool("xskin_resume", "Resume the saved background without choosing another file.", empty, false, () => studio.resume());
  tool("xskin_set_language", "Change Xskin's saved display language.",
    z.strictObject({ language: z.enum(["en", "zh-Hant", "zh-Hans", "ja"]) }), false, ({ language }) => studio.setLanguage(language));

  registerAppResource(server, "Xskin background studio", RESOURCE, {}, async () => ({
    contents: [{ uri: RESOURCE, mimeType: RESOURCE_MIME_TYPE, text: html,
      _meta: { ui: { prefersBorder: false, csp: { connectDomains: [], resourceDomains: [studio.previewOrigin], frameDomains: [] } } } }],
  }));
  server.server.onclose = () => { studio.close().catch(() => {}); };
  return server;
}

async function main() {
  if (process.argv.length !== 3 || !path.isAbsolute(process.argv[2])) throw new Error("Invalid runtime");
  const html = await fs.readFile(new URL("./studio.html", import.meta.url), "utf8");
  const studio = await createStudio(process.argv[2]);
  const server = createMcpServer(studio, html);
  const close = () => server.close().finally(() => studio.close()).catch(() => { process.exitCode = 1; });
  process.once("SIGTERM", close);
  process.once("SIGINT", close);
  try { await server.connect(new StdioServerTransport()); }
  catch (error) { await studio.close(); throw error; }
}

const entry = process.argv[1] ? await fs.realpath(process.argv[1]).catch(() => null) : null;
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch(() => { console.error("Xskin's embedded studio could not start."); process.exitCode = 1; });
}
