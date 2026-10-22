# Usage availability and shared surface materials

Unreleased source: macOS 1.8.3 / Windows 1.8.2. Updated 2026-10-23, Asia/Taipei. Published v1.8.2 / windows-v1.8.1 assets are unchanged.

## Changes

| Reported area | Targeted CSS treatment (actual-route coverage pending) |
| --- | --- |
| Plugin, Space/page/slide and Drive headers | Clear primary surfaces, including nested native dark/light/theme scopes |
| Site lists and page wrappers | Clear primary surfaces; retain separators and controls |
| Settings groups | Translucent secondary/raised surfaces |
| Menus, listboxes and dialogs | Stronger tinted material for floating controls, with native geometry and focus behavior |
| Template/document previews and switches | Preserve raster preview content and native control colors |
| Unknown/currently switching task | Hide the usage strip until one local task is identified |
| Waiting for a local usage event | One waiting label; no empty cache meter or row of dashes |
| Host heartbeat missing | Reconnecting label; do not present stale numbers as live |

The restart report exposed a gap in the initial implementation: it remapped web `--bg-*` / `--main-surface-*` colors but omitted the native `--color-surface*` family. The original fixture used only web colors and could pass while native headers remained opaque. The follow-up maps native surfaces to the same palette, explicitly clears the native utility header and its `::before` / `::after` paint/blur, and clears structural focus-area/settings containers. Controls and document images retain their own paint.

Verify now reports the actual loaded stylesheet revision, checks it against the source CSS hash, and checks visible known utility headers and their pseudo layers. `utilityHeaderNotPresent: true` means that route was **not covered**; an overall pass on a task page does not establish that Space/Plugin headers are fixed. The check returns material properties only, without page text or program source.

Surface colors use the existing Xskin palette and mask. Only scoped CSS variables/materials change; there is no new per-message scan, image/video processing or launch behavior. Dot is excluded from the new shared surface rules. Removing the skin class/style through Pause restores native materials.

The source reader previously recovered only task lifecycle before its initial 1 MiB tail. A valid earlier token event could therefore remain unavailable after reopening a long task. Reverse recovery now finds the newest valid usage, limits and lifecycle independently while preserving newer records, reading at most 1 MiB per operation. Once attached, unchanged heartbeats do not reread history; large appends inspect only the new range plus a bounded overlap. Lifecycle timestamps are not used to reject a first historical token sample.

## Validation

- Reproduced the missing-usage failure before the fix: a valid token event followed by more than 2 MiB of tool output and a lifecycle event returned no total. The added regression now passes, including large appends, rate-only updates, explicit quota clearing and unchanged-heartbeat read counts.
- macOS and Windows overlay/reader/host-bridge regressions pass. They retain exact-thread isolation, out-of-order token rejection, stable subscriptions, lifecycle fan behavior, UTF-8 paths and new-file tracking.
- A real browser rendered the actual stylesheet against [the public fixture](../macos/tests/fixtures/surface-materials.html): native/Work × dark/light, excluded Dot, and disabled skin all pass 21 checks each after adding the native surface family, settings container and header pseudo layers. The previous stylesheet fails eight of the added checks. Native and Work dark at 320 px also pass, with no horizontal overflow. Real clicks reach the menu item and switch. The fixture contains sample data only.
- The fixture proves the CSS contract for the listed semantic surfaces; it does not prove every current official route uses those variables. Complete official-page visual verification remains pending because native computer-use access to Codex was denied. No alternate capture/navigation was used to bypass that restriction.
- Before the native-header follow-up, a local 1.8.3 engine/native-app update passed its current-page self-check for Codex, Work and Dot without restarting Codex. The active Codex usage strip reports `ready`; official process identity, selected media/theme digest, config bytes and Xskin language stayed unchanged. Installed engine, native app and skill copies contain the final matching payload. Full macOS tests/native build and eight portable Windows regression files passed.
- Native-header follow-up validation: full macOS tests and arm64 native build pass; all eight portable Windows regression files pass. The browser matrix runs 21 checks in each of eight variants (168 checks total), including native/Work at 320 px. The local app, engine and skill contain matching corrected CSS/host files. Process/theme/config/language preservation checks all pass. The current task-page self-check reports the expected CSS revision, but no visible utility header; the reported Space page is therefore **not verified**. A fresh direct computer-use attempt was rejected for `com.openai.codex` on safety grounds; no alternate capture/navigation was used.
- The first full macOS run reached its final live doctor check while the engine still held the previous CSS and returned exit 2. After the managed update and stylesheet-match check, the entire suite was rerun successfully; the failed run was not treated as a pass.
- Native-header [Windows CI](https://github.com/timmyc07/Xskin/actions/runs/39835142751) passed at `8bf562d`: the full Windows runner, Flutter analysis, all six Flutter tests, release build and artifact upload succeeded on Windows Server 2022 / PowerShell 5.1. Artifact `12450887363` contains `Xskin-1.8.2-windows-x64.zip`; the outer artifact SHA-256 is `e404c273108660058d8d3e4274dbe26ae6db6fdf385c5e79840ddafa3c74e965`. This remains an unreleased CI package and does not establish physical cold-start or visual-page validation.
- Historical [Windows CI](https://github.com/timmyc07/Xskin/actions/runs/39829869364) passed at runtime commit `5a15d8e`: the full Windows runner, Flutter analysis, all 6 tests, release build and artifact upload succeeded on Windows Server 2022 / PowerShell 5.1. The package is `Xskin-1.8.2-windows-x64.zip`, artifact ID `12448746559`. This is an unreleased CI package, not a replacement for the public release assets.
- Windows physical cold starts, new login and Store updates remain pending; no Windows execution connection is available. Complete official-page visual validation is also still pending as described above.

## Reference and recovery

The native-header follow-up also searched the public [upstream Dream Skin CSS](https://github.com/Fei-Away/Codex-Dream-Skin/blob/6fc42df48a6a5365011f55cc349e20c038e56d1d/runtime/dream-skin.css) and [CodexPlusPlus header anchors](https://github.com/BigPizzaV3/CodexPlusPlus/blob/a92fd7002f470d7d108eb198587d03591f5f3155/assets/inject/renderer-inject/00-prelude.js). These identify the native color family and structural anchors; they do not prove every current official route uses them. No official application files were opened for analysis.

Before implementation, searched the public [codex-token-overlay](https://github.com/soleillevant0125/codex-token-overlay) reader and [Catppuccin ChatGPT userstyle](https://github.com/catppuccin/userstyles/blob/78caa053c497df46f6f3e123b7c8ec65936d2899/styles/chatgpt/catppuccin.user.less) semantic colors. The implementation reuses Xskin's own bounded reader and CSS palette; no dependency or official-program analysis was added.

An engine update keeps the official app running and preserves the selected media, opacity, language and pause preference. Retain the prior Xskin app/runtime before updating. To revert, disable automatic backgrounds, close Xskin and install the saved Xskin package/runtime while retaining its data directory. This does not require restoring account files. [Full recovery and authorization status](direct-launch-shortcut.md#install-and-restore).

CDP/CSS authorization remains unconfirmed. Unchanged official files and successful styling checks do not establish permission or a compliance guarantee.
