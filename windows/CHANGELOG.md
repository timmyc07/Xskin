# Windows Changelog

## 1.8.0 — 2026-10-22 (source; Windows validation pending)

- Use Codex (Xskin) for one explicit official launch. Retire legacy launch monitoring; ordinary existing apps and failed launches are never closed/reopened by startup.
- Preserve saved media, language, opacity and pause. Paused shortcuts open ordinary Codex. Owned-entry migration preserves foreign same-name shortcuts and existing data.
- Preserve the running official app during runtime upgrades. Windows stops verified injector pipe holders before the legacy host, preserves bundled Node and no longer waits on grandchild output EOF.
- macOS includes draft conversation IDs, lifecycle fan animation, long-log incremental reads and new-session overlay fixes.
- Document CDP/CSS authorization as unconfirmed and distinguish automated checks from pending physical cold-start/login/Store verification.

## Xskin Windows 1.7.1 — 2026-10-22

- Resolve new local tasks through the active composer's official conversation ID while the sidebar still holds a temporary `client-new-thread` ID. Reject ambiguous IDs and route transitions instead of showing another task's usage.
- Give each overlay installation a stable serializable identity so the CDP bridge keeps its exact-file subscription instead of replacing it every 250ms.
- Start and stop the fan from official task lifecycle events; use token deltas only to adjust its speed. Completed or interrupted tasks no longer keep spinning for a fixed eight seconds.
- Cover automatic shutdown with launch recovery so a failure after Codex exits can reopen the app. Preserve identity checks and non-forced shutdown, retain the restart guard when a recovery app is running, and save the last automatic-apply failure for diagnosis.

## Xskin Windows 1.7.0 — 2026-10-22

- Add a compact token overlay below the Codex task composer: show the current conversation's cumulative tokens, cached input tokens, remaining context percentage, subscription plan and remaining subscription quota when present in official local session logs. Keep missing values visibly unknown; cached tokens are a subset of input tokens, not additional consumption.
- Show the latest model call's cache hit ratio, with cache-write tokens only when the source provides them. Do not infer permanent cache contents or expiry.
- Watch the current conversation's exact session file with 20ms write coalescing, 250ms route/visibility checks and a 5-second metadata heartbeat. Serialize reads, deduplicate snapshots and read bounded incremental tails instead of repeatedly scanning session directories. Updates follow actual source writes; no simulated consumption is shown.
- Scale the CSS fan animation to positive token deltas. Stop it when idle, hidden or Reduce Motion is enabled; reuse the verified loopback CDP connection and read local usage records without network requests or reading `auth.json`.
- Select and validate an available Node runtime before resuming a watcher after engine replacement or rollback, including updates that remove the previous bundled `node.exe`.
- Replace the owned legacy Startup shortcut with a per-user Windows Task Scheduler logon task. Start the monitor independently of Codex and the panel, using the current user's interactive session without administrator privileges, execution timeout or battery restrictions. Preserve unrelated startup entries.
- Resolve MSIX-redirected state directories through a Windows file handle and preserve that path across installation, panel commands, tray, start, verify, restore and engine updates. The login task now finds the same saved backgrounds and runtime from outside the Codex package context; custom directories remain supported.
- Handle ordinary Codex launches up to 15 seconds old even when the login monitor starts just after the app. Leave older windows untouched, retain the 30-second handoff guard and never force an automatic restart.
- Initialize the managed engine, saved preset and per-user logon task on the first installation or first panel launch. Persist setup completion so later launches respect explicit disable, Pause and Restore choices.
- Package a GUI-only `Install Xskin.exe` and use the quiet launcher for installer, logon-task and managed-shortcut commands. Run the fixed system PowerShell child with `CreateNoWindow`; opening `xskin.exe` directly also performs first-use setup. Node.js is bundled, with no separate Node or Flutter installation required.
- Allow installation while one registered Codex version is open: gracefully close it, install and reopen it with the saved background, or ordinary Codex when paused. Refuse multiple active versions, never force shutdown, and attempt to reopen the original app if setup fails after closing it.
- Resolve background media relative to the canonical regular `theme.json` file so MSIX file redirection does not reject valid saved backgrounds. Retain symlink rejection and checks that media stays inside the resolved theme directory.
- Add shared parser and renderer regression checks to the Windows test runner. Existing managed-engine installation and release packaging include the new runtime files.

## Xskin Windows 1.6.0 — 2026-10-22

- Apply saved backgrounds when opening the original official Codex app from Start, Desktop or the taskbar. The opt-in per-user Startup monitor works with the Xskin panel closed; dedicated Codex (Xskin) shortcuts are no longer required or created.
- Check for new launches once per second. Verify the registered Store executable, session, PID and exact start time; only gracefully reopen an ordinary launch at most 15 seconds old. Leave existing windows and explicit debugging launches alone. Persist a 30-second handoff guard, never retry the same launch, and never force an automatic restart.
- Fix Windows close-to-tray blocking that handoff. Use Windows Restart Manager with only the exact main PID/start time registered and no force flag; wait for the official process tree to exit before reopening. Reuse the same graceful request for manual start/restore and rollback.
- Read and write startup and migrated launch shortcuts through the native Unicode Shell Link interface. Preserve Chinese and emoji in paths on non-Chinese Windows instead of storing question marks. Exercise the real monitor with Unicode shortcut filenames and state directories; compile GUI regression fixtures with the built-in .NET Framework compiler on both PowerShell hosts.
- Pause, Restore and disabling the preference stop the monitor and remove its owned Startup entry. Enabling or disabling removes only the previous Xskin-owned Desktop/Start launch shortcuts; unrelated shortcuts and official entries remain intact. Enable the preference once in the updated panel to replace the old shortcut-based setup.
- Stop and resume the verified monitor during managed-engine replacement and rollback. Preserve saved media, pause, preferences and the last handoff time. Login only starts the monitor; it does not open Codex.
- Update all four interface languages and add isolated Windows tests for identity/age/session checks, refused close, duplicate/loop prevention, pause, real monitor start/stop, failed enable, runtime replacement/rollback and owned-shortcut migration. Real GUI fixtures prove close-to-tray shutdown and refusal without force.
- Validate installed 1.6.0 with the panel closed: exit the official app, open its registered AppsFolder entry through the Windows Shell Open verb, observe an ordinary main process followed by one stable background-enabled process, and verify original 3840×2160 video playback (46 frames, zero drops in the first sample; 902 frames, one drop in a later 30-second read-only check). Saved media, mask and preferences remain unchanged. A physical mouse click and a new Windows login were not repeated in this run.

## Xskin Windows 1.5.5 — 2026-10-22

- Fix a black preview when replacing one video with another. Bind each video view to its current controller so width/height subscriptions follow the new player; retain paused first-frame previews, original media and frame rate. Extend the native integration test to start with a video, replace it and require a visible texture before and after playback.
- Port macOS 1.6.1 native Work shell detection to Windows injection, routing and verification. Recognize main surfaces without an active-page wrapper while excluding inactive pages.
- Keep guarded early injection connected for up to ten seconds while React creates a late shell, including before the HTML element exists. Attach the original video when ready instead of rejecting a completed document and entering the previous retry cooldown. Cancel pending observers on pause, theme change, expiry and shutdown.
- Retain Windows package/browser identity and loopback checks, managed launch shortcuts and original-quality Dot playback. macOS application-launch notifications and LaunchAgent behavior remain platform-specific; no Windows system service is added.

## Xskin Windows 1.5.4 — 2026-10-22

- Fix the main-window **Your dot** conversation remaining opaque: clear its nested embedded messaging roots and thread panes so the existing original-quality video shows through. Keep message bubbles and composer styling; reject opaque inner messaging layers during verification instead of checking only the outer shell. A 60-second live test retained 3840×2160 at approximately 30 fps with zero added dropped frames, and changing pixels were captured inside the formerly opaque conversation area.
- Exclude Dot message rows from generic article styling so the native bubbles do not sit inside a second full-width background, border, shadow and blur.
- Recognize the official app's embedded `https://chatgpt.com` Work webview and Dot avatar control surfaces, while excluding unrelated webviews, empty detached windows and foreign origins. Keep the registered-app/browser identity and loopback checks.
- Apply the original video and one full-window mask to Work, including its sidebar. Follow the native embedder's actual visibility: preloaded hidden Work pages may report `document.hidden === false` and defer decoding. Verify them as explicitly suspended, resume on display, and pause the covered Codex video instead of decoding both backgrounds continuously.
- Play the original video in Dot composer/activity cards using one shared player, clipped to their rounded bounds. Follow card movement, animation and size changes; pause when all cards are hidden. Keep the surrounding desktop transparent and retain poster fallback for loading, errors and Reduce Motion. Reload, pause and removal clean up observers and animation callbacks.
- Verify live Dot playback for 60 seconds: original 3840×2160, playback rate 1, 1,800 frames, 29.994 fps and zero added dropped frames. Both visible cards changed pixels while sampled desktop pixels stayed fully transparent. Dot animation adds one player; this is playback validation, not a GPU/private-memory savings claim.
- Add GPU dedicated/shared allocation and per-process private-memory reporting to the live sampler. Four interleaved 60-second playback measurements failed to establish a GPU/private-memory improvement from releasing the poster; discard that experiment. This release fixes background coverage and playback; no sustained-resource reduction is claimed.

## Xskin Windows 1.5.3 — 2026-10-21

- Stream MP4 integrity checks through a 1 MiB buffer and reuse the content digest when fingerprinting a theme. Keep the complete-file audit, file-change guards and original media untouched.
- In three fresh-process runs of 30 theme loads, reduce median process CPU time by 37.3% and peak RSS by 45.1%. Preserve the original media, resolution and frame rate; these results apply to loading, not continuous playback.
- Add separate benchmarks for theme-load CPU/peak memory and live Windows CPU/GPU/private memory. Sustained GPU and private-memory improvements have not been established.
- Safely stop and resume the verified background watcher when replacing the managed engine, including rollback. Preserve paused state, saved media and preferences; keep the watcher working directory outside the engine so future upgrades remain possible.
- Complete panel commands when their explicit result arrives, even if the background watcher keeps inherited output pipes open. Keep launcher exit-status and error checks.

## Xskin Windows 1.5.2 — 2026-10-21

- Avoid scanning the entire Codex document for ordinary streamed message content. Refresh theme routing only when shell/home markers change, including existing-page activation; keep periodic repair and resize handling.
- Publish the Windows x64 Flutter portable ZIP with bundled Node.js, a SHA-256 checksum and a separate Windows release tag. macOS keeps its existing release.

## Xskin Windows 1.5.1 — 2026-10-21

- Allow launcher reapplication when Windows still enumerates an exited injector, while rejecting running or unrelated processes.
- Use the registered Codex application's icon for Desktop/Start automatic-background shortcuts, while retaining the managed background launcher.
- Port the macOS 1.5.1 renderer, stylesheet, current Codex shell selectors, adaptive layout, video lifecycle, and exact theme/mask/playback verification. Retire the old Windows renderer selectors that prevented Apply from finding Codex.
- Match the Mac panel's dark preview/source/preferences flow, pending/applied state, image dimensions, paused original-quality video preview, drag-and-drop, four persisted interface languages, and independent debounced whole-window mask updates.
- Import MP4 directly without waiting for a screenshot or PNG conversion. Normalize common image formats through Windows Imaging Component to JPEG, up to 4096px, with the same 50 MiB source and 50MP limits. HEIC/HEIF and WebP use the installed Windows codecs.
- Add the Windows equivalent of the Mac direct-launch entry: managed Desktop/Start shortcuts named Codex (Xskin), with ownership checks and automatic apply while the panel is closed. Pause/Restore disable these entries; original Codex shortcuts and binaries remain intact.
- Bundle Node.js and its license, use a managed engine for Apply, preserve settings across imports, and clean completed/replaced drafts. Test the real 4K pending video in the full Flutter import/playback flow.
- Supply the original video length required by the Mac renderer's file validation, and preserve renderer errors in the handoff log. The missing length prevented the first live video handoff despite a healthy Flutter preview.

## Xskin Windows 1.0.2 — 2026-10-21

- Display the packaged version in the panel and license page so a stale shortcut is immediately recognizable.
- Exercise the real panel import handler and verify that successful MP4 import enables Apply and supports muted preview playback.

## Xskin Windows 1.0.1 — 2026-10-21

- Fix video import remaining busy when a large poster stalls in the Dart/PowerShell stdin pipe. Transfer requests through validated temporary UTF-8 files and remove them after completion or failure.
- Show the current import stage and test large requests, cleanup, and actual MP4 decoding through pending-theme storage.

## Xskin Windows 1.0.0 — 2026-10-21

- Add a Flutter desktop panel with a native file picker, image/MP4 previews, muted playback, mask controls, saved themes, pause, launch and restore.
- Keep imports pending until Apply; persist pending drafts and mask settings. Verify Apply and roll back the previous image/video theme and pause state on failure.
- Preserve original MP4 bytes up to 256 MiB and transfer local files over CDP without embedding video bytes in JavaScript. Restore video after reload; suspend for hidden documents or reduced motion.
- Keep the native Codex layout under one continuous wallpaper and mask. Existing adaptive image themes remain usable in the retained tray.
- Add Flutter widget/engine-bridge regression tests, a Windows release build script and GitHub Actions packaging.

## 1.2.0 — 2026-07-17

### 新增

- Windows 安装器会先校验并原子复制运行所需的 `assets/` 与 `scripts/` 到 `%LOCALAPPDATA%\CodexDreamSkin\engine`，启动、恢复和托盘快捷方式统一指向该受管副本；安装完成后可移动或删除源码克隆。重装前若旧托盘仍在运行，安装器会明确要求退出，避免新旧脚本混用。
- 渲染层支持通用自适应图像主题：本地 Canvas 采样图像亮度、主色、焦点和比例，为壁纸层提供自适应色彩与构图建议；支持 `appearance: auto | light | dark`、`art.focusX/focusY`（`0..1`）、`art.safeArea: auto | left | right | center | none`、`art.taskMode: auto | ambient | banner | off`。外观壳仍由显式主题或原生外观信号决定。
- 显式外观与艺术元数据优先于分析结果；超宽图默认任务横幅，普通比例图默认环境背景，`off` 可关闭任务页图像。分析完全在渲染器本地完成，不上传图片。
- Windows 发行 payload 直接读取受管 `theme.json`，完整支持与 macOS 一致的外观、焦点、安全区和任务页模式契约，不再依赖预先设置的 renderer 全局变量。
- 新增纯 PowerShell/Windows Forms 系统托盘入口，可快速查看状态、应用或暂停皮肤、更换背景、保存和切换主题、打开图片文件夹，以及执行完整恢复；不引入第三方依赖。
- 新增 `%LOCALAPPDATA%\CodexDreamSkin` 主题仓库，用户图片会复制到受管目录，活动主题和已保存主题均保持图片与配置自包含。
- Windows 首次安装会把 UI-free 的 2560 × 1440「桥本有菜」设为活动主题并播种到「已保存主题」，无需再从 macOS 目录手动导入。

### 修复

- 保留 Codex 原生固定顶栏的定位与层级，避免打开任务侧边面板后开关被推出主区、导致面板无法关闭。
- 暗色外观下，原生顶部菜单栏现在使用深色半透明可读性层，并提高菜单按钮与图标的文字对比度，避免浅色壁纸让导航项难以辨认。
- 渲染层现在只在检测到完整 Codex 主界面壳层时启用皮肤；宠物等透明辅助窗口会主动清理主题背景与装饰节点，避免出现遮挡宠物的矩形背景框。
- 16:9 及更宽图像现在作为侧栏与主区共享的单张整窗背景；首页、任务、插件、计划任务和 Pull Requests 路由使用同一透明顶栏与连续表面，不再在卡片或任务层重复裁切图片。
- 移除主区原生顶部渐隐和 composer 后方底部渐隐；浅色与深色 composer 均只保留一个可读表面，避免出现双层输入框或不连续底板。
- watcher 可在不重启 Codex 的情况下响应主题文件和暂停标记变化，重载 renderer 后仍保持当前应用或暂停状态。
- watcher 会为已连接的 renderer 注册带 generation 检查的 early payload；后续 reload/navigation 优先在新文档建立皮肤，CDP 不支持时仍保留 load-event 兜底注入。
- watcher 改用主题 JSON 与图片字节的 SHA-256 修订值识别热更新，并以轻量 stat 快速路径配合 30 秒强哈希审计，避免每 1.2 秒重读整张图片；同步读取图片尺寸后再构建首帧 payload，避免宽屏主题先以错误比例闪现。
- 主题导入与注入均拒绝空图片和超过 16 MB 的图片；注入前还会拒绝任一边超过 16384px 或总像素超过 50MP 的声明尺寸，降低压缩炸弹风险。完整恢复会终止托盘进程，暂停菜单使用独立闭包值，避免旧托盘重新应用皮肤或连续点击状态反转错误。
- 托盘导入新背景时会重置为 `auto` 焦点、安全区、任务模式和外观，不再错误继承上一张预设的人物位置；从「已保存主题」切换时仍保留该主题的显式元数据。
- PowerShell 主题仓库除词法路径包含检查外，还会逐级拒绝 junction、符号链接等 reparse point；已保存主题不能借链接逃出受管目录。
- 主题仓库会在创建受管目录以及关键图片复制/移动的前后拒绝 reparse point，暂停标记写入前也会检查路径；状态文件仍写入受管根目录并使用 UTF-8 原子替换。导入在复制前复用 Node 图片元数据解析器拒绝超过 16384px 或 50MP 的图片。
- `appearance: auto` 优先读取原生计算后的 `color-scheme`，只有缺少可信原生信号时才回退到系统 `prefers-color-scheme`；横幅任务页与环境任务页共用连续整窗壁纸，不再单独截一块图。
- 启动会先完成 state 校验和重启确认，再清除暂停标记；取消重启提示或遇到校验失败时，已有的暂停 watcher 会继续保持暂停。
- 原生 `color-scheme` 采样会抑制并排空临时 class 变更产生的 observer 记录，不再每约 180ms 自触发一次完整 renderer ensure。
- 安装不再把用户的 `appearanceTheme` 强制改成 `light`；检测到旧版精确托管的浅色三元组时才按已有备份安全迁移，当前安装的恢复也不会覆盖用户后来选择的外观。
- `--verify`、`--once` 和 `--remove` 现在显式把预期 Browser ID 传入一次性目标发现，不再因引用越域的 CLI 变量而等待超时并导致启动验证回滚。
- 记录中的 injector PID 若仍存活但身份不匹配，启动与恢复会保留 state 并中止，不再归档后继续操作未知进程。
- Windows PowerShell 5.1 现在使用同目录临时备份调用 `File.Replace`，避免空备份参数被绑定为非法路径而导致现有 `config.toml` 无法更新。
- 修复 Windows PowerShell 5.1 下注入器/Node 一旦向 stderr 输出（崩溃堆栈、超时报错、Node 警告）就把启动脚本炸成 `NativeCommandError` 的问题：现在原生命令统一经 `Invoke-DreamSkinNative` 执行，verify 失败时 `verify.log` 能真正写出本次输出与退出码，回滚清除注入的路径也不再被 stderr 干扰误判。
- 带引号键名和 CRLF 的 `[desktop]` 配置现在可以逐字节往返恢复；新版 Codex 写入的非冲突 `[desktop.*]` 子表会原样保留，仅在子表与 Dream Skin 必须管理的标量键冲突时拒绝修改。
- Codex 的启动、失败回滚和恢复重开统一通过已注册 Store 包清单中的 AppUserModelId 激活，不再直接执行可能被 WindowsApps 权限拒绝的 `ChatGPT.exe`；CDP 和自定义 profile 参数仍通过系统包激活接口传递。
- 安装与 `-RestoreBaseTheme` 现在严格按 UTF-8 读取，保留原换行风格，并以无 BOM、同目录原子替换方式写回 `config.toml`，避免中文项目名称乱码或导致 Codex 无法启动。
- 遇到带 BOM/无 BOM 的 UTF-16、NUL 字符、无效 UTF-8 或写入期间被其他程序改动的配置时停止修改，不再静默转码或覆盖较新的内容。
- 安装会在当前注册包或 state 记录的旧 Codex 仍运行时明确提示先关闭；配置临时文件写完后会在原子替换前再次核对原始字节，进一步缩小并发覆盖窗口。
- 配置恢复只修改 `[desktop]` 内的外观键，不再误碰其他 section 的同名配置；新增 `-RecoverConfigBackup` 用于显式恢复安装前原始文件，并先保存当前文件。
- 完成配置恢复后会归档本轮安装前备份，使下一次安装重新保存当时的配置，避免重复安装使用过期主题值。
- schema 3 记录的旧 injector PID 只有在 Node 精确路径、脚本命令行、端口、Browser ID 和进程启动时间匹配时才会停止；兼容旧 state 时仍要求原 state 含脚本路径和端口，且 PID 仍匹配 `node.exe`、脚本与 watch 参数，无法确认便归档而不结束进程。
- 启动验证失败会停止 injector、清理状态，并把本次新开的 Codex 恢复为无调试口的普通启动。
- Restore 使用状态中记录的端口，先关闭运行态再写配置；失败时保留 state 并尽量正常重开 Codex，不再留下半完成状态或静默报告假成功。
- Store 更新后若旧版本仍持有已保存的 CDP，会按 state 中的精确路径关闭；检测到新旧版本同时运行时安全停止并提示人工处理。
- 支持带注释或引号的 `[desktop]` 表头与目标键；遇到转义同义键、多行字符串/数组、dotted key 或重复目标键时会在写入前明确停止，避免把合法但无法安全行编辑的 TOML 改坏。
- Store 更新后的旧路径只有在 Appx full name、family name、安装目录和可执行文件仍能与系统注册包匹配时才允许自动关闭；无法证明归属时保留状态并要求手动关闭。
- Store 更新时，仍在运行且身份有效的旧版本 CDP 会直接热重应用；旧版本若未开启 CDP，则在获得现有重启授权后关闭并启动当前注册版本，避免并行打开两个 Codex。
- 遇到 `[desktop.*]` 子表时会在写配置前停止，避免外观标量键与 TOML 子表冲突；热重应用验证失败时会尽力移除本次残余样式。
- Restore 不再要求当前环境仍能找到 Node；schema 3 清理会严格匹配安装时记录的 Node 路径，Node 已升级或卸载也不影响安全恢复。

### 安全

- Codex 以 `--remote-debugging-address=127.0.0.1` 启动；同时校验监听 PID 对应精确的官方 Store 可执行文件。
- 说明：loopback 可阻止局域网访问，但 CDP 不验证同一 Windows 用户下的其他本地进程；不用皮肤时建议执行 Restore 关闭调试会话。
- Appx 发现要求 `SignatureKind=Store` 且不是 development mode，同名开发包或侧载包不会被当作官方 Codex 启动或关闭。
- injector 只连接相同端口、page ID 与路径一致的 loopback WebSocket，并在注入前确认真实 Codex shell DOM 标记。
- watcher 绑定启动时的 CDP Browser ID，并持续持有 Browser WebSocket 作为身份锚；原浏览器关闭或端口被复用时直接退出，不会连接到新端点。
- CDP HTTP、WebSocket 建连与命令均加入超时，HTTP 探测拒绝重定向，异常目标不会无限挂起或把探测带离 loopback。
- injector 日志与验证文件不再记录窗口标题、页面路由、页面文本或被拒绝 URL 的内容，只保留临时 target ID、结构标记和布局结果。
- 快捷方式不再静默携带 `-RestartExisting`；需要重启时先向用户确认。
- install、start、restore 和 verify 使用当前用户互斥锁，避免双击或并发命令竞争端口、配置和 state。

### 改进

- 默认端口被占用时自动在后续 100 个端口内选择空闲端口；显式指定的冲突端口仍安全失败。
- injector 会等待首轮注入完成再判定启动成功；目标异常时使用有上限的指数退避和限频日志，减少后台唤醒和日志膨胀。
- 明确要求 Node.js 22 或更新版本，并记录 `process.execPath`，兼容 PATH 中的启动转发程序。
- 带空格或结尾反斜杠的测试 profile 路径现在按 Windows 命令行规则引用。

### 测试

- 增加渲染层辅助窗口与 early-bootstrap 回归测试，覆盖主窗口正常注入、透明辅助窗口清理残余样式、shell guard、generation 切换、computed-scheme observer 排空，以及辅助目标随后成为完整主界面时可重新启用皮肤。
- 增加本地 HTTP/CDP fixture，逐项执行 `--verify`、`--once` 和 `--remove`，确认一次性目标发现会校验 Browser ID 且不再访问未定义变量。
- 增加受管主题初始化、换图、保存、切换、暂停标记、payload 配置嵌入、整窗 CSS 和托盘菜单静态回归检查。
- 增加中文项目路径、CRLF/LF、UTF-16 与歧义 TOML 拒绝、并发写检测、section 隔离、精确恢复、Appx/state 身份、状态归档、payload 构造、Browser ID 和不安全 CDP URL 的回归检查。
