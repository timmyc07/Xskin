# Xskin for macOS

Xskin is a native macOS app for importing, previewing, and applying local images and original 4K MP4 backgrounds to official Codex Desktop. The `macos/` directory includes the native app source and the self-contained `codex-dream-skin` background engine.

## Native app

[Download Xskin 1.8.2](https://github.com/timmyc07/Xskin/releases/download/v1.8.2/Xskin-v1.8.2-macos-arm64.zip), extract the archive, and move **Xskin.app** to Applications. The prebuilt app requires macOS 13 or later, Apple Silicon, and official Codex Desktop; no separate Node.js or Xcode installation is needed. The release uses an ad-hoc signature and is not Apple Developer ID notarized. The [release page](https://github.com/timmyc07/Xskin/releases/tag/v1.8.2) also provides the matching plugin ZIP and SHA-256 files.

Use the system file picker or drag a local image or MP4 into the app, inspect its native preview, and apply when ready. The mask-depth slider updates all surfaces together (0–100%, default 62%); release it to apply, or adjust it with the keyboard. Mask depth, pending imports, and your language preference persist locally. English is the default interface, with Traditional Chinese, Simplified Chinese, and Japanese available in the app.

Version 1.8.2 keeps the **official Codex app** as the normal macOS entry. Enable **Apply when official Codex opens**, then open the official app from Finder, Spotlight or its existing Dock icon. A per-user login service observes new launches and gracefully reopens each ordinary session once to apply the saved background and overlay. Xskin can stay closed. Installation/login leaves an already-open session alone. Windows keeps its separate 1.8.1 shortcut-only behavior with no automatic reopen.

Paused or disabled sessions are skipped and stay paused until explicit Apply. If Codex refuses to quit, the service leaves it running and does not force termination. A failed managed relaunch is not retried. The optional **~/Applications/Codex (Xskin).app** starts with the background connection directly, avoiding that reopen. Upgrades replace only the verified Xskin LaunchAgent and preserve media, language, opacity and pause. New setup never replaces official Dock pins automatically.

The task overlay includes the Windows draft-ID, serialized-subscription, lifecycle fan, long-log and new-session-file fixes. In 1.8.2 it sits above the input, wraps on narrow windows and stays hidden on Home. The composer and native project/files/plugins toolbar reveal the image/video through matching translucent surfaces. CDP/CSS authorization remains unconfirmed; unchanged official files do not establish permission. See [evidence, validation and recovery](https://github.com/timmyc07/Xskin/blob/v1.8.2/docs/direct-launch-shortcut.md).

Full macOS regression tests and the arm64 build passed. Three physical cold starts and complete Home/task visual inspection remain pending. To upgrade, close Xskin, retain the previous app, and replace it with the new one; applying updates its managed engine while preserving the current official app and saved preferences/media. Pause retains the enabled service but skips launches until explicit Apply. Disable automatic backgrounds before reinstalling a saved app for rollback; retain the data directory.

See the [product README](../README.md) and [native app user guide](../docs/background-panel.md) for current features, formats, installation, and startup limitations. The sections below document the advanced engine and retained command-line workflows.

## Advanced video backgrounds

- MP4 up to 256 MiB; H.264/AVC recommended. Playback is muted, looping, and non-interactive.
- Hidden documents and reduced-motion preferences pause decoding and show the static background.
- The current image remains the poster/failure fallback. Switch back to an image, Pause, or Restore to release video resources.
- One-click commands: `scripts/dream-skin-macos.sh apply-video-file PATH` or `apply-video-url HTTPS_URL`; check `custom-install-status` after applying through Codex (Xskin).
- `load-video-theme-macos.sh --file PATH --no-apply` prepares without launching. SwiftBar also offers a video picker.
- Videos are handed to the verified renderer as local files and streamed through Blob URLs. Original resolution and frame rate are preserved; no transcoding is performed.
- Windows video support is outside this fork's scope.

Video behavior references the community proposal [Fei-Away/Codex-Dream-Skin#240](https://github.com/Fei-Away/Codex-Dream-Skin/issues/240). The one-click wrapper comes from [aithink001/Codex-Dream-Skin-Themes](https://github.com/aithink001/Codex-Dream-Skin-Themes), MIT licensed; its license is included in `NOTICE.md`.

## Background engine

The external theme engine supports the **official Codex Desktop** app.

Turn an image you like into one continuous full-window Codex theme. The same wallpaper runs beneath the native sidebar and main surface, while route-aware translucency keeps home, task, plugin, scheduled-task, and pull-request controls fully interactive and readable.

This project injects through **local loopback CDP**. It does **not** modify the official `.app`, `app.asar`, or code signature.

> Not affiliated with OpenAI. Codex is a trademark of its respective owners.

## Requirements

- macOS
- Official Codex Desktop installed and launched at least once (`~/.codex/config.toml` exists)
- No global Node.js install required (uses Codex’s signed bundled Node after validation)

## Quick start (from this repo)

```bash
# 1) Optional checks (needs the installed Codex/ChatGPT.app bundled Node)
./tests/run-tests.sh

# 2) Install to the stable path and create Desktop launchers
./scripts/install-dream-skin-macos.sh --no-launch

# 3) Switch to the tested featured preset, or import your own pure background
~/.codex/codex-dream-skin-studio/scripts/switch-theme-macos.sh --id preset-romantic-rose
# ~/.codex/codex-dream-skin-studio/scripts/customize-theme-macos.sh

# 4) Start/re-apply, verify, or restore via Desktop:
#    Codex Dream Skin.command
#    Codex Dream Skin - Customize.command
#    Codex Dream Skin - Verify.command
#    Codex Dream Skin - Restore.command

# 5) Optional: menu bar (SwiftBar) — apply, pause, import, and switch
./Install\ Menu\ Bar.command
# Look for 🎨 Skin in the top-right menu bar
```

Install location after step 2:

| Item | Path |
| --- | --- |
| Engine | `~/.codex/codex-dream-skin-studio` |
| State / logs / user images | `~/Library/Application Support/CodexDreamSkinStudio` |
| Theme backup | under Application Support (`theme-backup.json`) |

## Customer ZIP (optional packaging)

To build the “double-click install” folder layout for non-git users:

```bash
./scripts/build-client-release.sh "$HOME/Desktop/Codex 主题编辑器.zip"
```

That ZIP contains a visible installer plus a hidden `.codex-dream-skin-studio` engine. Do not ship only CSS/images.

## How it works (security boundary)

1. Discover `com.openai.codex` and validate signature / Team ID / arch / bundled Node.
2. Start Codex via user `launchd` with CDP bound to `127.0.0.1` only.
3. Accept the debug port only when it belongs to Codex (or a legitimate child).
4. Inject only into expected `app://` renderer targets.
5. Resolve the selected theme and image to real paths, then enforce 16 MB,
   `16384px`-per-side, and 50-megapixel limits before injection.
6. Keep a small injector alive across reloads and route changes.
7. Pause/Restore stops the injector only when PID, executable, script path, and
   start time match the recorded job; a stop failure preserves state and aborts.
8. Config backup/restore requires Codex to be closed, strict UTF-8, an operation
   lock, same-directory atomic replacement, and an unchanged-byte check.

CDP is powerful and unauthenticated on loopback. Prefer Restore when you are done theming.

## Bundled presets

A fresh install seeds one tested featured preset plus five procedural abstract
presets into your theme library. **Arina Hashimoto** is highlighted
first here:

```bash
~/.codex/codex-dream-skin-studio/scripts/switch-theme-macos.sh --id preset-romantic-rose
```

The user-provided source PNG is `1672 × 941`. Its pack contains a standardized
derived `2560 × 1440` JPEG plus theme metadata; the derived export does not add
source detail. The byte-identical source PNG is archived at
[`docs/images/presets/romantic-rose-source.png`](../docs/images/presets/romantic-rose-source.png).
The [light](../docs/images/presets/romantic-rose-light.jpg) and
[dark](../docs/images/presets/romantic-rose-dark.jpg) images are real injected
Codex screenshots for preview only — never import either screenshot as a
background. The artwork is a user-provided AI-generated example, not an
official OpenAI/Codex visual or endorsement; confirm likeness and asset rights
before redistributing it.

The other five presets — **Midnight Aurora / Sakura Dawn / Amber Dusk / Forest Mist /
Cyber Neon** — are generated procedurally (pure Node + zlib, no photos, no
third-party art or likeness) by `presets/generate-presets.mjs`. Apply one
directly, for example:

```bash
~/.codex/codex-dream-skin-studio/scripts/switch-theme-macos.sh --id preset-midnight-aurora
```

Seeding is idempotent and only manages `preset-*` packs — your own `custom-*`
themes created by importing a new image are never touched. If no active theme exists yet, install
starts from the neutral **Midnight Aurora** preset; it never overwrites an
existing active theme.

To contribute a preset, see [`presets/README.md`](./presets/README.md).

## Image guidelines

- PNG / JPEG / HEIC / TIFF / WebP (macOS readable)
- Source ≤ 50 MB; prepared file ≤ 16 MB, ≤ 16384 px per side, and ≤ 50 MP
- `2560 × 1440` (16:9) is the recommended master size; width ≥ 2000 px minimum
- Keep roughly the left 50%–58% calm and low-contrast for native home content;
  place the subject in the right 58%–88% without touching the edge
- Use pure edge-to-edge background art only: no window chrome, sidebar, cards,
  buttons, composer, readable text, logo, or watermark
- The prompt-ready composition template and negative prompt live in
  [`docs/reference-background-prompt-guide.md`](../docs/reference-background-prompt-guide.md)

## Adaptive image themes

The renderer treats every image as a theme input instead of assuming a fixed
character palette. It downsamples the image in a local Canvas to estimate
brightness, accent color, visual focus, left/right safe area, and aspect ratio.
The pixels stay in the Codex renderer; there is no upload or external API call.
If Canvas analysis is unavailable, the theme falls back to a safe default and
the detected Codex shell/OS appearance.

Theme metadata is optional. The defaults are deliberately adaptive:

```json
{
  "appearance": "auto",
  "art": {
    "focusX": 0.72,
    "focusY": 0.45,
    "safeArea": "auto",
    "taskMode": "auto"
  }
}
```

- `appearance`: `auto`, `light`, or `dark`. `auto` follows the native
  Codex/ChatGPT or OS appearance; an explicit value wins. Image luminance
  still informs palette and composition, but never overrides the user's UI mode.
- `art.focusX` / `art.focusY`: normalized `0..1` coordinates used for
  `background-position` (left/top is `0`, right/bottom is `1`).
- `art.safeArea`: `auto`, `left`, `right`, `center`, or `none`. Automatic mode
  finds the lower-information side so native home content does not cover the
  subject. Use `none` when the artwork should fill the composition evenly.
- `art.taskMode`: `auto`, `ambient`, `banner`, or `off`. Ultra-wide art
  automatically uses a full-width task banner with a vertical fade; standard
  art uses a quieter ambient layer. `off` removes the task-page artwork while
  leaving the rest of the theme active.

The image-derived palette is used unless a theme explicitly supplies color
fields. Explicit art metadata (`focusX`, `focusY`, `safeArea`, `taskMode`) has
the same priority over automatic inference. The home route remains expressive;
task routes keep native content, cards, composer, and code readable above the
image layer.

CLI example:

```bash
~/.codex/codex-dream-skin-studio/scripts/customize-theme-macos.sh \
  --image "/path/to/image.png" \
  --name "My theme" \
  --accent "#7cff46" \
  --secondary "#36d7e8" \
  --highlight "#642a8c"
```

To tune composition without changing the image, pass the adaptive fields to
the image loader:

```bash
~/.codex/codex-dream-skin-studio/scripts/load-image-theme-macos.sh \
  --file "/path/to/image.png" \
  --appearance auto \
  --focus-x 0.72 --focus-y 0.45 \
  --safe-area left --task-mode banner
```

Reset to the bundled abstract demo:

```bash
~/.codex/codex-dream-skin-studio/scripts/customize-theme-macos.sh --reset-demo
```

## License

MIT — see `LICENSE`. Additional notices in `NOTICE.md` cover trademarks,
runtime Node, user-provided artwork, third-party rights, and assets that are not
licensed under the software license.


## What this is not

- Not an OpenAI product and not a fork of Codex source
- Not a way to patch or rebrand the official binary
- Not a Windows build (see `../windows/`)
- Not an API proxy: theming does not change model providers or API keys
