# Xskin for Windows 1.7.0 (Flutter)

**[Download Windows x64 ZIP](https://github.com/timmyc07/Xskin/releases/download/windows-v1.6.0/Xskin-1.6.0-windows-x64.zip)** · [Release notes and SHA-256](https://github.com/timmyc07/Xskin/releases/tag/windows-v1.6.0)

This guide describes the 1.7.0 source and packaged builds. The published download above remains 1.6.0 until a new release is published.

Windows implementation of the macOS 1.5.1 background studio. The Flutter panel uses the same preview → import → apply flow and the same renderer, stylesheet, layout and video behavior as the Mac version. Official Codex files, signatures, accounts, API keys and provider settings remain intact.

**New in Windows 1.7.0:** the first installation or panel launch prepares the managed engine, saved preset and automatic apply once. A per-user logon task keeps the monitor independent of Codex and the panel, so opening the official app from Start, Desktop or the taskbar applies the saved background. Later launches respect explicit disable, Pause and Restore choices. A compact token and cache overlay appears below the task composer.

**Included since Windows 1.5.5:** video-to-video changes create a fresh preview view, keeping its dimension subscriptions attached to the current player. Paused previews remain visible. macOS 1.6.1 native Work detection and guarded late-shell injection are also included; inactive pages stay excluded, and pending observers are cancelled on pause, expiry or shutdown.

**Included since Windows 1.5.4:** the main-window **Your dot** conversation, embedded ChatGPT/Work and floating Dot composer/activity cards all support the original video. The conversation keeps native message bubbles without duplicate row backgrounds, borders or blur; verification checks the inner messaging layers as well as the shell. Work follows native container visibility, and its covered Codex player pauses. Floating cards share one player clipped to their rounded bounds; the desktop outside stays transparent. Playback pauses when no cards are visible, with the existing poster fallback for loading, errors and Reduce Motion.

Live 60-second tests preserved **3840×2160**, playback rate **1**, approximately **30 fps** and **zero additional dropped frames** in the Dot conversation and floating cards. Sustained GPU/memory improvements remain unproven; see the [measurement report](references/performance.md).

## Run

1. Install the official Microsoft Store `OpenAI.Codex` app.
2. Extract the **complete** Windows ZIP and open `Install Xskin.exe`, or open `xskin.exe` directly for first-use setup. Keep its DLLs, `data`, `scripts` and `assets` beside it. Node.js is bundled; no separate Node or Flutter installation is needed.
3. Choose **Choose file**, or drop one image/MP4 into the panel. Imported copies stay pending; the current background remains unchanged.
4. Check the preview, resolution and size, then press **Apply this background**. Video previews start paused; the Codex background plays silently in a loop at the original quality and frame rate.
5. If Codex is already running without a background connection, the first Apply asks to restart it once. Save unfinished input before accepting. Cancel or failed verification preserves the previous theme.
6. Later, open the original official Codex app normally; Xskin can remain closed. Use **Apply on Codex launch** to disable or re-enable automatic apply when needed.

Installation can run while one registered Codex version is open. It gracefully closes that app and reopens it with the saved background after setup; a paused setup reopens ordinary Codex. It never forces shutdown, refuses multiple active versions and attempts to reopen the original app if setup fails after closing it. The GUI installer and managed launchers do not create terminal windows.

The right side shows the active background, language, automatic apply and whole-window overlay. English, Traditional Chinese, Simplified Chinese and Japanese are available. The version is visible at the top right. Errors remain available under **Details**.

## Preferences and saved backgrounds

- **Overlay opacity:** 0–100%, default 62%. Release the slider to persist and update the current background. This does not import another copy or reopen the preview player. Keyboard changes are debounced.
- **Apply on Codex launch:** a per-user Windows Task Scheduler logon task starts the hidden monitor immediately and at login. It runs in the current user's interactive session without administrator privileges, timeout or battery restrictions. The monitor checks for launches once per second, validates the registered package and exact PID/start time, then gracefully reopens an ordinary launch at most 15 seconds old, including one that starts just before the monitor. Older windows, other sessions and explicit debug launches are skipped. A persisted 30-second guard and no retry for failed launches prevent repeated interruptions. Refused closes are never forced. Only the exact Xskin-owned legacy Startup shortcut is migrated.
- **Taskbar:** pin the official Codex app normally. If an old **Codex (Xskin)** shortcut was pinned, unpin that copy and restore the official Codex pin. Enabling/disabling the option removes only the old Xskin-owned Desktop/Start shortcuts and preserves unrelated entries.
- **Saved backgrounds:** contains launch, pause/resume, save, selection and restore controls. Selecting a saved theme prepares a draft for Apply.
- **Pause / Restore:** stop the monitor and remove its owned logon task. Restore closes the managed debugging session and reopens ordinary Codex after the restart prompt. These choices and explicit automatic-apply disable survive later panel launches. Login starts only the monitor; closing Codex leaves it closed.

Imports, the overlay and language survive panel restarts. All media processing stays local; there is no account, API key or `.env` requirement.

The official window may briefly appear before the automatic handoff. Applying the background still includes normal app startup and media decoding. The monitor requires an interactive user session, with no administrator privileges or Windows system service.

## Token and cache overlay

The row below the Codex task composer shows the current conversation's cumulative tokens, cached input tokens, remaining context percentage, subscription plan and remaining quota when official local records provide them. Cached input is already included in the totals. The cache bar shows the latest model call's hit ratio; cache-write tokens appear only when recorded. Missing values stay unknown, and permanent cache contents or expiry are not inferred.

A `fs.watch` listener filters notifications to the current conversation's exact session file and coalesces writes for 20ms. Route and visibility checks run every 250ms, with a 5-second metadata heartbeat for missed notifications, replacement and quota expiry. Reads are serialized, snapshots deduplicated and file tails read incrementally; these intervals do not trigger repeated full-directory scans. Display latency depends on when Codex writes its usage event. The CSS fan follows actual positive token deltas and stops when idle, hidden or Reduce Motion is enabled. No simulated consumption, network requests or `auth.json` reads are used. Pause and Restore remove the row with the skin.

## Media

| Type | Formats | Handling |
| --- | --- | --- |
| Image | PNG, JPEG, WebP, HEIC/HEIF, TIFF | Sources ≤50 MiB, ≤16384px per side and ≤50MP; converted locally to JPEG, quality 90, longest side ≤4096px and output ≤16 MiB. |
| Video | MP4, H.264 recommended | ≤256 MiB; original file copied without transcoding, including 4K. Import uses a still fallback while the preview prepares independently. |

Image conversion uses Windows Imaging Component. HEIF/HEIC and WebP require their Windows image codecs; missing codecs produce a conversion error and preserve the current theme. The Flutter preview uses media_kit/libmpv; Codex uses Chromium. Apply verifies the **selected theme, mask, decoded video and progressing playhead**, rather than accepting a previous background or a frozen frame. Hidden windows and Reduce Motion suspend video; still artwork remains available on decode failure.

## Managed engine and verification

First-use setup installs a self-contained engine under `%LOCALAPPDATA%\CodexDreamSkin\engine`. Media, drafts, settings and logs stay under `%LOCALAPPDATA%\CodexDreamSkin`. On MSIX installations this can resolve to Codex's package-private storage; Xskin carries the actual path through installation, panel, tray, logon task and engine updates so each uses the same saved background. Metadata uses strict UTF-8, atomic writes, checked managed paths and recoverable transactions. Normal Apply does not rewrite `config.toml`.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\verify-dream-skin.ps1 -ScreenshotPath "$env:TEMP\xskin.png"
```

CDP remains loopback-only and verifies the registered Store package, process ownership and Browser ID. The official app, WindowsApps permissions and system execution policy are unchanged. The panel is unsigned; use trusted builds and trusted local software while the debugging connection is active.

Installed 1.6.0 passed a cold-launch test using the registered official AppsFolder entry's Windows Shell **Open** action, with the panel closed. The ordinary native process handed off to one stable background-enabled process, the original 3840×2160 video advanced, and media/settings hashes were unchanged. A later 30-second read-only check decoded 902 frames with one dropped frame. Windows close-to-tray no longer blocks the handoff; real GUI tests cover accepted and refused shutdown requests without force. Physical mouse clicks and a new Windows login were not repeated. See the [startup verification report](https://github.com/timmyc07/Xskin/blob/windows-v1.6.0/docs/startup-verification.md#windows-160--original-app-automatic-startup).

The installer/tray can still manage legacy appearance-key backups. Use `Install Xskin.exe` for that setup; it handles an active registered Codex app gracefully. Full appearance-key restoration is available through `scripts\restore-dream-skin.ps1 -RestoreBaseTheme -PromptRestart -Uninstall` when an appearance backup exists.

## Build and test

Source builds require Flutter stable 3.47.7, Visual Studio 2022 Desktop development with C++, a Windows SDK, and Node.js 22+. Flutter plugin builds require directory-link support. These are developer requirements, not packaged-app requirements.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File windows\tests\run-tests.ps1
cd windows\panel
flutter pub get
flutter analyze
flutter test
flutter test integration_test/video_test.dart -d windows --dart-define=TEST_VIDEO=D:\media\sample.mp4
```

From the repository root, `powershell.exe -NoProfile -ExecutionPolicy Bypass -File windows\scripts\build-release.ps1` tests and packages the app. Current source output: `build/windows/Xskin-1.7.0-windows-x64.zip` and SHA-256 file, including the generated `Install Xskin.exe`. GitHub Actions runs the same build and uploads **Xskin-Windows**. The currently published Windows binaries remain under the separate `windows-v1.6.0` release tag.

## Performance

Ordinary streamed message content no longer triggers a full-document route scan. Shell/home changes, page activation, resize and periodic repair still refresh the background. Preview starts paused, hidden previews release the player, and hidden Codex windows / Reduce Motion pause video. Original video bytes, resolution and frame rate are preserved.

The local 100-update benchmark reduced route scans from 104 to 1 while a 4K video continued playing. Overall CPU timing was similar during this short run; this is a reduction in unnecessary background-maintenance work, not a total CPU/GPU guarantee. See [measurements and reproduction](references/performance.md).

**Windows 1.5.3** also streams complete MP4 integrity checks through a 1 MiB buffer and hashes video content once. In three fresh-process runs of 30 theme loads, median process CPU time fell from **1,344 to 843 ms (37.3%)**, and peak process RSS fell from **267.27 to 146.73 MiB (45.1%)**. These are load-time results; lower GPU use or sustained playback memory has not been established. Original 4K media and frame rate are preserved.

The downloadable **1.6.0 ZIP retains these optimizations and Dot/Work fixes and supports official-app startup** with its earlier opt-in Startup-folder monitor. The 1.7.0 source replaces that registration with the logon task and automatic first-use setup described above. Saved backgrounds and preferences remain in the managed store. Engine updates stop/resume the verified monitor and injector, including rollback.

See [Mac/Windows parity](references/macos-parity.md) for the source mapping and platform-specific equivalents.
