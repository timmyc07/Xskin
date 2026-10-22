# Startup verification

## Windows 1.6.0 — Original-app automatic startup

Validated on 2026-10-22 on Windows with the registered Microsoft Store `OpenAI.Codex` package 26.1016.6573.0.

- The installed 1.6.0 app and managed engine match the tested source. Automatic apply is enabled and the background monitor is running with the Xskin panel closed.
- The official app exited through Windows Restart Manager without a force flag and stayed closed until its registered AppsFolder entry was opened through the Windows Shell Open verb. An ordinary native main process was observed before the automatic handoff created one stable background-enabled process and a new verified browser connection.
- The saved original 3840×2160 video advanced by 46 frames with zero additional dropped frames in the initial sample. A later read-only 30-second check decoded 902 frames with one additional dropped frame; the same main process and browser connection remained active.
- The selected uniform 62% mask verified. Theme, media, preferences and Codex configuration hashes were unchanged. The official ASAR digest was also unchanged.
- Real Windows GUI fixtures prove that closing a tray-style window leaves it running, the session-end request exits it, and a refused shutdown is not forced. Identity/age/session guards, duplicate/loop prevention, pause, monitor lifecycle, upgrade rollback and owned-shortcut migration are covered by the Windows regression suite.

The native entry was activated through the Windows Shell, without synthesizing a physical mouse click. A new Windows login was not tested. The later playback check was read-only and preserved the running app. Cold launch includes official app loading, the one-time handoff and video decoding; no fixed startup latency or sustained-resource reduction is claimed.

## macOS 1.6.1 — Native Work detection and earlier automatic apply

Validated on 2026-10-22 on Apple Silicon with official Codex 26.1016.51333 and its signed Node.js v24.21.0.

- Full macOS regression tests pass, with additional native-notification and late React-shell checks. A completed document can gain its shell later without entering the previous five-second rejection cooldown. Pending auxiliary windows receive no theme or video, and their guards are cancelled before disconnection.
- Opened the original `/Applications/ChatGPT.app` through Launch Services without debugging arguments. The enabled service completed its automatic handoff; independent live verification and `doctor --require-live` passed.
- Two fresh application launches showed the saved artwork after approximately 8 and 12 seconds, with decoded original 3840 × 2160 video shortly afterwards. These timings include the handoff and application loading, use whole-second request timestamps, and are observations rather than a controlled performance benchmark or zero-latency guarantee.
- Subsequent main-window, Dot card and hidden Work checks passed. Main-window and Dot video decoded and advanced; hidden Work remained intentionally suspended without decoding. The selected uniform 62% mask and transparent inner messaging layers verified.
- The installed Xskin app and engine report 1.6.1. The enabled service is loaded, configuration and selected media remain byte-identical, and the official application signature remains valid.

The entire Mac was not rebooted. Home/task visual navigation and visible embedded Work playback were not manually inspected. Background preloading remains disabled; the app starts on demand. Windows was not rebuilt for this macOS release.

## macOS 1.6.0 — Windows parity and original-app automatic apply

Validated on 2026-10-22 on Apple Silicon with official Codex 26.1016.51333 and its signed Node.js v24.21.0.

- Full macOS regression suite passes, including fresh-launch PID/start-time/age checks, the 30-second loop guard, skipped existing/debug sessions, refused graceful quits, active/paused engine upgrades, and failed-upgrade rollback.
- The installed 1.6.0 engine and `doctor --require-live` pass. A live Dot surface decodes and advances the original 3840 × 2160 video, with visible card clipping and the selected mask verified. The hidden Codex surface retains a decoded paused frame; the preloaded hidden Work surface is explicitly host-suspended without decoding. Native inner messaging layers are clear.
- The enabled LaunchAgent is loaded, and previously managed Dock entries now point to the original official app and its bundle identity. Replacing the engine retained the same running official application process.
- Configuration, theme JSON, poster, and original video remain byte-identical across the upgrade. The official application signature remains valid.

The fresh-launch flow is covered by executable fixtures; this session did not close and cold-reopen the user’s active Codex app. Computer Use refused to control the Codex application, so Home/task visual navigation and visible Work activation were not manually inspected. Hidden Work verification is evidence of correct suspension, not proof of visible Work video playback. Windows-only PowerShell, Flutter, Store activation, and GPU-accounting changes were not run on this Mac. No continuous-playback resource reduction or fixed startup latency is claimed.

## Historical 1.5.x measurements

Tested on 2026-10-21 with macOS 26.6.2 on Apple Silicon and official Codex 26.1013.40934.

## 1.5.1 — Dock launch regression

The reported failure was reproduced in Dock preferences: the displayed file URL pointed to **Codex (Xskin)**, but its internal bookmark resolved to the original official app and its bundle identifier remained `com.openai.codex`. The resulting process had no background connection.

The fix clears the old bookmark and file timestamps, sets the managed bundle identity, and repairs existing entries instead of treating their displayed URL as proof of success. The original Dock backup remained byte-for-byte unchanged during the live repair.

The new test resolves the effective target from Dock preferences, including its bookmark when present, then opens that target through normal Launch Services without forcing a new instance. Xskin remained closed. Native process identities were observed for 15 seconds.

| Check | Result |
| --- | --- |
| Effective Dock target and bundle identity | Correct managed entry |
| Distinct Codex application processes during startup | 1 |
| Opening the resolved Dock entry again | Same process; no restart |
| Video | Original H.264, 3840 × 2160, 60 fps; decoded and advancing |
| Overlay | 62%, uniform and full-window |
| Main, sidebar, and header backgrounds | Transparent beneath one overlay |
| Native Xskin app | Closed |
| First overlay ready | 6.361 s |
| First decoded 4K frame | 7.002 s |
| Startup verification completed | 7.137 s |
| Independent verification completed | 7.922 s |

The full macOS suite and live Home/task route verification passed, including stale, corrupt, and mismatched bookmark regression checks. The test exercises the Dock's resolved target through Launch Services; it does not synthesize a physical Dock mouse click.

## 1.5.0 — Historical direct-file baseline

The previous test opened the managed app file directly and therefore missed the stale Dock bookmark. It verified media application but did **not** establish correct Dock routing. Its first decoded 4K frame was observed at 7.048 seconds and independent verification finished at 8.136 seconds.

## Historical 1.5.x limits and other checks

These measurements come from one cold application launch per version on this Mac, not a performance guarantee. Application loading and media decoding still take time; no instantaneous first frame is claimed.

Opening the original official app directly leaves it running without an automatic background. Use the repaired managed Dock entry for background-enabled launches. Automatic quit-and-relaunch behavior remains removed.

The media import, rollback, configuration round-trip, safe injector shutdown, early document bootstrap, and four-language checks passed. Public archives exclude local videos, private screenshots, credentials, and test state. Official application files and signatures remain unchanged.
