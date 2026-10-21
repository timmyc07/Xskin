# Xskin for Windows (Flutter)

Native Windows desktop panel built with Flutter. Import a local image or MP4, preview it, adjust the full-window mask and apply it to the official Codex desktop app. WindowsApps, app.asar, authentication and account configuration remain intact.

## Run

1. Install the official Microsoft Store `OpenAI.Codex` app and Node.js 22 or newer (`node.exe` on PATH).
2. Extract the **complete** Windows ZIP to a folder you will keep. Open `xskin.exe` there; keep its DLLs, `data`, `scripts` and `assets` beside it.
3. Choose **Import media**, inspect the preview, then **Apply to Codex**. Importing alone does not change the active background. Video previews start paused.
4. The first Apply asks before restarting Codex if it is already open without the background connection. Save any unfinished input before accepting. Cancel leaves the previous theme in place.

The panel invokes its PowerShell backend with a process-local execution policy. No system execution-policy change, administrator access or ownership change is needed to run the app. The app is unsigned; distribute it only from trusted builds of this repository.

## Controls

- **Mask depth:** 0–100%, default 62%. Preview changes while dragging. Releasing the slider applies changes when viewing the current background; an imported draft waits for Apply.
- **Play preview / Pause preview:** muted local playback. Leaving the panel pauses its preview. Codex background video also pauses when hidden or when Reduce Motion is enabled, with a still-image fallback.
- **Launch with background:** starts Codex with the saved background connection. It asks before restarting an already-open unmanaged session.
- **Pause / Resume background:** hides or resumes the injected background without deleting the theme.
- **Save current background / Saved backgrounds:** preserve an applied theme and load a saved theme into preview before Apply.
- **Restore Codex appearance:** confirms closing the managed debug session and reopens official Codex normally.

Pending imports and the last applied mask survive panel restarts. All processing and playback stay local. There is no account, API key or `.env` requirement.

## Media limits

| Type | Formats | Limits |
| --- | --- | --- |
| Image | JPG, PNG, WebP | 16 MiB; 16384px per side; 50MP |
| Video | MP4; H.264 recommended | 256 MiB; original file copied without re-encoding, including 4K |

The Flutter preview uses media_kit/libmpv. Actual Codex playback uses its Chromium decoder, so codec availability can differ. Applying verifies playback and restores the previous theme if verification fails. Imported source files remain unchanged. Imported drafts and saved themes consume local disk space.

## Optional shortcuts

After fully exiting Codex, run `Install Xskin.cmd` to install a separate managed engine at `%LOCALAPPDATA%\CodexDreamSkin\engine` and create **Codex Dream Skin** launch and restore shortcuts. Use the launch shortcut for future background-enabled Codex sessions. The Flutter panel itself is portable: keep the extracted application folder.

The retained system tray also supports saved image/video themes. To restore saved appearance keys or remove the engine's shortcuts, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\restore-dream-skin.ps1 -RestoreBaseTheme -PromptRestart -Uninstall
```

Use `-RestoreBaseTheme` only after installation has created a recoverable appearance backup. Normal panel Apply does not rewrite `config.toml`.

## Build and test

Requires Flutter stable 3.47.7, Visual Studio 2022 with Desktop development with C++, a Windows SDK, and Node.js 22+. Flutter's plugin build requires directory-link support (Developer Mode or an appropriate developer terminal). These are build requirements, not end-user requirements.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File windows\tests\run-tests.ps1
cd windows\panel
flutter pub get
flutter analyze
flutter test
flutter run -d windows -- --engine-root=D:\path\to\Xskin\windows
```

From the repository root, build a tested release:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File windows\scripts\build-release.ps1
```

Output: `build/windows/Xskin-1.0.0-windows-x64.zip` and its SHA-256 file. GitHub Actions runs the same build and uploads the ZIP as **Xskin-Windows**. The full Flutter runner, native media libraries and theme engine are included; Flutter and Visual Studio are not required to run a packaged app.

## State and verification

State stays under `%LOCALAPPDATA%\CodexDreamSkin`: `active-theme`, `imports`, `themes`, `images`, `studio.json`, `state.json` and injector logs. Imported copies and themes use checked managed paths, atomic UTF-8 metadata writes and recoverable apply transactions.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\verify-dream-skin.ps1 -ScreenshotPath "$env:TEMP\xskin.png"
```

CDP stays loopback-only and checks the official Store package, process ownership and session Browser ID. The connection has no same-user authentication: run trusted local software while active. Codex updates can change selectors or launch behavior; use Restore if an update breaks appearance.

The panel is a Windows implementation, not a port of the SwiftUI macOS executable. This version uses English UI text. No automatic replacement of the official taskbar shortcut is performed.
