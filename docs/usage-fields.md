# Usage-field interpretation — macOS 1.8.5 / Windows 1.8.4

The usage strip reads the selected local conversation's usage events. It does not query an account endpoint, read credentials, infer a subscription from the selected model, or generate missing measurements.

## Plan reports

Later usage events can contain `plan_type: null` even when the same session previously reported a valid plan. The reader now retains the latest valid plan in that session, including when recovering history before a large tool-output tail. Missing or malformed later values do not erase it. A session that never supplied a valid plan shows “not provided”. Thread changes, deleted/replaced/truncated files and cleared records do not borrow a plan from another session.

The tooltip identifies the value as the latest report in this conversation, not live account status. It can be old, including after an account or workspace change. A retained plan does not prove current entitlement or access to a model.

The official [App Server documentation](https://learn.chatgpt.com/docs/app-server#authentication-endpoints) documents `account/read` with `refreshToken: false` and a ChatGPT `planType`. Its rate-limit field notes say a bucket includes `planType` when the server returns it. The [public protocol at commit `30587d7`](https://github.com/openai/codex/blob/30587d78850abf2bfc484ffb0ab0f71497cc9c05/codex-rs/protocol/src/protocol.rs#L2497-L2512) also makes `plan_type` optional. These establish that an absent plan is possible; they do not establish a supported account bridge from Xskin to an already running desktop renderer. This fix adds no authentication or account access.

## Cache reads and writes

“Recent cache” is the latest call's `cached_input_tokens / input_tokens`. It is a read ratio, not a count of writes or a list of retained cache contents. Cache-write counts are source-reported tokens, not file, disk or editor writes.

- Positive latest-call values show “cache writes”; positive cumulative values use the separate “total cache writes” label.
- A source value of zero shows “unconfirmed”. The tooltip preserves the value and explains that zero can be an upstream default, so the actual amount cannot be confirmed from that record alone.
- A missing or invalid write field is unavailable; it is never filled with zero or estimated from input minus cached input. A newer unavailable write measurement does not reuse an older positive measurement.

The [public Responses parser at the same fixed commit](https://github.com/openai/codex/blob/30587d78850abf2bfc484ffb0ab0f71497cc9c05/codex-rs/codex-api/src/sse/responses.rs#L119-L152) maps `input_tokens_details.cache_write_tokens` to `cache_write_input_tokens`. It defaults a missing write field, or missing input-details object, to zero. The [public token-usage structure](https://github.com/openai/codex/blob/30587d78850abf2bfc484ffb0ab0f71497cc9c05/codex-rs/protocol/src/protocol.rs#L2389-L2408) also defaults the serialized field. That loses the distinction between a measured zero and an unavailable metric.

The official [prompt-caching documentation](https://developers.openai.com/api/docs/guides/prompt-caching#monitor-cache-performance) treats cache reads, cache writes and ordinary input as distinct counts. A high read ratio does not establish that the current call wrote anything, and uncached input is not a substitute for write measurements. The overlay does not change Codex's caching behavior.

Documentation was checked on 2026-10-23. Context7 resolved `/openai/codex` and returned current `main` material, without an index matching the supplied commit; the field behavior above was therefore verified against the pinned public source. Xskin has no OpenAI SDK dependency in its manifest. Neither the index date nor that source commit proves the schema version of the installed official app. No official app bundle was inspected or reverse engineered for this fix.

## Validation

The full macOS suite and arm64 native build passed. Targeted parser and overlay regressions passed for both platform copies, alongside the portable Windows renderer and bridge tests on this Mac. They cover retained same-session plans, absent/malformed plans, positive/zero/missing writes and the explanatory rendering. A 3,180,556-byte dense fixture read 3,180,686 bytes in bounded chunks; unchanged heartbeats perform no history reads. A cold read may search the whole file once for an earlier plan; later reads use only new bytes.

The installed macOS 1.8.5 engine passed passive current-page self-checks for Codex, Work and Dot; the Codex usage connection was ready. The selected conversation's earlier valid plan was recovered without reading credentials. Config/media/selection bytes, Xskin language, pause state and the official Codex PID were preserved during the update. These checks inspect Xskin's own feature state and do not establish official-page visual acceptance.

Windows runner, Flutter analysis/tests and package integrity must pass before publication. Final run links and archive checks are recorded on the [macOS release](https://github.com/timmyc07/Xskin/releases/tag/v1.8.5) and [Windows release](https://github.com/timmyc07/Xskin/releases/tag/windows-v1.8.4) pages; portable Mac tests alone do not establish Windows runtime behavior.

Official Home/task visual inspection and Windows physical cold-start, login and Store-update acceptance remain pending. Test fixtures do not replace those checks. CDP/CSS injection authorization remains unconfirmed; public protocol documentation and unchanged official files do not establish permission for renderer injection. Existing startup behavior is unchanged: macOS official-entry startup can gracefully reopen once; Windows uses Codex (Xskin) shortcuts and never automatically closes or reopens Codex.

## Upgrade and rollback

Keep the previous package and retain Xskin's data directory. On macOS, close Xskin, replace it with the new app and use its normal Apply operation to update the managed engine. On Windows, extract the whole new package into a separate folder and run its normal installer. Media, language, opacity, pause and the official app are preserved; do not delete the state directory or modify official files. No environment variables or account credentials are needed for this fix.

To roll back, first disable automatic backgrounds or shortcut backgrounds in Xskin, close its panel and reinstall the saved [macOS 1.8.4](https://github.com/timmyc07/Xskin/releases/tag/v1.8.4) or [Windows 1.8.3](https://github.com/timmyc07/Xskin/releases/tag/windows-v1.8.3) package, retaining data. Re-enable the desired background behavior through that version's normal controls. The previous release restores its earlier usage-display behavior and limitations. Use Pause to hide the overlay temporarily; a separate full Restore can ask to close/reopen Codex to remove the debugging connection.
