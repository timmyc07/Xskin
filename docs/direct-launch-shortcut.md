# Codex (Xskin) 1.8.0: migration and validation

Source baseline: `945b90f` on `codex/fix-windows-startup-overlay`. Work branch: `codex/direct-launch-shortcut`. Updated 2026-10-22, Asia/Taipei. This source version is not a published release.

## Authorization boundary

Reviewed official sources on 2026-10-22:

- [OpenAI Terms of Use, outside EEA/Switzerland/UK](https://openai.com/policies/row-terms-of-use/): restrictions include modifying services, reverse engineering and bypassing protections. The applicable agreement depends on the user's account/location; this is not a legal determination.
- [Official app appearance settings](https://learn.chatgpt.com/docs/reference/settings): built-in themes, colors and fonts are documented.
- [Official plugin quickstart](https://developers.openai.com/plugins/quickstart): skills and MCP tools are documented extension mechanisms.

These sources do **not establish permission for Xskin's CDP/CSS/DOM background injection**. That authorization remains **unconfirmed**. A working shortcut, loopback checks and unchanged official files do not establish compliance. No official authorization or compliance guarantee is claimed.

This change only manages Xskin's entry points, local runtime and existing background connection. No additional official-app analysis was performed. It does not modify official bundles, WindowsApps, app.asar, signatures, Electron fuses, authentication, API keys, base URLs or quota protections. It adds no process injection or official-launch interception. The separate Xskin shortcut explicitly invokes OS application activation.

## Behavior and migration

- Fully exit ordinary Codex, then use **Codex (Xskin)**. Windows creates Desktop/Start links to its managed `xskin-quiet.exe start -StateRoot <actual-root>`; macOS creates `~/Applications/Codex (Xskin).app`. Pin through normal system UI.
- Each cold start requests official activation once. Repeated Windows clicks reuse the verified injector; macOS serializes clicks and activates the existing verified app. Ordinary unconnected sessions are left running with manual-exit guidance. Startup failures do not close/reopen Codex.
- Paused or disabled shortcut backgrounds open ordinary Codex without clearing pause. Explicit Apply/Resume is required to restore a skin. A separate explicit full Restore may ask to close/reopen Codex.
- Login does not launch Codex or a monitor. The shortcuts work without the Xskin panel. Migration removes only matching legacy tasks/LaunchAgents/Startup links. Foreign same-name shortcuts are preserved or cause setup to fail before replacing them.
- Windows carries physical Unicode/custom StateRoot in the shortcut and retains a per-user locator before retiring the task. Managed engines also resolve their own store. MSIX storage is resolved from an existing file handle. The locator contains only a path, no account data.
- Windows runtime upgrade stops verified injector pipe holders before the legacy monitor. The new quiet launcher waits for its direct PowerShell process without the infinite wait's stream-reader join, and cancels readers afterwards. Live grandchildren may keep their streams but cannot hold the launcher open. No global Node shutdown or added arbitrary delay is used.
- Engine swaps retain bundled Node, theme media, preferences and pause; failed swaps restore and resume the prior runtime. Codex stays open during upgrade. macOS also restores historical managed Dock entries during migration; new setup does not replace official pins automatically.

The earlier Windows overlay fixes remain intact and are now shared with macOS: draft conversation ID resolution, stable serialized installation tokens, task lifecycle fan timing, incremental long-log recovery, new-file tracking and exact-thread data isolation.

## Actual results

| Check | Result |
| --- | --- |
| macOS full `npm test` | Passed on this Mac after updating its existing Xskin connection to 1.8.0. Includes config preservation, identity checks, overlay, install rollback and three cold-start fixtures. |
| macOS native build | Passed, arm64 1.8.0, local `build/Xskin.app`. |
| macOS doctor/live verification | Passed, official Codex 26.1016.51333; strict official app/runtime signature checks pass. |
| macOS live engine upgrade | Passed without restarting Codex: official process IDs, active theme/media SHA-256 values and language unchanged. No private evidence committed. The local native panel and installed skill/runtime copies are also 1.8.0; their former versions are backed up under ignored build/local-backups. |
| PowerShell parsing | Passed using PowerShell 7 on macOS; does not establish Windows runtime behavior. |
| Windows startup/installer fixtures | Passed under local PowerShell 7 with physical temporary paths. Three cold-start fixtures and repeated, ordinary, paused and failure cases pass. This is not Windows cold-start evidence. |
| Flutter analyze | Passed. |
| Flutter tests on macOS | 5 passed, 1 skipped because its process bridge requires Windows. |
| Windows full runner/package CI | Pending push/Windows CI result; update this row with the actual outcome. |
| Real Windows three cold starts, new login and Store update | Not performed here. The user confirmed that no remote execution connection is available; retain this manual checklist. Requires an interactive Windows session with official Codex installed. |
| Real home/task visual checks | Not completed. Native computer-use access to Codex was denied by tool safety restrictions; no alternative capture/navigation was used to bypass that denial. |
| Physical macOS cold starts | Not performed: current Codex session was preserved. The three-launch result above uses isolated fixtures. |

Windows-only tests include an inherited-stream reproduction with a live Node grandchild, Unicode/emoji/space shortcuts, foreign-name preservation, physical-store selection after task removal, injector identity, retained bundled Node and engine-swap rollback. CI cannot replace interactive login, physical shortcut clicks or Store-update checks.

## Install and restore

Build from this branch; do not assume the older release ZIP contains 1.8.0. Windows: run `Install Xskin.exe` from the complete new package, or its `scripts/install-dream-skin.ps1 -StateRoot <existing-root>`. macOS: build with `macos/scripts/build-native-studio.sh`, then install its runtime with `install-dream-skin-macos.sh --no-launch`. Both retain existing media/preferences. Fully quit ordinary Codex yourself before opening Codex (Xskin).

To stop using the skin, Pause or turn off shortcut backgrounds. Use the official app normally after fully exiting the current session. To uninstall entry points, use the platform Restore command with `-Uninstall` / `--uninstall`; only owned entry points are removed and saved media/preferences remain. Full base-theme restoration uses the existing recoverable appearance-key backup and remains a separately requested action. Preserve the state directory when troubleshooting; do not delete auth.json or account data. Engine transaction backups are retained if a rollback cannot complete safely.

Before declaring the startup change ready, complete the pending physical Windows checks above, inspect home/task on both platforms and obtain an applicable authorization basis for CDP/CSS injection.
