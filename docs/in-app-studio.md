# Xskin inside Codex (macOS 1.9.0 candidate)

The updated local plugin adds an official MCP App global entrypoint named **Xskin**. Open it from the left navigation (including **More** when the host places it there), choose an image or MP4, inspect the preview, then select **Apply background**. A separate Xskin window is unnecessary. Native navigation placement is controlled by Codex; this plugin does not alter its menus.

The panel includes four languages, mask depth, automatic startup, Pause and Resume saved background. It shares the native app's existing media, pending import, mask, language and pause state. Video starts paused and releases its preview on hide/close. Mask dragging changes the preview; release or a keyboard change commits it once. Resume restores the saved background while keeping a different pending import.

## Install or update locally

Keep the complete plugin folder together. For a source checkout, the compiled server and UI are included; users need neither npm nor Xcode.

```bash
codex plugin marketplace add /absolute/path/to/Xskin
codex plugin add codex-background-studio@codex-background-studio-local
```

The existing CLI supports these commands (`codex-cli 0.163.0-alpha.11.1` was checked locally). Reload/restart the desktop app if its plugin tools or global navigation have not refreshed. In the Plugins directory, verify that the local Xskin plugin is enabled. Asking to “Open Xskin” invokes the same MCP App. Installing the plugin and opening its panel do not apply settings.

This MCP server requires macOS and local execution. Windows keeps its separate 1.8.4 package and shortcut-only startup. Do not install this macOS launcher as a Windows MCP server.

## Applying without interrupting the current app

Embedded Apply, mask and Resume require an existing verified Xskin background connection. They never open, quit or restart Codex, including rollback and an app-exit race. If the current official session started without that connection, explicitly enable **Apply when official Codex opens**, fully exit Codex and open the official app again. That fresh launch performs the authorized one-time handoff; then return to Xskin and apply the pending import. The optional direct entry also stays ordinary while that preference is disabled or paused. Existing saved media and preferences remain available. The panel cannot create a persistent official custom-background setting; no such supported interface has been established.

On first import the embedded panel prepares the managed engine without enabling automatic startup or rewriting official appearance preferences. An existing enabled preference is retained. Explicitly enabling **Apply when official Codex opens** retains the established macOS behavior: each future fresh ordinary launch gracefully reopens once. Paused/existing sessions are skipped; quits are never forced. Windows never uses that handoff. Opening or importing in this panel alone does not authorize future handoffs.

## Boundaries and privacy

- The launcher reuses Codex's verified signed bundled Node. No official app files or signatures are modified; the plugin cache is managed by the official plugin installer.
- The global tool accepts only `{}`. Setting tools accept strict bounded values or a pending-import UUID, never shell commands or arbitrary paths. Only the native chooser selects a local source file.
- State and preview URLs are returned in private tool `_meta`, not model-visible text. Errors expose a fixed safe code rather than paths or logs.
- A random-port HTTP preview server binds only `127.0.0.1`. It serves only approved current/pending media through random capability URLs; no directory access, uploads, mutations or external origins. MP4 uses bounded byte ranges and retains the original bytes. Host CSP permits only that exact preview origin.
- Closing the connection releases preview streams and cancels its own open file picker. A confirmed apply is allowed to finish its existing atomic transaction; closing the panel is not an apply cancellation.
- The official extension documents support the panel entrypoint, **not** the existing CDP/CSS background mechanism. Authorization for that mechanism remains unconfirmed. Local desktop plugin development also does not imply acceptance into OpenAI's public plugin directory; local MCP submission requires partner approval.

## Development and evidence

```bash
npm ci --prefix plugin --ignore-scripts --no-audit --no-fund
npm run build --prefix plugin
npm test --prefix plugin
cd macos && npm test
```

Commit the reproducible `plugin/dist/` outputs. They include the server, one self-contained HTML file and all bundled dependency licenses/notices; the release excludes node_modules and development tests. Maintainer plugin packaging also requires npm dependencies and Xcode Command Line Tools. Existing native app installation remains a fallback for users who explicitly prefer it.

Dependency versions: MCP server/client **2.3.1**, MCP Apps **2.0.3**, Zod **4.6.7**, esbuild **0.28.2** (locked registry releases). Context7 indexed SDK 2.3.1; its MCP Apps documentation was main and Zod index was 4.6.5, so API contracts were cross-checked against installed 2.0.3/4.6.7 declarations. SDK 2.3.1 cancellation is `context.mcpReq.signal`, verified by a real client/server cancellation test.

Official references: [sidebar apps](https://developers.openai.com/plugins/build/extensions#sidebar-apps), [pinned global-entrypoint specification](https://github.com/openai/mcp-extensions/blob/36f8b38df179144b44d157133bbc5f7c6e353ace/docs/spec.md#global-entrypoint), [MCP App UI](https://developers.openai.com/plugins/build/chatgpt-ui), [plugin packaging](https://developers.openai.com/plugins/build/plugins), [desktop-only submission](https://developers.openai.com/plugins/deploy/desktop-only), [SDK 2.3.1](https://github.com/modelcontextprotocol/typescript-sdk/tree/v2.3.1).

Protocol, backend, preview and UI tests are isolated from customer data. A read-only bundled-server check on this Mac connected and returned existing settings without opening native Xskin. Host **More → Xskin** placement and the complete actual embedded interaction still require desktop acceptance; an isolated browser or protocol test does not establish that result. Official native computer-use access was rejected, so no alternate capture/navigation bypass is used.

## Roll back

Use the official plugin installer to reinstall the previous plugin package; retain the previous native app and the existing data directory. Removing the plugin removes its panel, not the saved engine/media. Pause or disable automatic startup through Xskin before restoring an older engine, then use the retained native app if needed. Never delete the data directory to troubleshoot a panel connection.

If an engine upgrade fails and restores a version older than 1.9.0, its launcher cannot enforce the new existing-connection-only flag. Xskin preserves the restored runtime and reports that its watcher could not safely resume; use explicit Apply to reconnect. It does not risk opening Codex automatically to hide that failure.
