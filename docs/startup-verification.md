# Startup verification

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

## Limits and other checks

These measurements come from one cold application launch per version on this Mac, not a performance guarantee. Application loading and media decoding still take time; no instantaneous first frame is claimed.

Opening the original official app directly leaves it running without an automatic background. Use the repaired managed Dock entry for background-enabled launches. Automatic quit-and-relaunch behavior remains removed.

The media import, rollback, configuration round-trip, safe injector shutdown, early document bootstrap, and four-language checks passed. Public archives exclude local videos, private screenshots, credentials, and test state. Official application files and signatures remain unchanged.
