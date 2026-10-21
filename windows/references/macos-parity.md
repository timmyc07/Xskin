# macOS 1.5.1 → Windows 1.5.2

| Mac source / behavior | Windows implementation | Validation |
| --- | --- | --- |
| `native/Xskin.swift` preview/source/preferences, pending/apply gates, paused original video, dimensions, hidden-window cleanup | Flutter `panel/lib/main.dart`; preview is separate from import; Apply requires a ready pending selection | Responsive widget tests and native full-panel integration with the actual 3840×2160 pending MP4; import/preview 2,015 ms on the development machine |
| `native/Localization.swift`, four persisted languages | `panel/lib/localization.dart`; `studio.json` preferences and Flutter SDK localizations | All message rows contain four languages; live widget switching to Traditional Chinese |
| Native single-file drop | `desktop_drop` package | Invalid multi/empty drop rejected; Windows plugin build |
| `background-studio.mjs` original MP4 import with still fallback | `xskin-command.ps1` / `New-XskinImport`; no screenshot/base64 prerequisite | Original bytes preserved, active theme isolated, pending draft replaced safely |
| `sips` common image normalization and limits | Windows Imaging Component, 4096px JPEG quality 90, 50 MiB / 16384px / 50MP source and 16 MiB output limits | JPEG and TIFF conversion, source size rejection, WebP fixture on this machine; HEIF/WebP use Windows codecs |
| Independent global mask / rollback | `Set-XskinMask`, atomic metadata-only update; no media copies or player reopen | Forced failure restores exact previous metadata and preserves pending selection |
| Direct-launch Dock entry / panel may stay closed | Owned Desktop + Start **Codex (Xskin)** shortcuts pointing at managed engine; no replacement of Store/taskbar entries | Enable/disable and ownership tests; disable preserves unrelated shortcuts |
| `assets/renderer-inject.js`, `assets/dream-skin.css` | Mac renderer and stylesheet with Windows mutation filtering; no legacy Windows selector layer | Mac renderer regression scenarios plus content/structural/page-activation checks; see [performance](performance.md) |
| Current shell target detection | Current `data-app-shell-active-page`, `data-app-shell-main-surface`, composer and sidebar markers | Early-generation tests; replaces the obsolete `main.main-surface` probe that caused the reported verification failure |
| Exact-theme, mask and advancing-video verification | Mac verifier integrated with Windows loopback/process/package/Browser-ID checks | Rejects a frozen playhead and a previous theme; actual 4K playback, decoded-frame progress, home/task views and reload verified |
| Standalone runtime | Bundled Node.js plus license; managed `assets/scripts` engine | Release smoke test with no Node in PATH |
| Pause, restore, saved themes | Existing Windows transactions retained and connected to the panel; Pause/Restore disable automatic entry | UTF-8, path boundaries, original media, saved names and forced apply rollback tests; live Pause/Resume and mask restoration passed |

The native OS mechanisms differ: SwiftUI/AVKit/sips/Dock on Mac; Flutter/media_kit/WIC/Desktop+Start on Windows. Unsupported Windows image codecs fail explicitly. The Windows Store package, signatures, credentials and API/provider configuration are never modified.

Live Codex playback, reload and home/task visual validation are recorded in [Flutter validation](flutter-validation.md). Screenshots and session-specific identifiers stay in ignored build output, not Git.
