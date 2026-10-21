# Windows performance — 2026-10-21

## Unreleased: bounded video integrity checks

The source branch streams the complete MP4 through a **1 MiB buffer**, calculates SHA-256 once, and fingerprints the theme with that digest. The released 1.5.2 implementation allocates the complete video and hashes its bytes twice. Filename, canonical-path, regular-file, container, 256 MiB limit and before/after file-change checks remain enforced. The 30-second full-content audit is retained. Playback, media bytes, resolution, frame rate, mask and renderer are unchanged.

Three fresh Node processes per revision each loaded the same active 26,595,461-byte 3840×2160 MP4 theme 30 times. The table reports medians. It measures repeated **theme loading**, including payload creation; it is not a steady-playback CPU or RAM percentage.

| Measurement | Released 1.5.2 | Streaming change | Change |
| --- | ---: | ---: | ---: |
| Process CPU time, 30 loads | 1,344 ms | 843 ms | −37.3% |
| Peak process RSS | 267.27 MiB | 146.73 MiB | −45.1% |
| Wall time, 30 loads | 1,192.62 ms | 809.10 ms | −32.2% |

CPU samples: **1,375 / 1,344 / 1,312 ms** before, **812 / 891 / 843 ms** after. Peak RSS samples: **267.00 / 267.27 / 267.59 MiB** before, **146.59 / 146.73 / 146.75 MiB** after. The video digest and byte length matched on every load; no transcoding, downscaling, frame-rate cap, forced garbage collection or working-set trimming was used.

### Continuous playback

Live Windows counters include the registered Codex executable's processes and the verified Xskin injector, with the panel closed. CPU is normalized over 16 logical processors. GPU values are engine busy-time percentages summed by engine type, rather than Task Manager's overall GPU number. Private commit and private working set are reported separately; GPU process-memory counters are not used as proof of RAM savings.

One final playback pair, after 35 seconds of warm-up per revision, recorded the following. Both started near 1.295 seconds in the same original video, in a 2560×1438 viewport at DPR 1, using 17 verified processes. The conversation continued updating, so these are observations under live work, not a controlled idle benchmark or causal percentage savings.

| Measurement | Released 1.5.2 | Streaming change |
| --- | ---: | ---: |
| Counter interval | 61.01 s | 60.52 s |
| Codex + injector CPU | 2.033% | 1.576% |
| Injector CPU | 0.0192% | 0.0161% |
| GPU 3D engine busy | 1.204% | 1.232% |
| GPU video-decode engine busy | 6.333% | 7.039% |
| Total private commit | 3,113.43 MiB | 3,133.27 MiB |
| Total private working set | 1,628.77 MiB | 1,610.74 MiB |
| Injector private commit | 83.16 MiB | 85.92 MiB |

Playback remained 3840×2160 at playback rate 1, with no additional dropped frames in either sample. These counters **do not demonstrate lower GPU use or sustained private memory**, even though the separate load benchmark shows a clear CPU/peak-RSS improvement. Tested on Windows 11 with Store Codex 26.1016.6573.0, NVIDIA RTX 5070 and AMD Radeon graphics.

GPU experiments with opacity, a brightness filter and alternate stacking were discarded because repeated measurements did not establish a reliable reduction. A native color-scheme sampling experiment also failed to establish a meaningful reduction and was removed. **No sustained CPU/GPU/private-memory improvement is claimed from those experiments. The Windows release remains 1.5.2 pending the requested GPU result.**

To reproduce from an ordinary user terminal, keep the same Codex route, viewport and original video visible. Allow 35 seconds to warm up, then run each revision separately with the same video starting point:

```powershell
New-Item -ItemType Directory -Force build | Out-Null
node windows/tests/measure-theme-load.mjs build/load-report.json
powershell -NoProfile -File windows/tests/measure-resources.ps1 -Seconds 60 -Output build/playback-report.json
```

For the old revision, copy all three benchmark scripts (`measure-theme-load.mjs`, `measure-resources.ps1`, `measure-performance.mjs`) into its `windows/tests/` directory before running them. Use the same Node binary and compare multiple fresh processes. The live sampler verifies the installed package, loopback browser and injector identities and rejects process exits/replacements or counter resets. It also requires visible playback at both ends and rejects changed media, masks, playback rates or viewports; it reports average decoded FPS and dropped frames. Keep Codex visible throughout the interval, including between those endpoint checks. Run sequentially, without builds or other foreground work. Private reports remain local; do not commit media or conversation screenshots.

## Released 1.5.2: route maintenance

Tested on Windows 11 24H2 with OpenAI.Codex 26.1016.6573.0 and the same original 3840×2160 MP4, muted and looping with a 62% mask. The Xskin panel was closed. Each run appended 100 small elements, spaced 50 ms apart, inside a temporary hidden container in the active conversation. The container was removed after the test; no conversation content was read or changed.

| Measurement | 1.5.1 | 1.5.2 |
| --- | ---: | ---: |
| Sample duration | 5.88 s | 5.94 s |
| Whole-document route scans | 104 | 1 |
| Shell geometry reads | 2 | 1 |
| Additional decoded video frames | 177 | 179 |
| Chromium script time | 0.054 s | 0.071 s |
| Chromium task time | 1.228 s | 1.225 s |

Route scans fell by about 99%. Total timing did not materially improve in this short sample: Codex's own ongoing work and video decoding remain part of the measurement. These results do not establish a general CPU/GPU or battery improvement. Resource use depends on the codec, frame rate, GPU, conversation and other running work; no transcoding or frame-rate reduction was introduced.

The mutation observer now schedules route work for shell/home marker changes, existing-page activation and decoration removal. Ordinary message elements and text updates are ignored. Resize handling, theme changes, cleanup and the four-second repair pass remain in place. Existing visibility and Reduce Motion video suspension are retained. Regression tests exercise ignored content, coalesced structural changes, nested marker removal and page activation.

With Codex already running through **Codex (Xskin)**, reproduce from the repository root:

```powershell
node windows/tests/measure-performance.mjs
```

The optional first argument saves the JSON report. Run from an ordinary user terminal: a process launched inside the Store host may see virtualized AppData instead of the standalone engine's state. The benchmark checks the saved browser identity, uses only loopback CDP, and closes its session after measurement. Private reports and screenshots are excluded from releases.
