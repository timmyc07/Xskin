# Startup verification — Xskin 1.5.0

Tested on 2026-10-21 with macOS 26.6.2 on Apple Silicon and official Codex 26.1013.40934.

## Single-launch result

The test closed Codex once, opened the managed **Codex (Xskin)** entry without command-line arguments, and observed native process identities for 15 seconds. Xskin remained closed throughout.

| Check | Result |
| --- | --- |
| Distinct Codex application processes during startup | 1 |
| Opening the Dock entry again | Same Codex process; no restart |
| Original video | H.264, 3840 × 2160, 60 fps; original file bytes retained |
| Playback after startup | Decoded and advancing |
| Overlay | 62%, uniform and full-window |
| Main, sidebar, and header backgrounds | Transparent beneath one overlay |
| Native Xskin app | Closed |
| First overlay ready | 6.431 s |
| First decoded 4K frame | 7.048 s |
| Startup verification completed | 7.420 s |
| Independent verification completed | 8.136 s |

These are observations from one cold application launch on this Mac, not a performance guarantee. The earlier 1.4.0 normal-launch handoff took 11.402 seconds through full verification. A cold application launch still needs loading and video decoding; this release does not claim an instantaneous first frame.

The automatic quit-and-relaunch handoff and duplicate launch request were removed. The original official app can still be opened directly, but it is left running without an automatic background. Use the managed Dock entry for background-enabled launches.

## Other checks

The full macOS suite passed, including early injection before HTML creation, safe injector shutdown, original-video preservation, imports and rollback, configuration round trips, and 101 interface strings across four languages. English, Traditional Chinese, Simplified Chinese, and Japanese were also checked in the native interface, including language persistence.

Live verification passed on both Home and task routes.

Public release archives exclude local videos, private screenshots, credentials, and test state. The official app and bundled runtime retained valid signatures.
