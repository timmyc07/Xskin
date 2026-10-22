# Xskin for Windows 1.6.0 (Flutter)

**[Download Windows x64 ZIP](https://github.com/timmyc07/Xskin/releases/download/windows-v1.6.0/Xskin-1.6.0-windows-x64.zip)** · [Release notes and SHA-256](https://github.com/timmyc07/Xskin/releases/tag/windows-v1.6.0)

Windows implementation of the macOS 1.5.1 background studio. The Flutter panel uses the same preview → import → apply flow and the same renderer, stylesheet, layout and video behavior as the Mac version. Official Codex files, signatures, accounts, API keys and provider settings remain intact.

**New in Windows 1.6.0:** turn on **Apply on Codex launch**, then open the original official Codex app from Start, Desktop or the taskbar. A hidden per-user monitor gracefully reopens each fresh ordinary launch once to apply the saved background. The panel can stay closed; dedicated Codex (Xskin) shortcuts are no longer required. Enable the option once in this updated panel to replace the old setup.

**Included since Windows 1.5.5:** video-to-video changes create a fresh preview view, keeping its dimension subscriptions attached to the current player. Paused previews remain visible. macOS 1.6.1 native Work detection and guarded late-shell injection are also included; inactive pages stay excluded, and pending observers are cancelled on pause, expiry or shutdown.

**Included since Windows 1.5.4:** the main-window **Your dot** conversation, embedded ChatGPT/Work and floating Dot composer/activity cards all support the original video. The conversation keeps native message bubbles without duplicate row backgrounds, borders or blur; verification checks the inner messaging layers as well as the shell. Work follows native container visibility, and its covered Codex player pauses. Floating cards share one player clipped to their rounded bounds; the desktop outside stays transparent. Playback pauses when no cards are visible, with the existing poster fallback for loading, errors and Reduce Motion.

Live 60-second tests preserved **3840×2160**, playback rate **1**, approximately **30 fps** and **zero additional dropped frames** in the Dot conversation and floating cards. Sustained GPU/memory improvements remain unproven; see the [measurement report](references/performance.md).

## Run

1. Install the official Microsoft Store `OpenAI.Codex` app.
2. Extract the **complete** Windows ZIP and open `xskin.exe`. Keep its DLLs, `data`, `scripts` and `assets` beside it. Node.js is bundled; no separate Node or Flutter installation is needed.
3. Choose **Choose file**, or drop one image/MP4 into the panel. Imported copies stay pending; the current background remains unchanged.
4. Check the preview, resolution and size, then press **Apply this background**. Video previews start paused; the Codex background plays silently in a loop at the original quality and frame rate.
5. If Codex is already running without a background connection, the first Apply asks to restart it once. Save unfinished input before accepting. Cancel or failed verification preserves the previous theme.
6. Enable **Apply on Codex launch** once in this updated panel. Later, open the original official Codex app normally; Xskin can remain closed.

The right side shows the active background, language, automatic apply and whole-window overlay. English, Traditional Chinese, Simplified Chinese and Japanese are available. The version is visible at the top right. Errors remain available under **Details**.

## Preferences and saved backgrounds

- **Overlay opacity:** 0–100%, default 62%. Release the slider to persist and update the current background. This does not import another copy or reopen the preview player. Keyboard changes are debounced.
- **Apply on Codex launch:** registers a hidden background monitor in the current user's Startup folder and starts it immediately. Open the official Codex app normally; the monitor checks for launches once per second, validates the registered package and exact PID/start time, then gracefully reopens a fresh ordinary launch once. It skips existing windows, other sessions and explicit debug launches. A 15-second launch-age limit, persisted 30-second restart guard and no retry for failed launches prevent repeated interruptions. Refused closes are never forced. An already-open ordinary Codex window is left running; use manual Apply to authorize its first restart.
- **Taskbar:** pin the official Codex app normally. If an old **Codex (Xskin)** shortcut was pinned, unpin that copy and restore the official Codex pin. Enabling/disabling the option removes only the old Xskin-owned Desktop/Start shortcuts and preserves unrelated entries.
- **Saved backgrounds:** contains launch, pause/resume, save, selection and restore controls. Selecting a saved theme prepares a draft for Apply.
- **Pause / Restore:** stop the monitor and remove its owned Startup entry. Restore closes the managed debugging session and reopens ordinary Codex after the restart prompt. Login starts only the monitor; closing Codex leaves it closed.

Imports, the overlay and language survive panel restarts. All media processing stays local; there is no account, API key or `.env` requirement.

The official window may briefly appear before the automatic handoff. Applying the background still includes normal app startup and media decoding. The monitor requires an interactive user session, with no administrator privileges or Windows system service.

## Media

| Type | Formats | Handling |
| --- | --- | --- |
| Image | PNG, JPEG, WebP, HEIC/HEIF, TIFF | Sources ≤50 MiB, ≤16384px per side and ≤50MP; converted locally to JPEG, quality 90, longest side ≤4096px and output ≤16 MiB. |
| Video | MP4, H.264 recommended | ≤256 MiB; original file copied without transcoding, including 4K. Import uses a still fallback while the preview prepares independently. |

Image conversion uses Windows Imaging Component. HEIF/HEIC and WebP require their Windows image codecs; missing codecs produce a conversion error and preserve the current theme. The Flutter preview uses media_kit/libmpv; Codex uses Chromium. Apply verifies the **selected theme, mask, decoded video and progressing playhead**, rather than accepting a previous background or a frozen frame. Hidden windows and Reduce Motion suspend video; still artwork remains available on decode failure.

## Managed engine and verification

Apply installs a self-contained engine under `%LOCALAPPDATA%\CodexDreamSkin\engine`. Media, drafts, settings and logs stay under `%LOCALAPPDATA%\CodexDreamSkin`. Metadata uses strict UTF-8, atomic writes, checked managed paths and recoverable transactions. Normal Apply does not rewrite `config.toml`.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\verify-dream-skin.ps1 -ScreenshotPath "$env:TEMP\xskin.png"
```

CDP remains loopback-only and verifies the registered Store package, process ownership and Browser ID. The official app, WindowsApps permissions and system execution policy are unchanged. The panel is unsigned; use trusted builds and trusted local software while the debugging connection is active.

Installed 1.6.0 passed a cold-launch test using the registered official AppsFolder entry's Windows Shell **Open** action, with the panel closed. The ordinary native process handed off to one stable background-enabled process, the original 3840×2160 video advanced, and media/settings hashes were unchanged. A later 30-second read-only check decoded 902 frames with one dropped frame. Windows close-to-tray no longer blocks the handoff; real GUI tests cover accepted and refused shutdown requests without force. Physical mouse clicks and a new Windows login were not repeated. See the [startup verification report](https://github.com/timmyc07/Xskin/blob/windows-v1.6.0/docs/startup-verification.md#windows-160--original-app-automatic-startup).

The retained installer/tray can still manage legacy appearance-key backups. For that optional setup, close Codex and run `Install Xskin.cmd`. Full appearance-key restoration is available through `scripts\restore-dream-skin.ps1 -RestoreBaseTheme -PromptRestart -Uninstall` when an appearance backup exists.

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

From the repository root, `powershell.exe -NoProfile -ExecutionPolicy Bypass -File windows\scripts\build-release.ps1` tests and packages the app. Output: `build/windows/Xskin-1.6.0-windows-x64.zip` and SHA-256 file. GitHub Actions runs the same build and uploads **Xskin-Windows**. Published Windows binaries use the separate `windows-v1.6.0` release tag.

## Performance

Ordinary streamed message content no longer triggers a full-document route scan. Shell/home changes, page activation, resize and periodic repair still refresh the background. Preview starts paused, hidden previews release the player, and hidden Codex windows / Reduce Motion pause video. Original video bytes, resolution and frame rate are preserved.

The local 100-update benchmark reduced route scans from 104 to 1 while a 4K video continued playing. Overall CPU timing was similar during this short run; this is a reduction in unnecessary background-maintenance work, not a total CPU/GPU guarantee. See [measurements and reproduction](references/performance.md).

**Windows 1.5.3** also streams complete MP4 integrity checks through a 1 MiB buffer and hashes video content once. In three fresh-process runs of 30 theme loads, median process CPU time fell from **1,344 to 843 ms (37.3%)**, and peak process RSS fell from **267.27 to 146.73 MiB (45.1%)**. These are load-time results; lower GPU use or sustained playback memory has not been established. Original 4K media and frame rate are preserved.

The downloadable **1.6.0 ZIP retains these optimizations and Dot/Work fixes and supports official-app startup**. Extract the complete build into a new folder, open `xskin.exe` and enable **Apply on Codex launch** once to update the managed engine and register the monitor. Saved backgrounds and preferences remain in the managed store. Engine updates stop/resume the verified monitor and injector, including rollback.

See [Mac/Windows parity](references/macos-parity.md) for the source mapping and platform-specific equivalents.
