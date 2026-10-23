# Final review: macOS 1.8.3 / Windows 1.8.2

What this change does: It recovers usage from long local histories and adds explicit waiting/reconnecting states. It also extends translucent native materials and checks the loaded stylesheet. The review assumes one local user, several renderer surfaces and large tool-output histories.

## Must fix — resolved

1. **A temporary old stylesheet could fail an otherwise healthy update.**
   - What this is: `waitForVerifiedSession` waits for the requested theme and media. The caller previously compared the CSS revision only after that wait had returned.
   - Problem: When the old and new payload have the same version/theme, the old payload could end the wait immediately. The caller would then fail instead of allowing the new CSS to arrive within the configured deadline.
   - Fix: Check the expected CSS revision inside the existing wait on both platforms. A regression covers a delayed successful update and a permanently stale stylesheet.
   - If skipped: A healthy update could report failure or invoke recovery too early.

## Should fix — resolved

2. **Long-history recovery reread the tail it had just parsed.**
   - What this is: `TokenUsageReader.readSession` parses the last 1 MiB, then searches backward for missing usage, limits or lifecycle state.
   - Problem: Backward recovery started at EOF again. Dense tool-output logs paid for the same tail twice.
   - Fix: Start reverse recovery at the first skipped line's end. Retain that line's overlap so split UTF-8/JSONL records and large appends remain recoverable. Each read stays bounded to 1 MiB.
   - If skipped: Each such attachment or large append performs up to about 1 MiB of redundant I/O and parsing.

## Measured result

The synthetic fixture has 3,180,556 bytes and 20,000 short tool-output rows. Instrumented file reads fell from **4,229,132 to 3,180,686 bytes**, a **24.8% reduction**. This measures reader I/O, not total CPU/GPU use or video playback cost. Both added regressions failed before the fixes and pass afterward.

Existing checks retain exact-thread isolation, lifecycle fan behavior, quota clearing, unchanged-heartbeat caching, partial lines, split recovery boundaries and oversized output handling. The change adds no dependency, background polling loop or setting. The unreachable Windows one-shot verification fallback was removed.

## Release gates and recovery

- Run the complete macOS test runner and arm64 native build.
- Require the matching commit's complete Windows runner, Flutter analysis/tests, release build and artifact upload before publishing.
- Validate both archives against their checksums, versions and expected payloads. Verify the native app signature after extraction and reject private logs, account files, `.env` files and chat screenshots in packages.
- Keep the official app, account, media, mask, language and pause state. macOS keeps the authorized official-entry handoff; Windows remains shortcut-only and never automatically closes/reopens Codex.
- Upgrade from a separate extracted folder and retain the prior package. For rollback, disable automatic backgrounds, close Xskin and reinstall the saved package without deleting its state directory.

The earlier [168 browser-fixture checks and Windows validation](surface-materials.md) remain supporting evidence for unchanged CSS. They do not establish complete official-route visual coverage. Full physical cold starts/login/Store-update checks remain pending; direct native access to Codex was rejected on safety grounds and no alternate capture/navigation was used. CDP/CSS authorization remains unconfirmed.

Verdict: Ship after the matching package CI and archive checks pass.

Not checked: complete official-page visuals, three physical cold starts and sustained GPU/CPU savings.
