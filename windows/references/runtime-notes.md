# Runtime notes

- 1.8.5 candidate removes the overlay/composer gap and fills only the outside of the input’s upper corners with a non-interactive decorative layer. The center stays transparent; no extra DOM, observers or layout reads are added. Windows remains shortcut-only without automatic close/reopen; physical cold-start and route checks remain pending.

- 1.8.4 shares same-session plan retention and cache-write availability semantics with macOS. Plans are the conversation's latest valid report, not live account information. A source-reported zero cache-write count is unconfirmed with its value explained in the tooltip; missing fields never become zero. The reader does not infer a plan from quota or writes from uncached input, and it adds no credential access. See https://github.com/timmyc07/Xskin/blob/windows-v1.8.4/docs/usage-fields.md for pinned public-source evidence and pending physical checks.

- Reliability update: elapsed-time heartbeats survive clock rollback; repeated renderer probe/push failures reconnect only the Xskin socket. Failed reads and unacknowledged deliveries remain retryable. Thread guards, file limits and lifecycle fan behavior are retained.

- Final release review removes duplicate parsed-tail reads while retaining first-line overlap and bounded buffers. Expected CSS revision matching runs inside the verification deadline, so a transient old stylesheet cannot finish verification early.


- Native-header follow-up: web `--bg-*` tokens do not cover native `--color-surface*` paint. Map both families, clear utility-header pseudo paint/blur and structural settings containers, and keep control/image colors. Verify reports the loaded CSS hash and visible header coverage; an absent header is untested, not proof of transparency. Official route visual checks remain pending.


- 1.8.2 shares bounded long-tail recovery and explicit waiting/reconnecting states with macOS. Composer remounts trigger one immediate resubscription while subsequent serialized polls stay stable.
- Shared native/Work semantic materials cover page headers/lists, settings and portal menus, including nested theme scopes. Dot, native control colors and document thumbnails remain isolated; Pause removes the scoped rules. Windows startup remains shortcut-only.

- 1.8.1 places usage before the native composer in normal flow and hides empty Home rows. Translucent composer/home-toolbar materials preserve native geometry and keep footer controls clear, including on narrow windows. Startup remains shortcut-only without automatic reopen.

- The skin discovers the current `OpenAI.Codex` package on every run, requires a non-development `Store` signature kind, and launches its `ChatGPT.exe` with an explicit `--remote-debugging-address=127.0.0.1` and selected port.
- Node.js 22 or newer is required for the built-in WebSocket client. The runtime's real `process.execPath` and version are recorded in state, even when PATH points at a shim.
- The preferred port is `9335`; the default launcher scans up to 100 ports when it is occupied. An explicit occupied port is rejected.
- CDP is accepted only when its listener PID resolves to the exact Store `ChatGPT.exe`, every WebSocket URL is loopback and same-port, `/json/version` exposes a valid Browser ID, and the renderer has expected Codex shell markers.
- Loopback prevents access from the LAN, but CDP does not authenticate other processes running as the same Windows user. Treat the themed session as a local debugging session, run only trusted local software, and restore when it is no longer needed.
- The injector keeps the original Browser WebSocket open as an identity anchor. It reinjects after renderer loads while that anchor remains alive, but exits instead of attaching when the browser closes or the port is reused. Target failures use capped exponential backoff and rate-limited logging.
- `%LOCALAPPDATA%\CodexDreamSkin\state.json` records the Browser ID, registered Appx full/family names, port, injector and Node paths, PID, and process start time. Schema 3 cleanup requires all recorded process identity fields to match. Legacy state lacks some fields and is stopped only when the PID still exposes `node.exe`, the exact injector script, watch mode, and saved port; otherwise the state is moved to `state.stale-*.json` without stopping the process.
- Restore does not require Node to remain installed: it preflights config backups, closes Codex to clear live DOM and CDP, stops only the verified recorded injector, applies requested config changes, then reopens the official app without debug flags.
- A live recorded injector whose PID no longer matches the saved Node path, injector command line, port, Browser ID, or start time causes start/restore to abort with state preserved; it is never silently archived and replaced.
- The managed theme root rejects junctions and symbolic links before initialization, import, save, switch, pause, or state writes. Windows uses the bundled Node image-metadata helper to enforce the same 16 MB, 16384px, and 50MP limits before an import is copied.
- `config.toml` is read from raw bytes as strict UTF-8, written without BOM through same-directory atomic replacement, and backed up byte-for-byte. Install leaves an open Codex running; writes stage the temporary file first, then abort if the destination bytes changed immediately before replacement. Quoted keys and table-header comments are supported; escaped target keys, multiline strings/arrays, dotted target keys, or duplicate target keys fail before writing. Completed restore backups are retained as `config.restored-*.toml` so reinstall captures a fresh baseline.
- A per-user named mutex prevents concurrent install, start, restore, and verify operations from racing state, ports, or config writes.
- Store updates are supported because the launcher queries `Get-AppxPackage OpenAI.Codex` on every launch. State paths are eligible for automatic cleanup only after their Appx full name, family name, install root, and executable are matched against a currently registered package; an active unverified old path requires manual closure.

- 1.8.0: Desktop/Start `Codex (Xskin)` links target the managed quiet launcher with explicit physical StateRoot, no restart or resume flags. Store identity is rediscovered at launch. Existing ordinary sessions fail without closing; repeat clicks reuse a verified injector. Paused/disabled links activate ordinary Codex and preserve pause.
- Legacy tasks are removal-only, validated by action, arguments, working directory, principal and trigger. The physical store locator is persisted in `%USERPROFILE%\.xskin-state-root.json` outside AppData before removal; managed engines resolve their own store without the old task. Foreign same-name links are preserved.
- Upgrade stops verified injector pipe holders before stopping a legacy monitor. The new host uses finite process exit waiting and cancels its async stream readers, so grandchildren cannot keep it alive. Node bytes, media, preferences and current Codex survive updates; swap rollback resumes the prior injector.
- CDP/CSS authorization is unconfirmed; see https://github.com/timmyc07/Xskin/blob/windows-v1.8.1/docs/direct-launch-shortcut.md. Do not infer permission from loopback or unchanged official files.
