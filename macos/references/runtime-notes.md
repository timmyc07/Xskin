# Runtime notes

- Discover the official `com.openai.codex` bundle on every launch; do not assume an upgrade keeps the same executable internals.
- Use `Contents/Resources/cua_node/bin/node` from that bundle. Require Node.js 20+, a valid strict code signature, matching architecture, and OpenAI Team ID `2DC432GLL2` on both app and runtime.
- Do not ship a Node binary and do not depend on a globally installed `node` or `npm`.
- Launch the official app once through LaunchServices (`open -na`) with loopback CDP flags. Never retry by closing/reopening it when CDP readiness or verification fails.
- Prefer port `9341`; scan through `9441` on collision and record the selected port in state.
- Accept CDP only when the listener belongs to the discovered Codex main process or one of its legitimate descendants, the WebSocket URL is loopback-only, and an `app://` renderer exposes expected native shell markers.
- Treat loopback CDP as locally privileged but unauthenticated. Keep the themed session limited to trusted local use and close the port through a full Restore when finished.
- Poll page targets and reinject after document loads. A debounced mutation observer plus a low-frequency safety timer handles in-page route changes.
- Record injector PID, start time, executable, script path, app identity, selected port, and theme directory. Refuse to stop a PID when any required identity differs.
- Store mutable data under `~/Library/Application Support/CodexDreamSkinStudio`; keep the installed program under `~/.codex/codex-dream-skin-studio`.
- Back up and restore only `appearanceTheme` and `appearanceDarkCodeThemeId`. Leave `appearanceDarkChromeTheme` and unrelated TOML content untouched.
- Never modify, replace, unpack, repack, re-sign, or back up `app.asar`.

- 1.8.1 restores macOS official-app launches by explicit user choice. Its owned LaunchAgent observes new native launches and gracefully reopens each ordinary session once. The exact fresh PID/start time/executable/bundle/path/age are checked; the native helper only requests normal termination of that process. Refused quits are not forced, and managed relaunches/duplicate events cannot cause retry loops. Installation/login skips existing sessions.
- Pause retains the enabled service/preference and skips new launches until explicit Apply. Disable/Restore removes only the owned service. The optional ~/Applications/Codex (Xskin).app still starts directly without a reopen; direct clicks, automatic handoffs and Pause share its lock. Windows remains 1.8.0 shortcut-only with no automatic close/reopen.
- Upgrades migrate an enabled 1.8.0 shortcut preference into the native-launch service while retaining disabled/paused settings and saved media. A failed migration stops any new owned service and restores the previous runtime/service. New setup does not edit official apps or Dock pins.
- Replace/remove only a matching Xskin LaunchAgent. The existing shortcut-enabled marker stores the automatic-background preference independently of the paused session. Restore historical managed Dock pins during migration; pin optional direct entries with the normal system UI.
- The shared token reader/overlay includes draft IDs, stable serialized installation tokens, task lifecycle events, incremental long history and session-file creation tracking.
- 1.8.2 puts the usage strip before the native composer in normal flow, hides it on Home and clears pending data when unmounted. Composer/home-toolbar materials reveal the image or video without changing native toolbar geometry; narrow metrics wrap within their available width.
- CDP/CSS authorization remains unconfirmed. Official appearance/plugin documentation does not establish permission for renderer injection; see https://github.com/timmyc07/Xskin/blob/codex/macos-native-launch/docs/direct-launch-shortcut.md.
