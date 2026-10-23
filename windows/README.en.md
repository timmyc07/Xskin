# Xskin for Windows 1.9.4

Windows now mirrors the completed macOS 1.9.4 embedded studio, retained original-media previews, recovery, six presets and official-launch background option. It reuses the Windows Flutter/PowerShell engine. [Parity and validation](../docs/windows-parity.md) · [繁體中文](README.md)

**Download Windows 1.9.4: [standalone](https://github.com/timmyc07/Xskin/releases/download/windows-v1.9.4/Xskin-1.9.4-windows-x64.zip) · [Codex plugin](https://github.com/timmyc07/Xskin/releases/download/windows-v1.9.4/xskin-plugin-v1.9.4-windows-x64.zip) · [Release and SHA-256 checksums](https://github.com/timmyc07/Xskin/releases/tag/windows-v1.9.4#release-assets).** Verify each ZIP against its matching `.zip.sha256` before running it. To install both with a local coding assistant, copy the [AI installation prompt](https://github.com/timmyc07/Xskin#install-with-your-ai).

## Embedded studio

Download and extract the complete `xskin-plugin-v1.9.4-windows-x64.zip` into a persistent folder. The path below must identify the extracted root containing `plugin.json`, `mcp.json` and `.agents/plugins/marketplace.json`. It includes its Windows launcher, Node runtime and compiled UI; users need neither npm nor Flutter.

```powershell
codex plugin marketplace add "D:\path with spaces\Xskin-plugin"
codex plugin add codex-background-studio@codex-background-studio-local
```

Reload the plugin host and open Xskin from navigation (possibly under More), or invoke `xskin_open`. Choose an image/MP4, inspect Preview, then Apply. Video starts paused; completed original previews survive Apply. Mask, four languages, Pause, Resume saved background and pending imports share the standalone panel's state. Refresh is read-only; interrupted changes require explicit Recover and retain pending media.

Embedded Apply, mask and Resume require an existing verified background connection and never open or restart the current app. To establish one, explicitly enable **Apply when official Codex opens**, fully exit Codex and open the official app. Each future fresh ordinary launch gracefully reopens once. Existing, paused, disabled and debugging sessions are skipped; a refused quit is never forced or repeatedly retried.

Opening/refreshing the panel or importing alone does not enable automatic backgrounds or change official appearance settings. The per-user Task Scheduler monitor works with the panel closed and starts at login without opening Codex. Disable or Restore removes only the owned service. The existing Codex (Xskin) Desktop/Start shortcut remains a direct-launch option.

## Standalone app, media and data

Extract the full `Xskin-1.9.4-windows-x64.zip` and open Install Xskin.exe or xskin.exe. Keep all adjacent files. Flutter supports drag/drop, preview, explicit Apply, mask and four languages. Fully exit an ordinary session before using the direct shortcut. Installation leaves existing official sessions running.

New stores default to midnight aurora and contain all six byte-identical macOS preset packs. Existing backgrounds, imports, language, opacity and pause survive updates. Physical/MSIX-aware state roots, the per-user locator and owned shortcut checks remain in place. Do not move or delete the data directory to repair a connection.

Images: PNG/JPEG/WebP/HEIC/TIFF, ≤50 MiB/16384px/50MP before normalization to ≤4096px/16 MiB; HEIF/WebP depend on installed Windows codecs. MP4: ≤256 MiB, original bytes/resolution/frame rate, muted loop, suspended while hidden or Reduce Motion is enabled. Mask: 0–100%, default 62%. Existing Codex/Work/Dot backgrounds and official local usage/cache/quota/plan overlay are retained, with original-video frame/drop diagnostics.

Restore disables the owned monitor and skin while retaining data. Full removal may explicitly ask to close/reopen Codex. Selective appearance restoration preserves unrelated strict UTF-8 TOML and a recoverable backup; only explicit RecoverConfigBackup restores the complete backup. Never modify WindowsApps, app.asar, official signatures, accounts, API keys or Base URLs. CDP remains verified loopback-only; official CDP/CSS authorization is unconfirmed.

## Build and test

```powershell
npm ci --prefix plugin --ignore-scripts --no-audit --no-fund
npm test --prefix plugin
powershell.exe -NoProfile -ExecutionPolicy Bypass -File windows\scripts\build-release.ps1 -Flutter "D:\flutter\bin\flutter.bat"
```

Build requires Node 22+, Flutter, Visual Studio C++ and Windows SDK. The release script runs engine and Flutter checks, then produces standalone and plugin ZIPs with SHA-256 files. Isolated tests do not establish physical login, Store-update, official Home/task visual acceptance or sustained 4K playback; see the parity report for actual evidence.
