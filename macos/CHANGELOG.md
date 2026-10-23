# Changelog

## 1.9.3 — candidate, not published

- Expand Preview to the section's full width at 16:9 while retaining the complete original image/video without lowering resolution or re-encoding. Place the settings heading above its card rather than across its border.
- Match the compact native language selector to host colors and spacing, retain native keyboard/popup behavior and wrap long settings labels and filenames inside their containers.
- Move progress and errors immediately after preview actions. Translate supported import failures, including source/data-folder access and image conversion, rather than hiding the error below settings. Cancelled picker completions cannot start an import; the displayed version identifies the panel bundle. The user's reported approximately 80 MB MP4 import still needs reproduction; its actual failure cause is unconfirmed.
- All 53 plugin tests and the full macOS runner pass. The own-browser fixture passes 48 cases / 240 scroll positions plus eight narrow 200%-text cases with a 240-character filename; inner widths, text bounds, preview geometry, settings heading and adjacent chooser error are checked.
- The user confirmed 1.9.2 background and controls, then reported the refinements above. New visuals/video import and new-head CI remain pending. Earlier `2952710` CI success does not validate this head; stable downloads remain macOS 1.8.5 / Windows 1.8.4.

## 1.9.2 — earlier unpublished candidate

- Confine the entire panel scrollport above the host composer at every scroll position, reserving the reported bottom safe area or a 96px fallback. Keep the official input present and unchanged.
- Render the applied original background inside Xskin's own iframe, including over an opaque host canvas. Keep pending imports isolated to Preview; matching active/preview media share a Blob, with at most two media Blobs. Stop decorative video while hidden, paused or under Reduce Motion.
- Replace header-wide language radios with a compact native select in a separate settings row. Retain four languages, keyboard access, first-setup availability, explicit recovery and cancellation.
- Preserve original media without transcoding, including the checked 4K60 file. Add own-video frame/drop diagnostics using the existing Verify interval. A 5.48-second local sample measured approximately 59.1 presented FPS with zero additional dropped frames at 3840×2160; sustained playback remains unverified.
- The user confirmed 1.9.1 video preview/Apply and later 1.9.2 background/controls. At `2952710`, 51 plugin tests, the full macOS runner, 48 opaque-canvas Chrome cases / 240 scroll positions and both [CI](https://github.com/timmyc07/Xskin/actions/runs/39942511976) and [Windows Flutter/package CI](https://github.com/timmyc07/Xskin/actions/runs/39942512050) passed. Physical cold starts, complete Home/task visuals and sustained playback remain pending. Stable downloads remain macOS 1.8.5 / Windows 1.8.4.

## 1.9.1 — candidate, desktop acceptance pending

- Replace HTTP preview serving with the app-only media tool, private per-session capabilities and bounded 512 KiB chunks assembled into local Blob previews. Recheck file identity per read, revoke stale capabilities and release previews on hide/close; no local HTTP preview port is opened.
- Keep completed imports and Apply results when optional preview creation fails. Preserve original Chinese/emoji filenames instead of internal UUIDs, chooser cancellation and pending imports. A 96 MiB sparse MP4 fixture covers import/state handling, not codec playback.
- Add Refresh and explicit interrupted-change recovery. Read-only status does not mutate settings. After a transport timeout/loss, refresh once and retry status rather than silently resending an uncertain change; expired selection IDs require choosing again. Keep editing disabled while recovery is pending.
- Let confirmed Apply/mask transactions finish the backend's bounded forward/rollback phases instead of terminating them at the adapter's shorter outer limit. Retain other command deadlines. A scaled regression reproduces the old interrupted rollback and verifies restoration.
- Use a transparent embedded canvas, host-aware light/dark colors and safe margins. Replace the language dropdown with four-language radio controls and preserve keyboard access on narrow layouts.
- Move the usage row inside the enclosing composer layout, immediately before the body, preserving nested wrappers, toolbar order and subscription identity. Add no runtime observers or forced scrolling. A 16-case self-owned ResizeObserver browser model covers height reservation, removal and reader position; it does not establish the official app's internal cause.
- The user has confirmed More → Xskin opens. The new preview and full Apply workflow remain pending in the actual host; new candidate CI results are not yet recorded. Windows remains a separate 1.8.5 candidate with physical cold-start/route acceptance pending. Published download links remain macOS 1.8.5 / Windows 1.8.4. See [scope and recovery](../docs/in-app-studio.md).

## 1.9.0 — earlier unpublished candidate

- Join the usage strip to the input with no bottom gap and lower corner cutouts that follow the input’s upper curves. Keep the center transparent, decorative paint non-interactive, and native geometry, Home hiding and narrow wrapping intact.

- Fix the missing MCP/sidebar entry in the first candidate: launch the packaged executable with the required contained `./` command. Test the actual portable manifest's execution, permissions and Unicode paths; plugin installation alone is not proof that its MCP server loaded.

- Add an official MCP App global Xskin entrypoint and a four-language in-app background panel. Reuse native imports, previews, pending selection, atomic apply, mask, startup preferences and saved background Pause/Resume.
- Keep embedded Apply/mask/rollback/Resume on an existing verified connection. Never launch or quit Codex from these operations; prepare first imports without silently enabling automatic startup or rewriting official appearance preferences.
- Kept private state outside model-visible content. This earlier candidate used loopback HTTP media previews; 1.9.1 supersedes that transport with app-only chunks and Blob previews.
- Bundle locked SDKs and their licenses in self-contained release files. Native Xskin remains an explicit fallback; Windows stable downloads stay on 1.8.4, with a separate 1.8.5 overlay-shape candidate. See [evidence and host acceptance limits](../docs/in-app-studio.md).

## 1.8.5 — 2026-10-23

- Retain the latest valid plan reported in the same session when later usage events omit it or provide `null`. Identify it as conversation history, not live account status; show “not provided” when the session never supplied a plan.
- Label cache-write tokens explicitly. A source-reported zero is “unconfirmed” because the upstream protocol can default an unavailable value to zero; the tooltip retains that source value and explanation. Missing fields are never filled with zero, and positive values remain source-reported counts.
- Targeted parser and overlay regression tests passed. Full-suite, package and CI results will be recorded in [usage-field validation](../docs/usage-fields.md); physical platform acceptance and CDP/CSS authorization remain unconfirmed.

- Treat intentionally hidden usage as suspended, clear stale data on hide, and wait for real delivery on return. Verify explicitly defers hidden usage while retaining visible-page heartbeat failures.

## 1.8.4 — 2026-10-23

- Recover stalled usage connections by reconnecting only Xskin's socket after repeated renderer failures. Use monotonic heartbeat timing and retain safe timestamp bounds across clock corrections and sleep; retry undelivered unchanged snapshots and queued reads after transient errors.
- Repair a missing injector from the direct entry without restarting Codex. Initialize the runtime before reading pause/port state and reuse only the recorded PID/start/path identity; repeated clicks keep one watcher.
- Detect changed executable payloads even when their displayed version matches. Keep media out of this comparison and preserve settings, pause and the official app during upgrades.
- Preserve literal Unicode, emoji, spaces and shell metacharacters in generated launchers; reject foreign files and symlinks at managed launcher paths.
- Add interruption recovery and validate legacy image preparation before replacing the active theme. Retain the previous configuration when applying or changing mask fails.
- Record the scenario matrix and remaining physical/authorization limits in [macOS reliability review](../docs/macos-reliability.md). Official-entry custom backgrounds still require one authorized graceful reopen; a supported persistent no-reopen image/overlay interface has not been established.

## 1.8.3 — 2026-10-23

- Final review: avoid rereading the parsed history tail (24.8% less I/O in the dense 3.18 MB fixture); keep 1 MiB per-read limits and partial-line recovery. Wait for the expected stylesheet revision inside the existing verification deadline rather than rejecting a transient update immediately.

- Follow up the still-opaque native headers: map the missing `--color-surface*` family, clear utility-header paint/blur and structural settings containers. Verify reports missing header coverage and rejects stale CSS or painted header layers; actual official-route visual verification remains pending.

- Recover the latest usage, rate limits and lifecycle independently when a long tool-output tail hides earlier records. Keep reads bounded to 1 MiB and revisit only newly appended ranges after initial attachment.
- Replace all-empty metrics with an explicit waiting/reconnecting message, hide the row until the local task is identified, and refresh immediately after composer remounts. Lifecycle-only timestamps no longer reject the first valid token snapshot.
- Theme shared native/Work page surfaces and nested theme scopes, including plugin/Space/Drive headers, site lists, settings cards and portal menus/dialogs. Preserve control colors, document thumbnails, geometry and Dot isolation; Pause removes the scoped material rules.
- Retain the official-entry macOS startup policy and Windows shortcut-only startup. No official files, account data or launch protections are changed.

## 1.8.2 — 2026-10-23

- Move usage into a slim translucent strip above the input, in normal flow, so it cannot cover the native footer. Wrap long metrics on narrow windows and hide the empty strip on Home.
- Reveal the wallpaper through dark/light composer and home-toolbar surfaces. Video uses matching translucent material for both. Preserve native toolbar placement, size and corners instead of forcing an older top-cap layout.
- Keep macOS official-app monitoring and Windows shortcut-only startup unchanged; retain saved media/preferences and all usage/fan behavior.
- Publish matching native app/plugin packages and checksums; update download, upgrade and recovery guidance. Full macOS tests/build and Windows CI checks passed. Physical three-start, login/Store and full official Home/task visual validation remain pending; CDP/CSS authorization remains unconfirmed.

## 1.8.1 — 2026-10-22 (source; physical startup validation pending)

- Restore the macOS official-app entry at the user's request: the enabled login service observes new native launches and gracefully reopens each once to apply the background. The Xskin panel can stay closed. Windows retains its 1.8.0 shortcut-only startup and never automatically reopens Codex.
- Verify the fresh process by executable, PID, start time, bundle path and age; request normal termination of that exact process only. Skip existing, paused, disabled and explicit-debug sessions. A refused quit or failed launch is not forcibly stopped or retried in a loop.
- Retain the direct Codex (Xskin) entry as an optional single-launch path. Preserve settings/media, migrate enabled 1.8.0 preferences, serialize handoffs against direct launches and panel operations, and restore the previous service on update failure.

## 1.8.0 — 2026-10-22 (source; physical startup validation pending)

- Use Codex (Xskin) for one explicit official launch. Retire legacy launch monitoring; ordinary existing apps and failed launches are never closed/reopened by startup.
- Preserve saved media, language, opacity and pause. Paused shortcuts open ordinary Codex. Owned-entry migration preserves foreign same-name shortcuts and existing data.
- Preserve the running official app during runtime upgrades. Windows stops verified injector pipe holders before the legacy host, preserves bundled Node and no longer waits on grandchild output EOF.
- macOS includes draft conversation IDs, lifecycle fan animation, long-log incremental reads and new-session overlay fixes.
- Document CDP/CSS authorization as unconfirmed and distinguish automated checks from pending physical cold-start/login/Store verification.

## 1.7.0 — 2026-10-22

- Add a compact token overlay below the Codex task composer: show the current conversation's cumulative tokens, cached input tokens, remaining context percentage, subscription plan and remaining subscription quota when present in official local session logs. Keep missing values visibly unknown; cached tokens are a subset of input tokens, not additional consumption.
- Show the latest model call's cache hit ratio, with cache-write tokens only when the source provides them. Do not infer permanent cache contents or expiry.
- Watch the current conversation's exact session file with 20ms write coalescing, 250ms route/visibility checks and a 5-second metadata heartbeat. Serialize reads, deduplicate snapshots and read bounded incremental tails instead of repeatedly scanning session directories. Updates follow actual source writes; no simulated consumption is shown.
- Scale the CSS fan animation to positive token deltas and stop it when idle, hidden or Reduce Motion is enabled. Read local usage records through the existing loopback injector without network requests or reading `auth.json`.
- Add parser and renderer regression checks to the macOS test runner. The native app and standalone packages include the new runtime files through existing directory copying.

## 1.6.1 — 2026-10-22

- Recognize the native ChatGPT Work shell without requiring a Codex active-page wrapper. Keep inactive pages excluded and use the same selectors for injection, routes, and verification.
- Keep guarded early injection connected while React creates a shell after document loading completes. Show the saved artwork immediately when the shell appears, then attach its original video without the previous five-second rejection cooldown. Expire unrecognized windows and cancel pending observers on shutdown.
- React to native macOS application launch and termination notifications instead of polling once per second. Preserve fresh-process identity checks, graceful handoffs, and the restart loop guard.

## 1.6.0 — 2026-10-22

- Port Windows 1.5.4 background coverage to embedded Work, native Your dot conversations, and transparent Dot composer/activity cards. Keep one original-quality player per surface, clip Dot video to its cards, and pause hidden or covered players.
- Avoid whole-document routing scans during ordinary message streaming; retain shell activation, resize, and periodic repair.
- Inspect complete MP4 files through a 1 MiB buffer, reuse their digest, and verify byte-identical local copies without retaining entire videos in memory. Keep file-change, size, symlink, and playback checks.
- Apply backgrounds when the original official Codex app opens. An enabled per-user service gracefully reopens each fresh ordinary launch once, skips existing or explicit debug sessions, and enforces a 30-second loop guard. Restore previously managed Dock entries to the official app.
- Stop and resume verified background services around engine upgrades, roll back failed replacements, preserve paused state and local media, and keep the watcher working directory outside the engine.
- Extend renderer, surface, streamed-video, startup identity, and upgrade regression coverage; retain the native four-language macOS studio.

## 1.5.1 — 2026-10-21

- Fix Dock entries whose visible URL pointed to Xskin while their bookmark and bundle identity still launched the original app.
- Repair existing entries during setup, clear stale launch metadata, and preserve the original Dock backup for restoration.
- Cover stale, corrupt, and mismatched Dock bookmarks in native regression checks.

## 1.5.0 — 2026-10-21

- Default to English with persistent English, Traditional Chinese, Simplified Chinese, and Japanese interface choices.
- Use stable message codes for localized operation and validation errors.
- Add a managed Codex Dock entry that enables the background connection on the first launch.
- Remove the automatic quit-and-relaunch handoff and the duplicate startup request. Leave directly opened official windows running.
- Observe new documents before their HTML element exists so early injection does not wait for its timeout.
- Restore the original Dock entry when automatic startup is disabled.
- Cancel idle discovery waits during shutdown and avoid waiting on dead-owner or zombie injectors.
- Keep hidden videos paused with a decoded frame ready; preserve reduced-motion and error fallbacks.
- Rewrite all README guides in English.

## 1.4.0 — 2026-10-21

- Replace the browser background panel with Xskin, a standalone native macOS application using SwiftUI, AppKit, and AVKit.
- Remove the large heading, marketing copy, and custom brand bar so the window begins with functional controls.
- Use native file selection, image/4K video previews, drag import, and an explicit Apply action without WebView or an HTTP panel server.
- Add one persistent mask-depth control for all surfaces (0–100%, default 62%), with synchronized preview and automatic apply after slider release or keyboard adjustment; keep the source media unchanged.
- Persist staged selections locally, retain atomic apply/rollback and exact-theme verification, and expose the existing normal-launch background service.
- Ship a precompiled app and update the plugin to launch the application directly.
- Remove the superseded browser UI, HTTP server, and browser-specific tests.

## 1.3.2 — 2026-10-21

- Require Verify to match the selected theme ID, video presence, and video content fingerprint before reporting a successful apply.
- Reject stale-background success during injector handoff, including video-to-image switches, while retaining intentional hidden/reduced-motion suspension.
- Report corrupt images accurately and avoid upscaling smaller images during panel preparation.
- Preserve the authenticated loopback panel URL across service restarts so restored Codex tabs keep working; fail safely if its port is occupied.
- Add isolated HTTP-panel coverage for imports, preview ranges, explicit apply, original MP4 bytes, invalid input, rollback, stage cleanup, and automatic-startup controls.

## 1.3.1 — 2026-10-21

- Redesign the background panel around a media-first canvas, a grouped inspector, and a persistent apply action.
- Use a restrained graphite and warm-lime palette, responsive one/two-column layouts, clear file metadata, and explicit pending/connection states.
- Keep native media controls, keyboard focus, reduced-motion support, local-only imports, and the existing apply pipeline.
- Document the primary product and award-design references behind the original layout.

## 1.3.0 — 2026-10-21

- Package Codex Background Studio as an installable local plugin with a Codex browser side panel.
- Import, preview, and explicitly apply local pictures or original-resolution MP4s; show upload progress and only report success after live engine verification.
- Keep panel images and videos in the same full-window wallpaper layout with transparent sidebar and dark scrim.
- Stream media over an authenticated loopback-only service with bounded imports, range previews, atomic publication, and rollback on apply failure.
- Expose the existing normal-launch automatic-background choice in the panel; keep video preview paused by default.

## 1.2.1-video.9 — 2026-10-21

- Keep native Home layout for video themes, removing legacy banner dimensions, cyan outlines, shadows, and decorative tagline text.
- Clear the remaining main-surface frame while video plays; retain original-resolution playback and the full-window scrim.
- Keep video Home route detection and verification separate from image-banner layout styling.

## 1.2.1-video.8 — 2026-10-21

- Align renderer and verifier Home detection using the native home signal even before optional suggestions load.
- Verify full-window video Home with the styled route, visible native composer, visible video, and advancing playback; image themes retain their banner checks.
- Add regression coverage for Home without suggestions and reject video Home when route styling is missing.

## 1.2.1-video.7 — 2026-10-20

- Avoid rewriting the existing root skin class, stopping a self-triggered MutationObserver loop at display refresh rate.
- Exclude avatar overlays and detached auxiliary windows before opening debugger sessions or waiting for main-window markers.
- Adapt the upstream #218 outage backoff: retain fast reload recovery, then reduce polling and repeated error logs during sustained disconnects.
- Preserve original 4K/60fps video, hidden-window suspension, full-window scrim, and native controls.

## 1.2.1-video.6 — 2026-10-20

- Use class-token attribute selectors for home suggestions and the project selector, fixing a renderer exception on normal launches that land on Home.
- Exercise the fresh Home fallback path in renderer regression checks, alongside existing task-route checks.

## 1.2.1-video.5 — 2026-10-20

- Move the task-area video scrim to one fixed full-window layer, covering the sidebar, titlebar, and main background without dimming native text or controls.
- Clear native opaque scroll fades and composer wrappers; use matching translucent black input and summary-panel surfaces.
- Flush and finish completed CDP CLI operations without waiting for idle socket handshakes; wait for LaunchAgent unload before re-registering it during updates.

## 1.2.1-video.4 — 2026-10-20

- Add opt-in macOS LaunchAgent detection of normal Codex launches, using the current original-resolution theme.
- Hand off only matching processes younger than 15 seconds, quit gracefully, avoid repeated restart attempts, and leave closed apps closed.
- Keep existing windows open when enabling the service; expose its toggle in the menu bar.
- Disable automatic startup on Pause/Restore and preserve the choice across runtime updates.
- Make the native sidebar and conversation-list surfaces transparent while video plays, preserving native selection highlights and text readability.

## 1.2.1-video.3 — 2026-10-20

- Recognize the current Codex active-page shell and composer attributes; ignore retained hidden pages.
- Clear opaque native page backgrounds while video plays and verify the video layer is visible and does not intercept input.
- Correct the macOS running-app status check for executable paths.
- Detach the watcher into its own process group so closing its launcher cannot stop background maintenance.

## 1.2.1-video.2 — 2026-10-20

- Stream original local MP4 files through a private CDP file handoff, preserving 4K resolution and frame rate without base64 video payloads.
- Allow MP4 files up to 256 MiB and verify decoded dimensions and advancing playback.
- Install and prepare before the single controlled restart, fixing installation failure when Codex reopens during preparation.
- Remove soft-success startup reporting; renderer and video verification must pass.


## 1.2.1-video.1 — 2026-10-20

- Add macOS MP4 backgrounds (32 MiB maximum), muted looping playback, hidden/reduced-motion suspension, and static image fallback.
- Release decoders, event listeners, and Blob URLs when switching themes, pausing, or restoring.
- Carry video files through stable theme staging, source validation, payload fingerprints, and live Verify.
- Add a bundled one-click video/image Skill and a SwiftBar video picker without new dependencies.


## 1.2.0 — 2026-07-17

### 新增

- 自适应图像主题引擎：通过本地 Canvas 分析亮度、主色、视觉焦点、左右安全区和图像比例，为任意背景图生成协调的浅色/深色外观；图片不会上传到外部服务。
- 主题新增 `appearance: auto | light | dark` 与 `art.focusX/focusY`（`0..1`）、`art.safeArea: auto | left | right | center | none`、`art.taskMode: auto | ambient | banner | off` 配置；显式值优先于自动分析。
- 首页与任务页按图像比例采用不同呈现：超宽图在任务页使用横幅和纵向渐隐，普通比例图使用低噪环境背景，也可用 `taskMode=off` 关闭任务页图像。
- 内置「桥本有菜」实测精选预设与 5 套可复现的程序化抽象预设；安装后幂等播种到主题库，菜单栏或 `switch-theme-macos.sh` 可直接切换，且绝不覆盖 `custom-*` 用户主题。
- 新增中英文参考图生图指南：明确 `2560 × 1440`、Image 1/2/3 职责、裁切安全区、原创/已授权成年身份两套流程，以及“文案和小照片不烘焙进背景”的约束。

### 改进

- watcher 在文档壳层出现后立即注入，按 CSS/主题/图片内容哈希热刷新并复用静态 payload；同一主题切换不再重复启动守护进程，减少原生界面闪现和后台轮询。
- 主题切换先完整暂存图片，最后原子发布 `theme.json`；全新安装在没有活动主题时先启用通用的「午夜极光」，已有活动主题保持不变。
- `load-image-theme-macos.sh` 可通过 `--appearance`、`--focus-x`、`--focus-y`、`--safe-area`、`--task-mode` 精确调节构图；旧主题缺省时使用安全自适应值。

### 修复

- 保留 Codex 原生固定顶栏的定位与层级，避免打开任务侧边面板后开关被推出主区、导致面板无法关闭。
- 修复亮色背景图在 ChatGPT/Codex 暗色模式下错误生成浅色皮肤壳的问题。`appearance=auto` 现在跟随原生/系统外观，避免白字叠在浅色面板上导致界面不可读。
- 修复从“设置 > 外观”返回“已安排的任务”等无输入框路由后，验证器因找不到 composer 而拒绝合法 Codex 主界面的问题。
- 首页不再在原生标题栏注入主题名称和圆形伪按钮；watcher 为后续完整导航注册更早的注入并缩短目标探测间隔，以减少原生界面先闪现再换肤的时间。
- 超宽任务横幅不再让背景伪元素在固定高度直接结束；图片仍按原比例置顶，遮罩与渐隐延续到整页，减少明显的底部截断感。
- 修复普通宽屏图片被 `contain` 与 `cover` 双层重复绘制的问题；标准 16:9 现在始终使用一张 `cover` 整窗背景，并按安全区和焦点保留主体。
- 修复沉浸任务页侧栏原生缩放热区继承背景后向主区延伸 20px、形成明显竖向分割的问题；同时统一顶栏、侧栏与输入框的半透明材质，并为输入框补上不受原生边框宽度影响的内描边。
- 16:9 宽图现在在首页也使用单张整窗背景，不再把同一图片重复绘制成 hero 卡片；插件、已安排和 Pull Requests 等工具路由会清除原生整块黑底，并将搜索框和撰写器统一为单层表面。任务页同时移除独立顶栏底色和撰写器后的原生底部渐变，避免顶部、底部出现重叠面板。
- SwiftBar 菜单栏标题恢复调色板图标，并加入静态回归检查，避免升级后只剩 `Skin ON` 文本。
- 浅色模式撰写器改为更通透的珍珠白表面，并修复占位文字被原生双重透明度削弱的问题；暗色模式继续使用单层实色表面。
- 兼容 Codex Desktop 更名：官方桌面端在 26.707 从 `Codex.app` 更名为 `ChatGPT.app`（bundle id 仍是 com.openai.codex）。发现 / 启动流程现在两种名字都识别，且 `state.json` 缓存的旧 app 路径若已不存在则不再劫持启动——此前更新后会因指向旧 `Codex.app` 而启动失败
- 菜单栏与 `status-dream-skin-macos.sh` 不再依赖 `/usr/bin/python3`（macOS 12.3+ 默认不预装）读取主题名与运行状态，改用纯 shell 解析；此前在未装 Xcode 命令行工具的机器上，主题名会退化成 id、`--json` 状态直接失效

### 安全

- CDP 端点必须由已验证的官方 Codex 可执行文件或其子进程监听；WebSocket 还会校验 loopback、page ID、路径、无重定向，并安全处理畸形消息和发送异常。
- 主题配置与图片使用真实路径 containment，拒绝 symlink 越界、空文件、超过 16 MB、单边超过 16384 px 或超过 50 MP 的图片；主题展示文本拒绝换行和控制字符。
- AppleScript 动态内容全部通过 argv 传递；SwiftBar 过滤主题 ID、文件名和菜单文本，避免主题元数据改变菜单属性或命令参数。
- `config.toml` 只按严格 UTF-8 读取，拒绝 NUL、歧义多行 TOML、重复 `[desktop]`，通过用户级锁、原始字节核验和同目录原子替换保护中文配置与并发写入。
- 暂停和恢复会在 TERM/KILL 前后核验 watcher 的 PID、启动时间、Node 和 injector 路径；不匹配的进程绝不结束，已确认 watcher 若无法停止则保留 state 并中止，不再报告假成功。

### 测试

- 覆盖每套预设的可注入性与播种幂等、首页/任务 renderer、早期注入、主题原子切换、中文与 CRLF/BOM 配置往返、非法 UTF-8/NUL/TOML 拒绝、路径穿越、symlink 越界、控制字符和像素炸弹。

### 说明

- 「桥本有菜」源图、标准化背景和浅/暗实机截图分别归档；截图只作预览，不能当背景导入。用户提供的图像不自动获得 MIT 素材许可，公开再分发前仍需确认相应权利。

---

## 1.1.2 — 2026-07-16

### 修复

- 修正内置主题引用了未随仓库发布的背景文件，恢复使用 bundled abstract demo 素材
- 更新主题配置往返测试：安装只备份外观键，不再错误断言强制切换深色模式
- 恢复原本没有 `[desktop]` 配置段的用户设置时，不再额外写入空段
- 热切换读取运行状态时复用 Codex 内置 Node.js，不再依赖系统 `python3` 或执行 `eval`
- 显式传入的 `--theme-dir` 缺少 `theme.json` 时立即报错，不再静默回退到内置 demo 主题

---

## 1.1.1 — 2026-07-16

### 修复

- 不再用 `launchctl submit` 托管带调试口的 Codex：退出 SwiftBar / 关掉 Codex 后不应再被 launchd 自动拉起
- 暂停与完全恢复时清理 `com.openai.codex-dream-skin-studio.app` 作业

---

## 1.1.0 — 2026-07-16

### 新增

- SwiftBar 菜单栏入口（`Install Menu Bar.command`）：应用 / 暂停 / 换图 / 切换已保存主题 / 从图片文件夹加载 / 完全恢复
- 主题库（`themes/`）与图片投放目录（`images/`）动态加载，不再把 README 图库合成图当背景素材
- 按 Codex 应用浅色 / 深色自动切换皮肤壳（`data-dream-shell`）

### 改进

- CDP 已就绪时热切换主题（重启 injector + 短时注入），换图更快
- 注入校验放宽（项目选择器等可选），避免误杀已生效皮肤
- 注入守护优先 `nohup`；暂停状态与路径大小写下停止逻辑更稳
- 安装时不再强制 `appearanceTheme=dark`，只备份桌面外观相关键，便于恢复与自动适配

### 视觉

- 以原版暗色 portal CSS 为结构底，叠加 light 壳与更薄横幅遮罩，减轻「换图看不清」
- 示例纯横幅：`docs/images/banner-arina-hashimoto-pure-no-ui.png`（无人机 UI 合成）

### 说明

- `docs/images/gallery/` 仅为效果预览，不要当 `theme` 背景导入

---

## 1.0.0 — 2026-07-15

- 发布 macOS 通用主题制作器，而不是固定角色皮肤。
- 加入 Finder 选图、自动 JPEG 转换、主题命名和高级配色参数。
- 主页使用独立横幅，任务页使用背景与磨砂层，完整保留原生交互。
- 改为复用并验证 Codex 官方签名 Node.js，不再附带大型运行时或依赖全局 Node。
- 增加独立安装目录、桌面启动/定制/验证/恢复入口。
- 增加官方签名、CDP 端口归属、PID 身份、刷新重注入和真实 DOM 自检。
- 增加原子配置备份、精确恢复、静态测试、安装恢复循环和发布打包脚本。
- 清理固定角色内部命名；传送门主题仅作为可替换示例素材。
- 开源树：示例横幅改为无角色抽象几何图；验收截图不入库；补充 NOTICE / README 商标与安全边界说明。
