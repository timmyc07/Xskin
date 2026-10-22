# Windows 1.8.1 / macOS 1.8.2: migration and validation

Source baseline: `945b90f` on `codex/fix-windows-startup-overlay`. Windows work: `codex/direct-launch-shortcut`; macOS follow-up: `codex/macos-native-launch`; overlay follow-up: `codex/overlay-layout-transparency`. Updated 2026-10-23, Asia/Taipei for [Windows 1.8.1](https://github.com/timmyc07/Xskin/releases/tag/windows-v1.8.1) and [macOS 1.8.2](https://github.com/timmyc07/Xskin/releases/tag/v1.8.2). The user authorized one automatic graceful reopen on macOS only, retaining its official-app entry; Windows remains shortcut-only without automatic reopen. Physical startup and visual checks below remain pending after publication.

## Authorization boundary

Reviewed official sources on 2026-10-22:

- [OpenAI Terms of Use, outside EEA/Switzerland/UK](https://openai.com/policies/row-terms-of-use/): restrictions include modifying services, reverse engineering and bypassing protections. The applicable agreement depends on the user's account/location; this is not a legal determination.
- [Official app appearance settings](https://learn.chatgpt.com/docs/reference/settings): built-in themes, colors and fonts are documented.
- [Official plugin quickstart](https://developers.openai.com/plugins/quickstart): skills and MCP tools are documented extension mechanisms.

These sources do **not establish permission for Xskin's CDP/CSS/DOM background injection**. That authorization remains **unconfirmed**. A working shortcut, loopback checks and unchanged official files do not establish compliance. No official authorization or compliance guarantee is claimed.

This change only manages Xskin's entry points, local runtime and existing background connection. No additional official-app analysis was performed. It does not modify official bundles, WindowsApps, app.asar, signatures, Electron fuses, authentication, API keys, base URLs or quota protections. It adds no process injection or official-launch interception. The separate Xskin shortcut explicitly invokes OS application activation.

## Behavior and migration

- Windows: fully exit ordinary Codex, then use **Codex (Xskin)**. Desktop/Start links target managed `xskin-quiet.exe start -StateRoot <actual-root>`. Each cold start requests official activation once; repeated clicks reuse the verified injector. Ordinary unconnected sessions are left running with manual-exit guidance. Startup failures never close/reopen Codex.
- macOS 1.8.1: open the **official Codex app** as usual. The enabled per-user service observes new ordinary launches and gracefully reopens each once to apply the saved background/overlay. Installation/login leaves an existing session alone. PID/start-time/executable/bundle/path/age checks restrict the quit request to the fresh process; a refused quit is never forced. Queued duplicate and managed-relaunch events are consumed without another handoff, including after failure. The optional `~/Applications/Codex (Xskin).app` starts directly without that reopen. Pin through normal system UI.
- Paused or disabled shortcut backgrounds open ordinary Codex without clearing pause. Explicit Apply/Resume is required to restore a skin. A separate explicit full Restore may ask to close/reopen Codex.
- Windows login does not launch Codex or a monitor. macOS login starts only the verified observer, never Codex itself. Both work without the Xskin panel. Migration manages only matching Xskin tasks/LaunchAgents/Startup links. Foreign same-name shortcuts are preserved or cause setup to fail before replacing them.
- Windows carries physical Unicode/custom StateRoot in the shortcut and retains `%USERPROFILE%\.xskin-state-root.json` outside AppData before retiring the task. Managed engines also resolve their own store. MSIX storage is resolved from an existing file handle. The locator contains only its Xskin owner marker and a path, no account data. [Microsoft documents HKCU/AppData virtualization](https://learn.microsoft.com/en-us/windows/msix/desktop/flexible-virtualization); the locator therefore uses the ordinary user-profile directory, and does not modify package capabilities.
- Windows runtime upgrade stops verified injector pipe holders before the legacy monitor. The new quiet launcher waits for its direct PowerShell process without the infinite wait's stream-reader join, and cancels readers afterwards. Live grandchildren may keep their streams but cannot hold the launcher open. No global Node shutdown or added arbitrary delay is used.
- Engine swaps retain bundled Node, theme media, preferences and pause; failed swaps restore and resume the prior runtime. Codex stays open during upgrade. macOS also restores historical managed Dock entries during migration; new setup does not replace official pins automatically.

The earlier Windows overlay fixes remain intact and are now shared with macOS: draft conversation ID resolution, stable serialized installation tokens, task lifecycle fan timing, incremental long-log recovery, new-file tracking and exact-thread data isolation.

## Actual results

The table below records the completed 1.8.0 checks. macOS 1.8.1 restores a different startup policy; its follow-up test results and outstanding physical checks are recorded below the table.

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
| Windows full runner/package CI | Passed on Windows Server 2022 / Windows PowerShell 5.1, commit `b5f0455`, including the final MSIX locator revision. Full runner, Flutter analyze, all 6 Flutter tests, release build and package upload passed: [CI run](https://github.com/timmyc07/Xskin/actions/runs/39797483294). |
| Real Windows three cold starts, new login and Store update | Not performed here. The user confirmed that no remote execution connection is available; retain this manual checklist. Requires an interactive Windows session with official Codex installed. |
| Real home/task visual checks | Not completed. Native computer-use access to Codex was denied by tool safety restrictions; no alternative capture/navigation was used to bypass that denial. |
| Physical macOS cold starts | Not performed: current Codex session was preserved. The three-launch result above uses isolated fixtures. |

GitHub reported an Actions Results incident while this work ran; the workflow summary lagged behind execution. Completion was verified from the full job log and its finalized artifact (ID `12434392408`), rather than inferred from the summary badge.

Windows-only tests include an inherited-stream reproduction with a live Node grandchild, Unicode/emoji/space shortcuts, foreign-name preservation, physical-store selection after task removal, injector identity, retained bundled Node and engine-swap rollback. CI cannot replace interactive login, physical shortcut clicks or Store-update checks.

### macOS 1.8.1 follow-up

- Full macOS `npm test` passed, including the unchanged overlay/config/media suite, four-language validation, owned LaunchAgent registration/removal, failed registration, fresh-process identity, duplicate/delayed events, three automatic handoff fixtures, pause retention, declined quit, invalid payload and migration rollback from 1.8.0.
- The final handoff preflight change was separately rechecked with the native-start/pause fixtures. Native arm64 1.8.1 build passed.
- Local 1.8.1 installation passed: the official process, theme/media digest and config bytes stayed unchanged; the native observer is running as one verified helper. Installed panel, engine and skill copies match the new source. Strict official and Xskin bundle signature checks pass. Previous panel/skill copies are retained in ignored `build/local-backups/native-launch-<timestamp>/`.
- Windows source/runtime files are unchanged from `147fc27`; the completed Windows CI above still covers that runtime.
- Three physical macOS official-entry starts with background/overlay visual confirmation remain pending. The passive observer recorded one ordinary official-app launch before this policy was restored, with no new Xskin verification record; this does not count as a successful background cold start. No tool restriction was bypassed to operate or capture Codex.

## Install and restore

The overlay follow-up moves usage above the input, wraps on narrow windows and hides empty Home rows. Composer and native toolbar surfaces reveal the image/video. Full macOS tests/native build and Windows runner/Flutter/package checks passed; [current results and limits](platforms.md#2026-10-23-overlay-layout-validation) supplement the historical startup results above.

Download the matching release and keep the complete old package for rollback. Windows: run `Install Xskin.exe` from the 1.8.1 package, or `scripts/install-dream-skin.ps1 -StateRoot <existing-root>`. macOS: close Xskin and replace Xskin.app with 1.8.2; applying updates the managed runtime. A source install can build with `macos/scripts/build-native-studio.sh`, then run `install-dream-skin-macos.sh --no-launch`. An enabled 1.8.0 preference installs the native observer; disabled/paused preferences remain disabled/paused. Existing Codex stays open. On the next fresh macOS launch, use the official app normally; an ordinary session gracefully reopens once. Both platforms retain existing media/preferences. Fully quit ordinary Codex yourself before using the direct Codex (Xskin) entry.

To stop using the skin, Pause or turn off automatic backgrounds. macOS Pause keeps the observer/preference but its paused state blocks handoffs; explicit Apply resumes. Disable/Restore stops only the owned observer. Use the official app normally after fully exiting the current session. To uninstall entry points, use the platform Restore command with `-Uninstall` / `--uninstall`; only owned entry points are removed and saved media/preferences remain. Full base-theme restoration uses the existing recoverable appearance-key backup and remains a separately requested action. Preserve the state directory when troubleshooting; do not delete auth.json or account data. Engine transaction backups are retained if a rollback cannot complete safely.

For a local macOS rollback to the saved 1.8.0 shortcut policy, disable automatic backgrounds first, install the backed-up skill runtime with `scripts/install-dream-skin-macos.sh --no-launch`, and restore the saved Xskin panel/skill copies while Xskin is closed. Re-enable the 1.8.0 shortcut preference if desired. Retain the state directory and media; rolling back the program does not require restoring account files or quitting the current official app.

The automated checks pass. Before declaring physical startup behavior and authorization confirmed, complete the pending physical Windows checks above, inspect home/task on both platforms and obtain an applicable authorization basis for CDP/CSS injection.
