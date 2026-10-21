<div align="center">

# Xskin

### Make Codex feel like your workspace.

Bring your favorite images and original 4K videos into Codex.<br>
Import, preview, and apply from one focused, native macOS app.

[![Version](https://img.shields.io/badge/version-1.5.1-dceda0?style=flat-square)](https://github.com/timmyc07/Xskin/releases/tag/v1.5.1)
![macOS 13+](https://img.shields.io/badge/macOS-13%2B-202420?style=flat-square&logo=apple&logoColor=white)
![Apple Silicon](https://img.shields.io/badge/Apple_Silicon-arm64-202420?style=flat-square)
[![MIT License](https://img.shields.io/badge/license-MIT-202420?style=flat-square)](macos/LICENSE)

**[Download Xskin 1.5.1](https://github.com/timmyc07/Xskin/releases/tag/v1.5.1)** · [User guide](docs/background-panel.md) · [Report an issue](https://github.com/timmyc07/Xskin/issues)

English by default · Traditional Chinese · Simplified Chinese · Japanese

**Windows:** a Flutter desktop panel with image/MP4 preview and background controls is available in [`windows/`](windows/README.md). Build the Windows ZIP or download the **Xskin-Windows** artifact from the Windows Flutter workflow on the Windows branch. The macOS download above remains the macOS release.

</div>

![Xskin native macOS application](docs/images/xskin.png)

## Your media. Your atmosphere.

A quiet photograph. A moving landscape. A workspace that feels a little more like you. Xskin brings your chosen media into Codex while keeping the familiar conversations, projects, and controls at the center of your work.

| Choose your scene | See it before you apply | Feel at home on macOS | Keep your setup |
| --- | --- | --- | --- |
| Import local images and MP4s, including original 4K video. | Check the composition, resolution, and file size in a native preview. | Use system file selection, drag and drop, and native playback controls. | Keep your background, mask depth, pending import, and language preference locally. |

## From media to workspace in three steps

1. **Import** an image or MP4 with the file picker, or drag one into Xskin.
2. **Preview** the composition and media details. Video starts paused; use the native controls to play it. Importing does not replace the current background.
3. **Apply** when you are ready. Xskin checks the result, restores the previous configuration if applying fails, and retains the import for retry.

Download and extract the app, move **Xskin.app** to Applications, and open it. The prebuilt app requires no separate Node.js installation, package manager, or Xcode.

> v1.5.1 uses an ad-hoc signature and has not been notarized with Apple Developer ID. macOS may show a source verification warning. Download from this project's Release page and review the [user guide](docs/background-panel.md).

## Details that make room for your work

### Keep 4K in its original form

MP4 files retain their original bytes, resolution, and frame rate. There is no re-encoding or forced conversion to 1080p. If your source is 4K, Xskin uses that same 4K media.

### Set the balance between atmosphere and readability

Muted, looping video, a full-window black mask, and a transparent sidebar create one continuous background. Codex conversations, projects, and input controls remain interactive.

One **mask-depth slider** adjusts all surfaces together from **0–100%**, with a **62% default**. The preview updates while dragging; release the slider to apply automatically. Keyboard adjustments also apply, and the value persists locally. The mask changes the visual overlay without modifying the image or video.

### Use the language that works for you

Xskin opens in **English** by default. Switch the interface to **Traditional Chinese**, **Simplified Chinese**, or **Japanese** inside the app. Your choice is remembered for the next session.

### Let playback follow your attention

Video preview starts paused so you can inspect it when needed. Background playback pauses when the Codex window is hidden or system Reduce Motion is enabled, avoiding playback you are not watching.

### Pick up where you left off

Keep your current background and any pending import on your Mac. Turn on **Apply on Codex launch** once, then open Codex from the Dock shortcut Xskin prepares. Your background loads with Codex; Xskin does not need to stay open.

The Dock entry enables the background connection on the first launch, then applies your media and full-window mask as the workspace loads. It never quits and relaunches Codex to apply a background. Turn the option off to restore your original Dock entry.

## Supported media

| Type | Formats | File limit | Processing |
| --- | --- | --- | --- |
| Images | JPG, PNG, WebP, HEIC, TIFF | 50 MiB | Converted to JPEG, up to 4096 pixels on the longest edge. Smaller images are not enlarged. |
| Video | MP4; H.264 recommended | 256 MiB | Original file preserved without re-encoding, including 4K sources. |

Imports create local copies and leave source files intact. MP4 is a container format; playback depends on the video codec and system decoder support.

## Your media stays on your Mac

- **Local media processing.** Xskin does not upload imported images or videos to the cloud.
- **No additional account.** It does not ask for an OpenAI API key or change Codex account credentials, API keys, or model provider settings.
- **Official app files remain intact.** The background engine applies appearance changes through a local connection without modifying the official app bundle or its code signature.
- **An implementation you can inspect.** The interface uses SwiftUI, AppKit, and AVKit, with no WebView, HTTP panel server, or third-party UI framework. The background engine uses a verified Node runtime bundled with official Codex Desktop.

The debugging connection binds only to the loopback address. Xskin remains an external customization tool: download it from trusted sources and avoid running untrusted local programs.

## Requirements and practical limits

| Item | Requirement |
| --- | --- |
| Operating system | macOS 13 or later |
| Processor | Apple Silicon; the v1.5.1 prebuilt app is arm64 |
| Required software | Official Codex Desktop, with a bundled runtime that passes verification |
| Installation | Standalone app; an optional Codex plugin launches the same app. See the [user guide](docs/background-panel.md). |
| Interface languages | English, Traditional Chinese, Simplified Chinese, and Japanese |

- The v1.5.1 download targets macOS arm64. The separate [Windows Flutter app](windows/README.md) has its own build and requirements; no Intel Mac prebuilt binary is provided.
- Automatic startup prepares a separate managed entry at `~/Applications/Codex (Xskin).app` and connects it to the Dock; the official app bundle remains unchanged. Opening the original official `.app` path directly leaves it running without an automatic background. Use the managed Dock entry for background-enabled launches.
- A cold start still needs application loading and media decoding. Startup time depends on app state, media, and hardware; no fixed latency is guaranteed. See the [measured startup results](docs/startup-verification.md).
- Codex updates may change the interface or launch behavior and affect background application. Disable automatic apply and report version details if problems occur.
- 4K decoding and playback load depend on frame rate, codec, and Mac hardware. Preserving original quality does not guarantee identical resource use across files.
- Xskin is an independent open-source project, with no official affiliation with or endorsement from OpenAI or Apple.

<details>
<summary><strong>Build and contribute</strong></summary>

Source builds require macOS and Xcode Command Line Tools. The native interface is in [`macos/native/Xskin.swift`](macos/native/Xskin.swift); the background engine is in [`macos/scripts/`](macos/scripts/).

```sh
git clone https://github.com/timmyc07/Xskin.git
cd Xskin
bash macos/scripts/build-native-studio.sh "$PWD/build/Xskin.app"
```

Run the existing macOS checks:

```sh
cd macos
npm test
```

An initial manual Apply may ask for one confirmed restart when Codex was opened without the background connection. Later managed Dock launches do not restart it. Include system, Codex, and Xskin versions with reproducible steps when contributing. Do not submit private chats, media, or credentials.

</details>

## Open source and acknowledgments

Xskin is released under the [MIT License](macos/LICENSE). It builds on [Codex Dream Skin Themes](https://github.com/aithink001/Codex-Dream-Skin-Themes) and [Codex Dream Skin](https://github.com/Fei-Away/Codex-Dream-Skin). Thank you to the upstream contributors for the theme engine and workflows. See [NOTICE](macos/NOTICE.md) for attribution and license details.

Codex, OpenAI, macOS, Apple, and other product names and trademarks belong to their respective owners. Use and share only background media you have the right to use.

---

**Bring your favorite scene into your everyday work.** [Download Xskin →](https://github.com/timmyc07/Xskin/releases/tag/v1.5.1)
