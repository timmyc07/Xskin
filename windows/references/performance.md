# Windows 1.5.2 performance — 2026-10-21

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
