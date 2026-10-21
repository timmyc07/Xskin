# Windows Flutter validation — 2026-10-21

Environment: Windows 11 24H2, Flutter stable 3.47.7 / Dart 3.13.5, Visual Studio Build Tools 2022, bundled Node.js 24.22.0. Installed Codex package: OpenAI.Codex 26.1013.4894.0.

Windows 1.5.1 checks completed:

- Full Windows engine suite: strict UTF-8 configuration transactions, Unicode TOML preservation, backup/restore, package/process identity, command-line quoting, loopback CDP, early injection and original video handoff.
- Mac renderer scenarios run against Windows assets: adaptive home/task layout, hidden first-frame preparation, video lifecycle, cleanup and exact expected-theme verification. Frozen playback and stale themes are rejected.
- Media and panel bridge: original MP4 bytes, active-theme isolation, saved Unicode names, apply rollback, pending/settings persistence, independent metadata-only mask rollback, WIC JPEG/TIFF conversion, source-size limits and launch-shortcut ownership. WebP conversion also passed with an installed Windows codec.
- Flutter analysis reports no issues. All six tests pass, including responsive layouts at 1100×800 and 600×800, Apply/Pause, independent mask/preferences, Traditional Chinese, failed-import gating, recoverable startup errors and large UTF-8 file requests.
- Native Windows integration drives the real Import handler with a test file selector, real media_kit decoder and real PowerShell bridge. The public W3C Sintel fixture imports/previews in 2,002 ms. The actual pending 3840×2160, 26,595,461-byte original MP4 imports/previews in 2,015 ms, enables Apply, preserves the active theme and original bytes, and plays/pauses while muted. Measurements are specific to this machine and media.
- The release 1.5.1 x64 portable package builds successfully. Its bridge starts using bundled Node with global Node removed from PATH; the Node license is included. Native UI inspection confirms the packaged version, decoded 4K preview and enabled Apply button.

The reported verification failure came from the retired Windows main.main-surface selector. Windows now uses the Mac renderer's current active-page and main-surface markers. MP4 import no longer waits for screenshot extraction or a PNG/base64 request.

Live Codex playback and home/task visual validation will be recorded below after the actual managed-engine Apply. Fixture tests and Flutter preview playback alone do not establish live Codex playback.

Repeat the native panel check with a local MP4:

```powershell
cd windows/panel
flutter test integration_test/video_test.dart -d windows --dart-define=TEST_VIDEO=D:\media\sample.mp4
```

The public sample is https://media.w3.org/2010/05/sintel/trailer.mp4 . Test media, screenshots, private chat content and session-specific identifiers are excluded from Git and release packages. HEIC conversion has not been tested with a real HEIC fixture; support requires the corresponding Windows codec.
