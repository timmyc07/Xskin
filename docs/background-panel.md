# Xskin user guide

Xskin is a standalone native macOS app. Import local images or MP4s, inspect a native preview, and apply them as Codex backgrounds from one focused window.

## Install and open

[Download Xskin 1.8.3 for macOS](https://github.com/timmyc07/Xskin/releases/tag/v1.8.3), extract the archive, and move **Xskin.app** to Applications. Windows users should download the separate [Windows 1.8.2 package](https://github.com/timmyc07/Xskin/releases/tag/windows-v1.8.2). The prebuilt macOS app requires **macOS 13 or later, Apple Silicon, and official Codex Desktop**. It uses a verified runtime bundled with Codex; no separate Node.js, package manager, or Xcode installation is needed.

The release uses an ad-hoc signature and has not been notarized with Apple Developer ID. macOS may show a source verification warning. Confirm that the download came from this project's Release page before opening it.

You can also install the Codex plugin to launch the same native app. Extract the plugin ZIP, keep the complete `codex-background-studio` folder, and run these commands inside it:

```sh
codex plugin marketplace add .
codex plugin add codex-background-studio@codex-background-studio-local
```

Ask Codex to “Open Xskin” to launch its independent native window. Plugin installation normally places the app at `~/Applications/Xskin.app`.

## Import, preview, and apply

1. Choose a local image or MP4 with the file picker, or drag one file into Xskin.
2. Inspect the preview, resolution, and file size. Video preview starts paused; use its native playback controls when needed.
3. Apply the background after checking the preview. Xskin checks actual playback and layout before reporting success.

Opening Xskin or importing a file does not replace the current background. Pending imports remain on your Mac across app sessions. If applying fails, Xskin restores the previous configuration and keeps the import for retry; if recovery itself fails, the app reports that separately.

## Adjust the full-window mask

The **mask-depth slider** adjusts all background surfaces together from **0–100%**, with a **62% default**. Higher values make the background darker. Drag to update the preview, then release to apply automatically. Keyboard adjustments also apply.

Mask depth persists locally. The mask is a visual overlay: it does not re-encode or alter the media, and the preview and background continue to use the prepared media at its existing quality.

## Choose your interface language

English is the default. Use the in-app language selector to switch to **Traditional Chinese**, **Simplified Chinese**, or **Japanese**. Your selection is saved locally and restored the next time Xskin opens.

## Open Codex with the saved background

1. Apply the background you want to keep.
2. On macOS, enable **Apply when official Codex opens**. Open the official app as usual; a new ordinary launch gracefully reopens once with the background. The panel can stay closed, including after login. An already-open session is left alone, and a refused quit is never forced.
3. On Windows, enable **Use background from Codex (Xskin)**. Fully exit Codex, then open **Codex (Xskin)** from Desktop/Start. The panel can stay closed. Windows never automatically closes/reopens Codex.

The optional macOS ~/Applications/Codex (Xskin).app starts directly with the background connection, avoiding the reopen. Pin it using normal system UI if preferred. Paused/disabled entries open ordinary Codex and retain pause. Upgrades manage only verified Xskin services/shortcuts and preserve media, language and opacity. Historical managed Dock pins are restored; new setup does not replace official pins automatically.

A cold start still needs app loading and media decoding. CDP/CSS injection authorization is unconfirmed; see [validation and recovery](direct-launch-shortcut.md).

## Conversation usage

macOS 1.8.3 / Windows 1.8.2 place usage in a translucent strip **above** the task input. Long metrics wrap within the available width; the native project/files/plugins toolbar retains its own placement and controls. Home has no empty usage strip. Composer and toolbar surfaces reveal the selected background, with matching translucent material in video mode.

Long local histories recover their earlier usage without waiting for another event. Unknown usage shows a waiting/reconnecting label; it is not displayed as an all-empty metric row. Native header and settings/menu materials use the shared tint, with actual-route visual validation still pending.

## Media and playback limits

| Type | Formats | Limit | Preparation |
| --- | --- | --- | --- |
| Images | JPG, PNG, WebP, HEIC, TIFF | 50 MiB | Converted to JPEG, up to 4096 pixels on the longest edge. Small images are not enlarged. |
| Video | MP4; H.264 recommended | 256 MiB | Original bytes, resolution, and frame rate preserved without transcoding, including 4K. |

Imports create local copies and leave original files intact. MP4 playback depends on its codec and the system decoder. Higher-resolution or higher-frame-rate media can use more resources. Background video is muted and loops; playback pauses when the Codex window is hidden or Reduce Motion is enabled.

## Privacy and compatibility

- Media is processed locally; Xskin does not upload your imported files to the cloud.
- No additional account or OpenAI API key is required. Codex account credentials, API keys, and model provider settings are not changed.
- The background engine uses a loopback-only debugging connection and does not modify the official app bundle or signature. Avoid untrusted local software while it is active.
- The macOS release ships an arm64 macOS app, not a Windows native app or Intel Mac prebuilt binary.
- Codex updates may affect appearance or launch compatibility. Disable automatic apply and report version details if problems occur.
- Xskin is independent and is not endorsed by or affiliated with OpenAI or Apple.

## Design and source builds

The interface uses SwiftUI, AppKit, and AVKit, without WebView, an HTTP panel server, or a third-party UI framework. See the [historical design notes](panel-design.md) and [product README](../README.md).

Source builds require macOS and Xcode Command Line Tools:

```sh
bash macos/scripts/build-native-studio.sh '/path/Xskin.app'
bash macos/scripts/build-plugin-release.sh
```

For wider distribution, provide an appropriate Developer ID signature and notarization. The current release is ad-hoc signed.
