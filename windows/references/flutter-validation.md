# Windows Flutter validation — 2026-10-21

Environment: Windows 11 24H2, Flutter stable 3.47.7 / Dart 3.13.5, Visual Studio Build Tools 2022, bundled Node.js 24.22.0. Live validation used OpenAI.Codex 26.1016.6573.0.

Windows 1.5.1 checks completed:

- Full Windows engine suite: strict UTF-8 configuration transactions, Unicode TOML preservation, backup/restore, package/process identity, command-line quoting, loopback CDP, early injection and original video handoff.
- Mac renderer scenarios run against Windows assets: adaptive home/task layout, hidden first-frame preparation, video lifecycle, cleanup and exact expected-theme verification. Frozen playback and stale themes are rejected.
- Media and panel bridge: original MP4 bytes, active-theme isolation, saved Unicode names, apply rollback, pending/settings persistence, independent metadata-only mask rollback, WIC JPEG/TIFF conversion, source-size limits and launch-shortcut ownership. WebP conversion also passed with an installed Windows codec.
- Flutter analysis reports no issues. All six tests pass, including responsive layouts at 1100×800 and 600×800, Apply/Pause, independent mask/preferences, Traditional Chinese, failed-import gating, recoverable startup errors and large UTF-8 file requests.
- Native Windows integration drives the real Import handler with a test file selector, real media_kit decoder and real PowerShell bridge. The public W3C Sintel fixture imports/previews in 2,002 ms. The actual pending 3840×2160, 26,595,461-byte original MP4 imports/previews in 2,015 ms, enables Apply, preserves the active theme and original bytes, and plays/pauses while muted. Measurements are specific to this machine and media.
- The release 1.5.1 x64 portable package builds successfully. Its bridge starts using bundled Node with global Node removed from PATH; the Node license is included. Native UI inspection confirms the packaged version, decoded 4K preview and enabled Apply button.

The reported verification failure came from the retired Windows main.main-surface selector. Windows now uses the Mac renderer's current active-page and main-surface markers. MP4 import no longer waits for screenshot extraction or a PNG/base64 request.

Live Codex validation completed with the original 26,595,461-byte MP4 and managed, bundled-Node engine:

- Apply preserved the original video SHA-256 and verified the selected theme, 3840×2160 decoded dimensions, 62% full-window mask and progressing playback. No video transcoding or screenshot prerequisite.
- Home: playhead advanced from 1.413s to 2.681s with 38 additional decoded frames in approximately 1.2s. Video was unpaused, muted and looping with no media error. The home screenshot was visually inspected.
- Conversation: playhead advanced from 14.942s to 16.155s with 36 additional decoded frames. Task layout, sidebar and composer remained visible with no document overflow. The conversation screenshot was visually inspected.
- Renderer reload: the watcher restored the video automatically; playhead advanced from 0.495s to 1.802s with 39 additional decoded frames.
- Reduced Motion paused decoded video; clearing the temporary emulation resumed advancing playback. The user's OS settings were not changed.
- Independent mask update verified at 50%, then restored to 62%. Pause removed the skin and video; Resume restored 4K playback, adding 37 decoded frames in approximately 1.2s. Final state is enabled at the original 62% mask.

The first live test exposed a missing `theme.videoBytes` in the Windows injector. The shared Mac renderer correctly rejected that incomplete file contract. Windows now supplies the original byte length, retains the renderer's detailed error, and tests that handoff contract.

Restarting the host app terminates tool-owned child processes. The final live Apply and probes ran in an independent interactive-user Windows process and recorded results under ignored `build/live-validation`. This also avoids the Store host's AppData file virtualization when inspecting the ordinary Windows engine. The injector still enforces canonical path containment and verified loopback browser/process identity. No official app files or system security settings were modified.

Repeat the native panel check with a local MP4:

```powershell
cd windows/panel
flutter test integration_test/video_test.dart -d windows --dart-define=TEST_VIDEO=D:\media\sample.mp4
```

The public sample is https://media.w3.org/2010/05/sintel/trailer.mp4 . Test media, screenshots, private chat content and session-specific identifiers are excluded from Git and release packages. HEIC conversion has not been tested with a real HEIC fixture; support requires the corresponding Windows codec.
