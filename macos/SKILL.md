---
name: codex-dream-skin
description: Install MP4 video or image backgrounds on macOS, customize, launch, hot-switch, pause, inspect, verify, package, repair, recover, update, or restore a real reversible skin for the official Codex Desktop app on macOS or Windows. Use when a user asks to apply a Codex Dream Skin, turn a local or CDN image into a Codex theme, manage saved themes or the macOS menu bar controller, prove that a skin actually works, reapply it after a Codex update, troubleshoot CDP injection, recover appearance configuration, build a distributable theme package, or return Codex to its official appearance.
---

# Codex Dream Skin

Apply a real renderer skin to the official Codex Desktop app while keeping the native sidebar, project selector, cards, task content, menus, keyboard focus, and composer interactive.

## Ordinary-user path

Do not explain CDP, ports, injectors, process state, or shell commands unless the user explicitly asks for technical details.

When a macOS user asks to install Dream Skin without naming a theme or providing an image, ask only:

> 請選擇：1. 世界盃主題；2. 使用自己的圖片或 MP4 影片。

Do not start theme application until the user chooses. A supplied MP4 file or HTTPS video URL is already a choice of a custom video theme. If the user chooses their own image but has not provided one, ask them to upload an image or paste one HTTPS image URL. Do not ask them for theme parameters, paths, commands, or technical settings.

When a macOS user asks to install the World Cup theme, run exactly:

```bash
bash scripts/dream-skin-macos.sh world-cup
```

Tell the user only to confirm the single native dialog and then wait. The helper owns installation, one explicit official launch, theme preparation, launch, and Verify. If ordinary Codex is already running, ask them to fully quit it manually before using Codex (Xskin). After Codex returns, read the result without restarting:

```bash
bash scripts/dream-skin-macos.sh world-cup-status
```

Report success only when the result says `status=success` and the live status shows the injector and CDP session. If the user declines the dialog or says not to restart, stop immediately and make no further apply or reload attempt.

When a macOS user chooses their own image, use exactly one matching command:

```bash
# HTTPS image
bash scripts/dream-skin-macos.sh apply-custom-url "https://cdn.example.com/theme.png"

# Local or attached image
bash scripts/dream-skin-macos.sh apply-custom-file "/absolute/path/to/theme.png"
```

Tell the user only to confirm the single native dialog and wait. The helper owns installation, one explicit official launch, theme preparation, launch, and Verify. After Codex returns, read the result without restarting:

```bash
bash scripts/dream-skin-macos.sh custom-install-status
```

Report success only when the result says `status=success` and the live status shows the injector and CDP session. Never use a full-interface showcase screenshot as the selected image. If the user declines the dialog or says not to restart, stop immediately.

## Native background studio

For a visual image/video picker, run `scripts/dream-skin-macos.sh panel --json`. This opens **Xskin.app**, a real macOS application with native file selection, image/video previews, and an explicit Apply button. The result contains `appPath` and `version`, never a browser URL. Do not open a browser or a web panel. Opening the studio does not authorize changing the background; the user chooses and applies media in the application.

## macOS video edition

For an MP4 video supplied by the user, use one matching command:

```bash
bash scripts/dream-skin-macos.sh apply-video-file "/absolute/path/to/background.mp4"
bash scripts/dream-skin-macos.sh apply-video-url "https://example.com/background.mp4"
```

The helper confirms the selected media, installs the bundled runtime, applies the video, and runs Verify. Read `custom-install-status` after Codex returns; only report success with `status=success` and a ready or intentionally suspended video in the live Verify result. If no video is provided, ask the user to upload an MP4 or provide an HTTPS video URL. Never apply a test video as the user's theme.

MP4 only, non-empty, maximum 256 MiB. Recommend H.264/AVC encoding. The original video file is streamed locally without transcoding or downscaling, including 4K/60fps sources. Video always plays muted in a loop, pauses while the document is hidden or reduced motion is enabled, and uses the current static background as its poster and failure fallback. Verify rejects failed or unplayable video; a successful download alone is not success. No video upload service or extra package is required. The current Codex active page is detected through native `data-app-shell-*` attributes, so retained hidden pages cannot block injection.

To prepare a video after the engine is installed without applying it:

```bash
bash scripts/load-video-theme-macos.sh --file "/absolute/path/to/background.mp4" --no-apply
```

The optional macOS menu controller includes “更換影片背景…”. Image switching, Pause, and Restore release the video decoder, listeners, and Blob URL. Windows also supports original MP4 backgrounds in its matching package.

## Safety guarantees

- The macOS video edition uses the runtime included in this Skill folder. Keep the whole folder when installing or packaging. The Windows wrapper requires the matching Windows package/source; it does not download an older runtime.
- Official `Codex.app`, `app.asar`, `WindowsApps`, signatures, accounts, chats, projects, API keys, and model providers remain unchanged.
- macOS automatic apply observes fresh official-app launches and gracefully reopens each once when enabled. Existing, paused and debug sessions are skipped; a refused quit is never forced. Windows startup never closes/reopens official Codex.
- macOS keeps its per-user login observer without requiring the panel. The optional Codex (Xskin) entry starts directly without that reopen. Windows uses only its managed shortcut.
- Custom themes use an HTTPS image URL or a local image selected by the user. Full-interface showcase screenshots are visual references, not theme backgrounds.
- Decorative layers do not receive pointer events, so native controls remain clickable.
- A theme is considered active only after Verify passes.
- CDP listens on loopback only. Because local processes under the same user can still access it, use Restore when the themed session is no longer needed.

## Select the platform

- macOS: run `scripts/dream-skin-macos.sh`.
- Windows: run `scripts/dream-skin-windows.ps1` with Windows PowerShell.
- Linux: not supported.

The commands below use paths relative to this Skill folder.

## macOS capabilities

### Preflight and install

```bash
# Validate the bundled macOS runtime without changing Codex.
bash scripts/dream-skin-macos.sh source

# Initialize a safe default theme on first use, then validate app identity, runtime, config, and payload.
bash scripts/dream-skin-macos.sh doctor

# Back up appearance keys and install launchers without launching Codex.
bash scripts/dream-skin-macos.sh install

# Optional custom port or no Desktop launchers.
bash scripts/dream-skin-macos.sh install --port 9341 --no-launchers
```

The installer backs up and changes only `appearanceTheme` and `appearanceDarkCodeThemeId`. It installs the engine under `~/.codex/codex-dream-skin-studio` and mutable state under `~/Library/Application Support/CodexDreamSkinStudio`.

### Create or reset a theme

```bash
# Native Finder picker; prepares without applying.
bash scripts/dream-skin-macos.sh customize

# Local image with full theme metadata and colors.
bash scripts/dream-skin-macos.sh customize-file "/absolute/banner.png" \
  --name "My Skin" --tagline "My tagline" --quote "MAKE SOMETHING WONDERFUL" \
  --accent "#7cff46" --secondary "#36d7e8" --highlight "#642a8c"

# HTTPS CDN image with the same metadata controls.
bash scripts/dream-skin-macos.sh customize-url "https://cdn.example.com/banner.png" --name "My Skin"

# Return to the bundled Midnight Aurora preset, without applying yet.
bash scripts/dream-skin-macos.sh reset-demo
```

Accept PNG, JPEG, HEIC, TIFF, or WebP. Reject source files over 50 MB and prepared files over 16 MB. Recommend width of at least 2000 px and a visually quiet left side.

### Theme and image library

```bash
# Add an image as a saved theme without applying it.
bash scripts/dream-skin-macos.sh library-add-file "/absolute/banner.png" --name "Saved Skin"
bash scripts/dream-skin-macos.sh library-add-url "https://cdn.example.com/banner.png" --name "Saved Skin"

# Inspect saved IDs, select without applying, or safely switch and apply.
bash scripts/dream-skin-macos.sh list-themes
bash scripts/dream-skin-macos.sh select-theme "THEME_ID"
bash scripts/dream-skin-macos.sh switch-theme "THEME_ID"
```

`switch-theme` uses live reapplication when the verified CDP session exists. Otherwise the safe starter leaves ordinary running Codex open and requires manual exit.

### Official macOS app and optional direct entry

Use `autostart enable` to observe future official Codex launches through the verified per-user login service. Each fresh ordinary launch gracefully reopens once; existing/paused/debug sessions are skipped, failed handoffs are not retried, and no forced termination is used. The panel can stay closed. `autostart disable` removes only the owned service and keeps the current background. Pause retains the enabled preference/service but skips future launches until explicit Apply. The optional ~/Applications/Codex (Xskin).app starts directly with the background connection and avoids that reopen; fully quit an ordinary existing session before using it. Pin through normal Dock UI. Windows remains shortcut-only without automatic reopen. CDP/CSS authorization remains unconfirmed; see https://github.com/timmyc07/Xskin/blob/codex/macos-native-launch/docs/direct-launch-shortcut.md.

### Start, status, pause, and menu bar

```bash
# Reuses the saved port or scans from 9341; never restarts an existing app.
bash scripts/dream-skin-macos.sh start

# Optional custom port or foreground injector for diagnosis.
bash scripts/dream-skin-macos.sh start --port 9350
bash scripts/dream-skin-macos.sh start --foreground-injector

# Explicit start; ordinary existing Codex still requires manual exit.
bash scripts/dream-skin-macos.sh start-authorized --port 9350

# Fast state, machine-readable state, or deeper CDP probe.
bash scripts/dream-skin-macos.sh status
bash scripts/dream-skin-macos.sh status --json --deep

# Soft-off: remove live CSS/DOM and stop the injector without restoring base settings.
bash scripts/dream-skin-macos.sh pause
```

Optional SwiftBar controller:

```bash
# If SwiftBar already exists, avoid package installation.
bash scripts/dream-skin-macos.sh menubar-install --no-brew

# Without --no-brew, Homebrew may install SwiftBar after confirmation.
bash scripts/dream-skin-macos.sh menubar-install

# Native-confirmed menu-controller apply path.
bash scripts/dream-skin-macos.sh menubar-apply
```

The menu shows live status, current theme, apply, pause, image picker, saved-theme switching, the image drop folder, and full restore.

### Verify, restore, uninstall, and package

```bash
# Verify current DOM/CSS and optionally capture proof.
bash scripts/dream-skin-macos.sh verify --screenshot "/absolute/proof.png"

# Reload the renderer, wait for reinjection, and verify resilience.
bash scripts/dream-skin-macos.sh verify --reload --screenshot "/absolute/reload-proof.png"

# Soft removal plus selective base appearance restore.
bash scripts/dream-skin-macos.sh restore

# Restart Codex and remove Desktop launchers after confirmation.
bash scripts/dream-skin-macos.sh restore --restart-codex --uninstall

# Regression suite and distributable ZIP builders with SHA-256 output.
bash scripts/dream-skin-macos.sh test
bash scripts/dream-skin-macos.sh build-client-release "/absolute/Codex Theme Editor.zip"
bash scripts/dream-skin-macos.sh build-release
```

## Windows capabilities

Windows requires the official Microsoft Store `OpenAI.Codex` package and Node.js 22+. The runtime dynamically discovers the current Appx package, validates Store identity, serializes operations with a per-user lock, and preserves strict UTF-8 `config.toml` bytes.

```powershell
# Validate the matching local Windows source.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dream-skin-windows.ps1 -Action source

# Close Codex first. Create shortcuts, or skip them.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dream-skin-windows.ps1 -Action install
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dream-skin-windows.ps1 -Action install -NoShortcuts

# Open the system-tray controller for image picking, saving/switching themes, pause, and restore.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dream-skin-windows.ps1 -Action tray

# Start without automatic restart; optionally choose port/profile or foreground diagnosis.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dream-skin-windows.ps1 -Action start -Port 9335
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dream-skin-windows.ps1 -Action start -ProfilePath "C:\path\profile" -ForegroundInjector

# Explicit start; ordinary existing Codex still requires manual exit.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dream-skin-windows.ps1 -Action start-authorized

# Verify and capture proof.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dream-skin-windows.ps1 -Action verify -ScreenshotPath "C:\absolute\proof.png"

# Selectively restore saved appearance and prompt before closing Codex.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dream-skin-windows.ps1 -Action restore

# Restore without reopening Codex.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dream-skin-windows.ps1 -Action restore -NoRelaunch

# Close and restore without another prompt after the action has already been confirmed.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dream-skin-windows.ps1 -Action restore-authorized

# Exact byte-for-byte recovery of the pre-install config; the current config is archived first.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dream-skin-windows.ps1 -Action recover-config

# Remove shortcuts and restore appearance, or run all regression tests.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dream-skin-windows.ps1 -Action uninstall
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dream-skin-windows.ps1 -Action test
```

The Windows installer initializes a bundled theme and starts its system-tray controller unless `-NoShortcuts` is used. From the tray, the user can choose a local PNG, JPEG, or WebP background, save the current theme, switch saved themes, pause or resume the skin, reapply it, and fully restore Codex. Images must be no larger than 16 MB and must pass dimension and metadata validation.

## Verification

Verify checks the live renderer and can save a proof screenshot for visual inspection.

- Home: visible independent banner, live native heading, two to four native suggestion cards, real project selector, native composer, native sidebar, no horizontal overflow.
- Task: selected background remains decorative; messages, approvals, attachments, menus, and composer stay readable and clickable.
- Decoration: `pointer-events: none`; no rasterized fake native controls.
- Resilience: `verify --reload` on macOS or a manual Windows reload check shows reinjection.
- Safety: verified loopback target and process identity; official signature/package unchanged.
- Rollback: Restore removes injection, closes the saved CDP session when restarted, and preserves unrelated configuration.

The result includes the operating system, pinned runtime commit, live verification status, proof path, native sidebar/composer status, reload result when tested, and the Restore command. Codex updates may change renderer selectors, so rerun install, launch, and Verify after every update.
