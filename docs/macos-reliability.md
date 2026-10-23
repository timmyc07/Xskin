# macOS reliability review — 1.8.4

This review covers Xskin's own code, tests and managed installation. It does not reverse engineer the official app or claim every possible situation has been tested.

## Reconnection and startup findings

- Wall-clock rollback could stop host heartbeats. Heartbeats now use elapsed time; renderer timestamp bounds track the maximum observed wall/elapsed-time offset, including a resume where only wall time advanced.
- An open but unresponsive renderer socket could remain marked ready indefinitely. Three consecutive failed probes or deliveries now close only Xskin's socket and subscription; the existing discovery loop reconnects. Isolated errors retain the subscription. Reader failures do not churn sockets.
- A failed read could poison a concurrent queued read, and failed delivery was marked delivered before acknowledgment. Queued reads recover independently and unchanged undelivered snapshots remain eligible for retry.
- The direct entry read state before initializing Node. It now reads pause/port correctly and repairs a missing watcher on an already verified connection. Repeated clicks reuse only the recorded PID, start time, runtime path, script path and port. Foreign processes are never signalled.
- The panel previously compared only displayed versions before updating its managed runtime. Executable content is now compared too, covering rebuilt same-version fixes. The comparison excludes user media. On this Mac, comparing 41 fixture files / 590,193 bytes averaged 53.05 ms over 20 runs; this is a comparison benchmark, not total app startup time.
- Generated shell launchers now preserve literal shell characters in Unicode paths and require the same ownership checks for replacement as removal.
- Native apply/mask operations keep recoverable transaction state so interruption cannot silently commit unverified settings. The legacy image loader validates a staged pack before publishing, reuses the existing theme switcher, and shares the operation lock.

These are reproduced defects, not proof of the exact cause of every earlier screenshot. The initial current-page self-check hydrated usage, so its ready result alone did not establish an independent daemon heartbeat. Verify now observes counters without publishing a replacement snapshot. A same-version source/installed-runtime mismatch was confirmed; the existing overlay payload itself matched.

## Scenario matrix

| Scenario | Evidence / acceptance |
| --- | --- |
| Current local UUID, draft ID, foreign/ambiguous thread, switching, remount, Home, hidden page | Token overlay and surface-target regressions; no cross-thread delivery |
| Initial waiting, lifecycle-only activity, available counters, missing heartbeat, reconnection | Fake clock/DOM and bridge regressions; no fabricated usage |
| Clock forward/backward, sleep-like wall-only advance | Deterministic tests; actual sleep/wake still requires physical acceptance |
| Transient probe/push/read failure, sustained socket failure, disposal | Injected fault tests; reconnect only Xskin connection |
| Large history, oversized line, boundary overlap, append/replacement/deletion, new file | Incremental reader tests; 1 MiB per-read bound and unchanged-history cache retained |
| Fan start/complete/abort, reduced motion, hidden page | Lifecycle and overlay tests |
| PNG/JPEG/WebP/HEIC/TIFF imports, MP4 validation, source mutation, size/path limits | Native backend/media tests with isolated data; actual codec availability is host-dependent |
| Import/preview/apply, pending import retained, mask bounds, verify failure | Backend tests; native arm64 build validates source compilation |
| Apply/mask interruption and next-operation/bootstrap recovery | Forced worker termination fixtures; previous settings restored, import retained |
| Concurrent mutations, invalid lock, foreign journal/file/symlink | Lock, transaction and ownership regressions; fail closed |
| First install, upgrade, same-version rebuild, missing engine, failed swap rollback | Isolated installer/runtime tests; preferences and media retained |
| Active/paused/disabled direct entry, repeated clicks, dead watcher, foreign saved PID | Native entry fixtures using real Node and real state parsing, simulated official boundary |
| Official-entry observer, existing session, duplicate event, refused quit | Autostart/native fixtures; one graceful handoff maximum |
| Config UTF-8, unrelated TOML, Chinese project names, damaged backup | Full configuration round-trip and rejection suite |
| Desktop launcher Chinese/emoji/spaces, quotes, dollar/backticks, foreign same name | Executed fixture launchers; literal path and ownership checks |
| Pause, Restore, owned-service removal, rollback | Existing full runner; personal media/account data excluded from removal |
| Every official Home/task/Space/settings/menu route, actual overlay/background appearance | **Pending:** native computer-use access to the official app was denied; no alternate capture/navigation bypass |
| Three physical official-entry cold starts with panel closed | **Pending:** fixture starts are not physical evidence |
| Logout/login, reboot/session restore, OS permissions and official app upgrade | **Pending:** requires interactive physical acceptance; existing sessions are deliberately left alone |
| Long-duration 4K playback / CPU / GPU / power / sleep-wake | **Pending:** unit tests and build do not establish sustained hardware performance |
| Interactive Windows cold starts/login/Store update | **Pending:** no execution connection supplied; Windows startup remains shortcut-only |

## Installation and recovery

Keep the prior app/package. Close the Xskin panel and replace only its managed app with the new build, then apply or run the managed installer to update its engine. Existing Codex stays open when its verified Xskin connection can be reused. Keep the data directory `~/Library/Application Support/CodexDreamSkinStudio`, account files and saved media.

Enable **Apply when official Codex opens** once and leave Xskin closed. Its per-user login service observes future ordinary official launches; paused/disabled/existing sessions are skipped. The optional `~/Applications/Codex (Xskin).app` starts the themed session directly, avoiding the official-entry handoff; an ordinary existing session must be fully quit manually first.

For rollback, disable automatic backgrounds, close Xskin and reinstall the retained app/package without deleting the data directory. Use Pause to remove the current skin while retaining preferences; Restore removes only owned runtime integration. Keep a failed transaction/journal for diagnosis if recovery refuses inconsistent or foreign data; do not delete it to force a successful status.

## Supported integration limit

The [official Appearance documentation](https://learn.chatgpt.com/docs/reference/settings#appearance) describes base themes, colors, fonts and translucent sidebars. It does not establish a persistent custom image/video or usage-overlay extension that can attach to every ordinary app launch without a controlled launch. No such supported interface was established in this review. The macOS official entry therefore still performs the previously authorized single graceful reopen; the direct entry avoids it. A restored already-open ordinary session after login is intentionally not closed automatically.

No official files, signatures, fuses, account/quota protections or launch interception are changed. CDP/CSS authorization remains unconfirmed; not modifying official files does not establish permission. This release is not a compliance guarantee or a declaration of exhaustive market readiness.

## Actual verification

- Full macOS `npm test` passed on this Mac, including the new runtime/image/startup fixtures, interruption recovery and the existing renderer/media/configuration/signature/doctor checks. The first run correctly failed its live doctor because the older installed payload was still 1.8.3; after a verified managed upgrade, the full suite passed without bypassing checks.
- The arm64 native 1.8.4 build passed. Shared Windows Node regressions also passed on this Mac; this does not establish Windows runtime behavior.
- The local managed engine upgraded to 1.8.4 while preserving the official process PID/start time, config/media/language hashes, pause preference, enabled startup preference and selected port. Current-page Codex/Dot/Work self-checks passed. Two passive observations verified that the independent daemon heartbeat advanced; Verify no longer hydrates counters itself, and a visibly reconnecting row now fails verification.
- A controlled live outage stopped only the verified Xskin daemon. Passive Verify rejected the reconnecting row after its timeout; the existing hot-reapply path restored the daemon and usage without changing the official process. Final config/media/language/pause checks remained identical. Installed native app, engine and skill payloads match 1.8.4 source.
- Native/plugin ZIP integrity, privacy scan, source/version parity and extracted native signature passed.
- Matching Windows runner, Flutter analysis/tests and packaging are required before publication; final run links and package integrity results are recorded with the release assets. New macOS shell fixtures also run in CI without substituting for the actual-app doctor.

Pending physical checks above remain pending regardless of automated pass results. The native app is ad-hoc signed, not Developer ID notarized; no App Store readiness is claimed.
