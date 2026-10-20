<div align="center">

# Xskin

### Make Codex feel like your workspace.

Bring your favorite images and original 4K videos into Codex.<br>
Import, preview, and apply from one focused, native macOS app.

**[Download Xskin 1.4.0](https://github.com/timmyc07/Xskin/releases/tag/v1.4.0)** · [繁體中文](README.md) · [User guide](docs/background-panel.md)

macOS 13+ · Apple Silicon · MIT License
</div>

![Xskin native macOS application](docs/images/xskin.png)

## Your media. Your atmosphere.

- **Native from the start.** SwiftUI, AppKit, and AVKit, with system file selection, drag and drop, and native playback controls. No WebView or HTTP panel server.
- **Original 4K video.** MP4 files retain their original bytes, resolution, and frame rate. No transcoding or forced 1080p conversion.
- **A coherent workspace.** Muted, looping video backgrounds, a full-window black mask, and a transparent sidebar keep Codex usable over your chosen media.
- **One mask control.** Adjust all surfaces together from 0–100%, with a 62% default. Preview updates while dragging; release to apply automatically. Keyboard changes also apply, and the setting persists locally. The visual mask never changes the media itself.
- **Ready for the next session.** Keep your current background and pending import locally. Enable automatic apply to load your background when opening Codex normally.
- **A deliberate apply step.** Importing media does not replace the current background. Apply checks the result; failures restore the previous configuration and keep the import for retry.

## Start in three steps

1. **Import** an image or MP4 using the file picker, or drag one into Xskin.
2. **Preview** the composition, resolution, and file size. Video preview starts paused; use the native controls to play it.
3. **Apply** the background after checking the preview.

Download and extract the app, move **Xskin.app** to Applications, and open it. The prebuilt app requires no separate Node.js installation, package manager, or Xcode. An optional Codex plugin launches the same native app; see the [user guide](docs/background-panel.md).

## Supported media

| Type | Formats | Size limit | Processing |
| --- | --- | --- | --- |
| Images | JPG, PNG, WebP, HEIC, TIFF | 50 MiB | Converted to JPEG, up to 4096 pixels on the longest edge. Smaller images are not enlarged. |
| Video | MP4; H.264 recommended | 256 MiB | Original file preserved without re-encoding, including 4K sources. |

Imports create local copies and leave source files intact. MP4 playback depends on the source codec and system decoder support. Background playback pauses when the window is hidden or Reduce Motion is enabled.

## Local by design

Xskin does not upload imported media to the cloud or require an additional account or OpenAI API key. It does not change Codex account credentials, API keys, or model provider settings.

The background engine uses a verified Node runtime bundled with official Codex Desktop and a loopback-only debugging connection. It does not modify the official application files or code signature. Download from trusted sources and avoid running untrusted local programs.

## Requirements and limitations

- **macOS 13+ and Apple Silicon.** The v1.4.0 prebuilt app is arm64; no Windows native app or Intel Mac binary is provided.
- **Official Codex Desktop must be installed**, with a bundled runtime that passes verification.
- **Not notarized.** v1.4.0 uses an ad-hoc signature, without Apple Developer ID notarization. macOS may show a source verification warning.
- **Startup handoff takes time.** Automatic apply uses a local background service and may briefly reopen Codex. It is not an official, zero-delay startup feature. Save unsent input before testing restart behavior.
- **Compatibility can change.** Codex updates may affect appearance or launch behavior. Disable automatic apply and report version details if problems occur.
- **4K has a cost.** Playback load depends on frame rate, codec, and hardware; retaining original quality does not guarantee identical resource use across files.

Xskin is an independent project and is not endorsed by or affiliated with OpenAI or Apple.

<details>
<summary><strong>Build and contribute</strong></summary>

Source builds require macOS and Xcode Command Line Tools.

```sh
git clone https://github.com/timmyc07/Xskin.git
cd Xskin
bash macos/scripts/build-native-studio.sh "$PWD/build/Xskin.app"
cd macos && npm test
```

See [the native app source](macos/native/Xskin.swift), [user guide](docs/background-panel.md), and [changelog](macos/CHANGELOG.md). Include reproducible steps and version details in [issues](https://github.com/timmyc07/Xskin/issues); never submit private chats, media, or credentials.
</details>

## Open source and acknowledgments

Released under the [MIT License](macos/LICENSE). Xskin builds on [Codex Dream Skin Themes](https://github.com/aithink001/Codex-Dream-Skin-Themes) and [Codex Dream Skin](https://github.com/Fei-Away/Codex-Dream-Skin). Thank you to the upstream contributors; see [NOTICE](macos/NOTICE.md).

Product names and trademarks belong to their respective owners. Use and share only background media you have the right to use.
