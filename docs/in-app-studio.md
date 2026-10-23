# Xskin inside Codex (macOS 1.9.3)

The updated local plugin adds an official MCP App global entrypoint named **Xskin**. Open it from the left navigation (including **More** when the host places it there), choose an image or MP4, inspect the preview, then select **Apply background**. A separate Xskin window is unnecessary. Native navigation placement is controlled by Codex; this plugin does not alter its menus.

The panel includes four languages, mask depth, automatic startup, Pause and Resume saved background. It shares the native app's existing media, pending import, mask, language and pause state. Video previews start paused; the applied decorative background is muted and loops only while visible and Reduce Motion is off. Hiding or closing stops background playback and releases video previews. Mask dragging changes the preview; release or a keyboard change commits it once. Resume restores the saved background while keeping a different pending import.

The applied original image/video is rendered inside Xskin's own iframe, above an opaque host canvas. This does not make the outer host surface transparent. Pending media appears only in Preview until Apply succeeds. Identical active and preview media share a Blob; differing media use at most two Blobs. The entire interactive area scrolls within a bounded viewport above the host composer, rather than adding padding only after the final setting. It reserves the reported bottom safe area, with a 96px fallback when absent or zero; a 148px inset reserves the full 148px. The host input remains present and unchanged. Language uses a compact native selector beside its label in a separate settings row, so it remains usable during first setup. Controls follow host light/dark colors; the closed selector uses matching spacing and a CSS chevron, while its keyboard and popup behavior remain native.

Version 1.9.3 expands Preview to the section's full width at 16:9, with the complete media contained inside it. This changes display geometry, not media resolution, frame rate or encoding. Background settings has a heading above its card, and long labels and filenames wrap inside their own containers. Progress and errors appear immediately below the preview actions. Import errors distinguish supported size/format/access failures when the backend supplies that code; the user confirmed that the previously failing approximately 80 MB MP4 now shows its filename and preview in local 1.9.3. The previous failure's exact cause was not established; this confirmation does not establish sustained playback or a new Apply result for that file.

Use **Refresh** to reload current settings. If an interrupted change needs recovery, use the explicit **Recover interrupted change** action before editing further; read-only Refresh does not change saved settings. Cancelling the native chooser retains the saved background and previous pending import. A missing preview does not discard a completed import or block Apply. Original filenames remain visible instead of internal import UUIDs. If a tool connection times out or is lost, the panel refreshes once and offers a status retry rather than automatically repeating a change whose result is uncertain.

## Install or update locally

Download the [macOS plugin 1.9.3 ZIP](https://github.com/timmyc07/Xskin/releases/download/v1.9.3/xskin-plugin-v1.9.3.zip), extract it and keep the complete plugin folder together. The [macOS release page](https://github.com/timmyc07/Xskin/releases/tag/v1.9.3) includes the standalone app and checksums. For a source checkout, the compiled server and UI are included; users need neither npm nor Xcode.

```bash
codex plugin marketplace add /absolute/path/to/Xskin
codex plugin add codex-background-studio@codex-background-studio-local
```

The existing CLI supports these commands (`codex-cli 0.163.0-alpha.11.1` was checked locally). Reload/restart the desktop app if its plugin tools or global navigation have not refreshed. In the Plugins directory, verify that the local Xskin plugin is enabled. Asking to “Open Xskin” invokes the same MCP App. Installing the plugin and opening its panel do not apply settings.

The companion Windows 1.8.5 package joins the usage strip to the composer’s upper corners and includes it inside the composer layout; its startup remains shortcut-only and it has no in-app studio.

This MCP server requires macOS and local execution. Windows keeps its separate 1.8.5 package and shortcut-only startup. Do not install this macOS launcher as a Windows MCP server.

### Installed plugin, but no Xskin navigation entry

The first 1.9.0 candidate could appear in Plugins with its skill while its MCP server was skipped: its portable `command` used the absolute `/bin/bash` path. Agent Plugins 1.0.0 requires a bare executable or a contained `./` command, and a packaged executable must use the latter. The corrected declaration launches `./plugin/launch-macos.sh` directly, using its existing shebang and executable permission. No extra `apps` mapping or native-menu changes are needed.

The regression executes the actual `mcp.json` declaration in a Unicode/emoji/spaces package path, rather than bypassing it with a separately constructed shell command. Earlier 1.9.0 CLI diagnostics with Codex 0.163.0-alpha.11.1 recognized `mcpServers: ["xskin"]`, connected its server and discovered its tools, UI resource and global entrypoint metadata. Version 1.9.3 declares eleven tools, including app-only media reading and explicit recovery. The user has since confirmed that More → Xskin opens; CLI discovery alone did not establish that result or complete background-changing acceptance. Reinstall the complete updated package and reload the plugin host to load its changed server and versioned UI resource.

Sources: [Agent Plugins 1.0.0 command rules](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md#721-discovery-and-configuration), [Codex 0.163.0 parser](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/codex-mcp/src/agent_plugin_config.rs#L165-L175).

## Applying without interrupting the current app

Embedded Apply, mask and Resume require an existing verified Xskin background connection. They never open, quit or restart Codex, including rollback and an app-exit race. If the current official session started without that connection, explicitly enable **Apply when official Codex opens**, fully exit Codex and open the official app again. That fresh launch performs the authorized one-time handoff; then return to Xskin and apply the pending import. The optional direct entry also stays ordinary while that preference is disabled or paused. Existing saved media and preferences remain available. The panel cannot create a persistent official custom-background setting; no such supported interface has been established.

On first import the embedded panel prepares the managed engine without enabling automatic startup or rewriting official appearance preferences. An existing enabled preference is retained. Explicitly enabling **Apply when official Codex opens** retains the established macOS behavior: each future fresh ordinary launch gracefully reopens once. Paused/existing sessions are skipped; quits are never forced. Windows never uses that handoff. Opening or importing in this panel alone does not authorize future handoffs.

## Boundaries and privacy

- The launcher reuses Codex's verified signed bundled Node. No official app files or signatures are modified; the plugin cache is managed by the official plugin installer.
- The global tool accepts only `{}`. Setting tools accept strict bounded values or a pending-import UUID, never shell commands or arbitrary paths. Only the native chooser selects a local source file. The app-only recovery tool also accepts only `{}` and reuses the existing recovery transaction.
- State, preview capabilities and media chunks are returned in private tool `_meta`, not model-visible text. Errors expose a fixed safe code rather than paths or logs.
- Preview transfer uses the app-only `xskin_read_media` tool: a private session capability identifies approved current/pending media, and each read returns at most **512 KiB**. The panel assembles a local **Blob** without opening an HTTP preview port. Each chunk rechecks file identity; replacement, expired capabilities and cross-session access fail. CSP allows Blob media and no external media/connect origin. Original MP4 bytes are retained; the 256 MiB video limit is unchanged.
- Original resolution/frame rate and the checked **4K60** file are preserved without transcoding. The own-video diagnostic reports total/dropped frames without altering playback. A 5.48-second local Codex/Dot sample measured approximately 59.1 presented FPS and zero additional dropped frames at 3840×2160. This short sample does not establish sustained playback or display scan-out quality. The applied background uses the approved original media, not a thumbnail or re-encoded preview.
- Hiding the panel cancels unfinished preview reads and releases its video preview. Reselection and close release the previous Blob URL. Closing the connection revokes its capabilities and cancels its own open file picker. A confirmed apply is allowed to finish its existing atomic transaction; closing the panel is not an apply cancellation. Only confirmed Apply/mask calls omit the adapter's shorter outer process timeout, preserving the backend's separately bounded forward and rollback deadlines; other command limits remain in place.
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

Protocol, backend, preview and UI tests are isolated from customer data. Targeted backend regressions cover original Chinese/emoji filenames, a 96 MiB sparse MP4 import, retained pending selections, invalid old selection IDs and rollback; the sparse fixture proves bounded import/state handling, not video decoding. A proportionally shortened transaction regression reproduces the old adapter timeout interrupting rollback and checks that the new adapter waits for restoration.

A read-only bundled-server check on this Mac connected and returned existing settings without opening native Xskin. On 2026-10-23 the user confirmed **More → Xskin**, video preview and Apply in **1.9.1**, background/controls in **1.9.2**, and that the previously failing approximately **80 MB MP4 shows its filename and preview in local 1.9.3**. The last result is actual-host import/preview evidence, not confirmation of that file's Apply result, exhaustive route visuals, physical cold starts or sustained FPS. The previous failure's exact cause was not established.

The 1.9.3 own-browser fixture uses separate origins, Blob-only media CSP, an opaque `#181818` canvas and a fixed 148px sample composer. **48 Chrome cases** cover 320/600/1280px, four languages, light/dark UI and embedder schemes. Five scroll positions per case (**240 total**) keep the entire scrollport above the composer, with no interactive hits in its reserved region. **Eight additional 320px cases** cover 200% text and a 240-character unbroken filename. Inner container widths and text Range bounds stay inside their cards and controls; full-width 16:9 preview geometry, external settings heading and same-row language alignment pass. A simulated chooser failure appears inside Preview, 18px after its actions. Applied sample images, native select colors, focus, recovery, Pause/Resume and MP4 preview also pass. These are sample-only checks, not screenshots or navigation of the official app.

For 1.9.3, all **53 plugin tests** and the full macOS runner passed. At source head `ff85d35`, [CI](https://github.com/timmyc07/Xskin/actions/runs/39948391600) passed static/plugin checks, Windows PowerShell 5.1/7 runners and macOS backend checks; [Windows Flutter/package CI](https://github.com/timmyc07/Xskin/actions/runs/39948391587) is still pending at this documentation update. The final documentation commit must also pass publication checks. Earlier `2952710` workflows are separate evidence. macOS physical cold starts, complete Home/task inspection and sustained playback remain pending, as do Windows physical cold starts, login/Store updates and route visuals. Official native computer-use access was rejected, so no alternate capture/navigation bypass is used.

## Roll back

Use the official plugin installer to reinstall the previous plugin package; retain the previous native app and the existing data directory. Removing the plugin removes its panel, not the saved engine/media. Pause or disable automatic startup through Xskin before restoring an older engine, then use the retained native app if needed. Never delete the data directory to troubleshoot a panel connection.

If an engine upgrade fails and restores a version older than 1.9.0, its launcher cannot enforce the new existing-connection-only flag. Xskin preserves the restored runtime and reports that its watcher could not safely resume; use explicit Apply to reconnect. It does not risk opening Codex automatically to hide that failure.

## Composer spacing follow-up

The macOS 1.9.3 / Windows 1.8.5 packages remove the usage strip’s bottom gap and extend its lower edge around the input’s upper corners. A single decorative pseudo-element paints only the two corner cutouts; its center stays transparent and it ignores pointer events. The existing 22px composer radius is shared by a CSS token. The existing row now sits immediately before the composer body with the same parent, inside the enclosing composer layout, including nested wrappers. Toolbar order, normal flow, stable subscriptions, Home hiding and disposal are retained. This adds no runtime observer, polling, forced scroll or extra wrapper.

The [self-owned browser fixture](../macos/tests/fixtures/composer-reservation.html) models a host reserving footer height from a real ResizeObserver on that enclosing layout. **16 Chrome cases passed** across 320/900px widths, nested/flat wrappers, toolbar above/below, and old/new placement. Old placement omitted approximately 73px/31px of added height; new placement included it. Skin removal restored the original reserve, and applying/removing the skin retained the position of a reader away from the bottom. This proves the fixture's measurement contract, not the official app's internal measurement or actual task-page acceptance.
