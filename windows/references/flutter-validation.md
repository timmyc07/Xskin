# Windows Flutter validation — 2026-10-21

Environment: Windows 11 24H2, Flutter stable 3.47.7 / Dart 3.13.5, Visual Studio Build Tools 2022, Node.js 24.22.0. Installed Codex package: OpenAI.Codex 26.1013.4894.0.

Completed checks:

- Existing Windows engine suite: configuration transactions, Unicode TOML preservation, backup/restore, package/process identity, argument quoting, loopback CDP and early injection.
- New media store tests: import isolation, byte-identical MP4 copies, image/video switching, saved Unicode names and verification-failure rollback including pause state.
- New panel bridge tests: UTF-8 requests/results, imported draft persistence, mask limits, pause and saved-path boundaries.
- Flutter analysis: no issues. Widget tests pass at 1100×800 and 600×800, including Apply, Pause/Resume and a missing-Node startup error.
- Native Windows integration: public W3C Sintel MP4 decodes at 854×480, produces a PNG poster, starts paused/muted, and switches play/pause successfully.
- Release x64 build and portable ZIP packaging. Actual Flutter window and native file picker inspected using Windows UI automation. No system execution-policy change.

The running Codex app hosts this development conversation and was left running without a forced restart. Live injection into this Codex build, video reload inside its renderer, and home/task visual signoff still require manual Apply followed by the existing verify command. Those checks are not claimed as completed. `verify-dream-skin.ps1` checks media playback, skin markers and the interactive shell; failed Apply restores the previous theme.

Repeat the decoder check with a local MP4:

```powershell
cd windows/panel
flutter test integration_test/video_test.dart -d windows --dart-define=TEST_VIDEO=D:\media\sample.mp4
```

The tested public sample was https://media.w3.org/2010/05/sintel/trailer.mp4 . Its media is not included in the source or release package.
