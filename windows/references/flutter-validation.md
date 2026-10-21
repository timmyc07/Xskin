# Windows Flutter validation — 2026-10-21

Environment: Windows 11 24H2, Flutter stable 3.47.7 / Dart 3.13.5, Visual Studio Build Tools 2022, Node.js 24.22.0. Installed Codex package: OpenAI.Codex 26.1013.4894.0.

Completed checks:

- Existing Windows engine suite: configuration transactions, Unicode TOML preservation, backup/restore, package/process identity, argument quoting, loopback CDP and early injection.
- New media store tests: import isolation, byte-identical MP4 copies, image/video switching, saved Unicode names and verification-failure rollback including pause state.
- New panel bridge tests: UTF-8 requests/results, imported draft persistence, mask limits, pause and saved-path boundaries. A 1 MiB Dart request completes through the PowerShell bridge; temporary request files and directories are removed after success and failure.
- Flutter analysis: no issues. Widget tests pass at 1100×800 and 600×800, including Apply, Pause/Resume and a missing-Node startup error.
- Native Windows integration drives the real Flutter panel's Import button with a test file selector, real media_kit decoder and real PowerShell bridge. The 4.2 MiB public W3C Sintel MP4 imports in 3,276 ms on this machine, produces a PNG poster, persists byte-identical video bytes, preserves the active theme, enables Apply, and plays/pauses while muted. This measurement is specific to this fixture and machine.
- Release 1.0.2 x64 build and portable ZIP packaging. The initial Flutter window and native file picker were inspected using Windows UI automation. No system execution-policy change.

The subsequent report of indefinite loading was traced to a running 1.0.0 executable and its old stdin-based import process. The user's existing application entry was replaced with 1.0.2, preserving the old binaries separately and leaving media/theme state intact. Windows UI inspection confirmed that the original entry now displays `WINDOWS / FLUTTER · 1.0.2` and is ready for input. Packaged builds now show their version in the panel and license page.

The video import hang was reproduced with a 917,440-character poster request sent by Dart to redirected PowerShell stdin. The request stalled even after draining stdin before initialization. The bridge now passes a temporary UTF-8 request file, validates its path and 24 MiB size limit before reading, and removes it in Dart's `finally` block. The same request returns normally after this change.

The running Codex app hosts this development conversation and was left running without a forced restart. Live injection into this Codex build, video reload inside its renderer, and home/task visual signoff still require manual Apply followed by the existing verify command. Those checks are not claimed as completed. `verify-dream-skin.ps1` checks media playback, skin markers and the interactive shell; failed Apply restores the previous theme.

Repeat the decoder check with a local MP4:

```powershell
cd windows/panel
flutter test integration_test/video_test.dart -d windows --dart-define=TEST_VIDEO=D:\media\sample.mp4
```

The tested public sample was https://media.w3.org/2010/05/sintel/trailer.mp4 . Its media is not included in the source or release package.
