# Xskin user guide

Xskin is a standalone native macOS app. Import local images or MP4s, inspect a native preview, and apply them as Codex backgrounds from one focused window.

## Install and open

[Download Xskin](https://github.com/timmyc07/Xskin/releases), extract the archive, and move **Xskin.app** to Applications. The prebuilt app requires **macOS 13 or later, Apple Silicon, and official Codex Desktop**. It uses a verified runtime bundled with Codex; no separate Node.js, package manager, or Xcode installation is needed.

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

## Apply whenever the official Codex app opens

1. Apply the background you want to keep.
2. Enable **Apply on Codex launch**.
3. Open the original official Codex app from Finder, Spotlight, or the Dock. **Xskin does not need to stay open.**

The background service gracefully reopens each new ordinary session once to establish its background connection. Existing windows are skipped, refused quits are never forced, and a 30-second guard prevents restart loops. Avoid entering unsent text during that startup handoff. Signing in or quitting Codex never opens it automatically.

Previously managed Dock entries are restored to the official app when this option is enabled. Official application files and signatures remain unchanged. Disable the option, Pause, or Restore to stop future automatic handoffs; disabling it alone leaves the current background playing. An already-open ordinary session still needs one confirmed manual Apply.

A cold start requires application loading and media decoding; no fixed latency is guaranteed.

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
