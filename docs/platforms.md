# 平台对照

## 运行模型（两边相同）

```text
用户本机主题工具
    │  启动官方 Codex + 本机 CDP
    ▼
官方 Codex Desktop（不改 asar / 签名）
    │  注入 CSS + 装饰 DOM
    ▼
仍用原生侧栏 / 输入框 / 建议卡
```

## 路径速查

### macOS

| 用途 | 路径 |
|------|------|
| 源码（本整理包） | `Codex-Dream-Skin/macos/` |
| 安装后引擎 | `~/.codex/codex-dream-skin-studio` |
| 状态 / 日志 | `~/Library/Application Support/CodexDreamSkinStudio` |
| Codex 配置 | `~/.codex/config.toml`（仅外观相关项可能被改，可恢复） |

### Windows

| 用途 | 路径 |
|------|------|
| 源码（本整理包） | `Codex-Dream-Skin/windows/` |
| 安装后的受管运行时 | `%LOCALAPPDATA%\CodexDreamSkin\engine` |
| 状态 / 日志 | `%LOCALAPPDATA%\CodexDreamSkin` |
| Codex 配置 | `%USERPROFILE%\.codex\config.toml` |
| 默认 CDP 端口 | 首选 `9335`，冲突时自动选空闲口（Mac 包默认从 `9341` 起） |

Windows 启动、失败回滚与恢复重开均从已注册的 `OpenAI.Codex` 包清单解析 AppUserModelId，并通过系统应用包激活接口传递 CDP 参数；不会直接执行受 WindowsApps ACL 限制的可执行文件路径。

## 能力矩阵

| 功能 | macOS | Windows |
|------|:-----:|:-------:|
| 安装脚本 | ✅ | ✅ |
| 启动 + 注入 | ✅ | ✅ |
| 一键恢复 | ✅ | ✅ |
| 实机 verify / 截图 | ✅ | ✅ |
| 用户选图定制 | ✅ | ✅（系统托盘「更换背景图」） |
| 背景工作室（圖片 / MP4 匯入、預覽、套用） | ✅（SwiftUI macOS .app） | ✅（Flutter Windows .exe） |
| 对话 Token / 缓存 / 额度 / 方案 overlay | ✅（Codex 任务输入框上方） | ✅（Codex 任务输入框上方） |
| 四語介面 / 拖放 / 獨立全版遮罩 | ✅ | ✅（1.5.1） |
| 面板關閉後由 Codex (Xskin) 啟動 | ✅（1.8.0，受管 .app） | ✅（1.8.0，桌面／開始捷徑） |
| 點官方 App 自動套用背景 | ✅（1.8.1，新的普通啟動正常重開一次） | ❌（使用受管捷徑，不自動重開） |
| 本地主题保存 / 切换 | ✅（菜单栏） | ✅（系统托盘） |
| 官方签名校验 | ✅ | Store 签名类型 + 包身份 |
| 客户部署提示词 | ✅ | ❌（可用 Mac 文案改写） |
| 打客户 ZIP | ✅ `build-client-release.sh` | ✅ `scripts/build-release.ps1` |

## 对话 Token overlay

启动 Xskin 注入后，Codex 任务页的文字输入框上方显示一条紧凑状态栏。它按当前任务 ID 匹配官方本机会话记录，显示累计 Token、其中的缓存输入 Token、上下文剩余百分比，以及记录中可用的订阅方案与额度剩余百分比。缓存输入已经包含在输入与总量内，不再重复相加；上下文剩余与订阅额度是不同指标。首页不显示空用量列；Work / Dot 不显示其他对话的数据。记录尚未提供的字段显示未知，不从模型名称推测方案，也不把额度百分比换算成 Token 数量。

Windows 优先读取当前输入框的正式 conversation ID，支持侧栏仍保留 `client-new-thread` 临时 ID 的新对话；正式侧栏 ID 与输入框 ID 不一致时先清空数据，避免切换途中显示其他对话的用量。每次 overlay 安装使用可序列化且稳定的标识，保留当前会话的文件订阅。

缓存命中条使用最近一次模型调用的 `cached_input_tokens / input_tokens`，不是累计缓存比例；缓存写入量仅在官方记录提供该字段时显示。10 月 21 日 [prompt caching 公告](https://x.com/thsottiaux/status/2112712984644784534) 中的「永久缓存」无法从用量记录还原成内容清单，因此 overlay 不推算缓存库存或失效时间。

数据源通过 `fs.watch` 将通知筛选到当前对话的确切记录文件，以 20ms 合并连续写入通知；250ms 检查当前路由与可见性，5 秒元数据心跳处理漏失通知、文件替换及额度失效。读取按顺序进行，相同结果去重，仅增量读取有上限的文件尾部，不以毫秒频率重复扫描整个会话目录。显示延迟仍取决于官方何时写入用量事件，不生成虚构的实时消耗。

Windows 新任务的记录文件尚未创建时会暂时监听其确切 UUID 的文件创建通知。首次连接长会话若在用量檔尾找不到任务状态，会按最多 1 MiB 的区块向前查找最近一次任务事件；后续大段写入只检查新增范围，不反复重读旧历史。

小风扇的 CSS 转速随新增 Token 的速度变化；Windows 从官方 `task_started`、`task_complete` 与 `turn_aborted` 事件判断任务是否运行，任务结束即停止，不再固定延转八秒。页面隐藏或启用 Reduce Motion 时停止动画。数据读取复用现有注入进程与经过身份检查的 loopback CDP，仅访问本机会话用量与运行状态字段；不会读取 `auth.json`、发送网络请求或改写官方会话记录。官方事件按批次写入，因此显示和转速会随事件更新，不能代表逐 Token 的即时遥测。Pause / Restore 随主题注入一起移除此状态栏。

实现前参考了 [codex-token-overlay](https://github.com/soleillevant0125/codex-token-overlay) 与 [codex-token-meter](https://github.com/prefect12/codex-token-meter) 的开源方案；运行时沿用项目现有脚本与浏览器平台能力，没有增加这些项目作为依赖。

### 2026-10-23 overlay layout validation

The subsequent unreleased macOS 1.8.3 / Windows 1.8.2 source addresses missing long-tail usage and utility/settings/menu material coverage. Before the native-header follow-up, full macOS tests/native build, 91 browser-fixture checks and the [Windows runner/Flutter/package CI](https://github.com/timmyc07/Xskin/actions/runs/39829869364) passed. The live Mac update preserved the official process, selected media/theme, config bytes and language. The subsequent header fix adds native surface tokens, clears sticky-header decoration and makes Verify report missing header coverage / reject stale CSS. See [surface coverage and actual validation](surface-materials.md); earlier release results below remain historical. Complete official-page visual checks and physical Windows checks remain pending.

The native-header follow-up at `8bf562d` passed the full macOS runner/native build, eight portable Windows regression files and 168 checks in the expanded browser fixture. The new [Windows runner/Flutter/package CI](https://github.com/timmyc07/Xskin/actions/runs/39835142751) also passed. The reported native Space header has not been visually verified: direct native computer-use access was rejected on safety grounds, and the current task-page self-check does not contain that header.


macOS 1.8.2 / Windows 1.8.1 move the usage strip above the input in normal flow and hide empty Home rows. The native toolbar keeps its placement, size and corners. Dark/light image surfaces use alpha 0.58/0.70; video composer and toolbar share alpha 0.38.

- An independent browser fixture using the actual CSS/overlay passed at 320, 600 and 1280 px: no horizontal overflow, no overlap, 8 px separation from the input and native footer, and working toolbar clicks. Home, light and video material checks passed. Fixture screenshots contain only sample data, not private chats.
- Full macOS tests and native 1.8.2 build passed. Updating the live Xskin connection passed its current-page self-check without restarting Codex; official process identity, selected media/theme digest and config bytes were unchanged.
- Windows full runner, Flutter analysis, all 6 Flutter tests, release build and package passed at runtime commit `7689cb2`: [Windows CI](https://github.com/timmyc07/Xskin/actions/runs/39812525811). Local macOS Flutter analysis also passed, with 5 tests passed and the Windows bridge test skipped. Eight portable Windows regression files passed locally.
- Formal home/task visual inspection in the official app remains pending because native computer-use access was denied. Browser fixtures and self-checks do not replace that inspection or physical Windows verification. No alternate app capture/navigation bypass was used.

The GitHub workflow summary lagged behind its completed job; the result above was checked against the complete job log and finalized artifact, rather than the summary badge. [GitHub status](https://www.githubstatus.com/api/v2/summary.json) reported degraded Actions performance during this run.

## 自适应图像主题契约

同一套主题配置在两个渲染器中使用相同的外观约定。只需要提供一张背景图，注入层就会在本机分析图像并生成协调的颜色、焦点和页面布局；不会上传图片，也不依赖外部 AI/API。

```json
{
  "appearance": "auto",
  "art": {
    "focusX": 0.72,
    "focusY": 0.45,
    "safeArea": "auto",
    "taskMode": "auto"
  }
}
```

- `appearance`：`auto | light | dark`。`auto` 跟随 Codex/ChatGPT 与系统外观；`light` / `dark` 为显式覆盖。图像亮度只参与配色和构图，不会反向覆盖用户选择的外观。
- `art.focusX` / `art.focusY`：`0..1` 的归一化焦点坐标（左/上为 `0`，右/下为 `1`）。用于控制背景定位，超出范围的值会被拒绝或限制。
- `art.safeArea`：`auto | left | right | center | none`。`auto` 根据左右信息量推断适合放置原生首页内容的一侧；其余值显式指定安全区，`none` 表示不保留安全区。
- `art.taskMode`：`auto | ambient | banner | off`。`auto` 对超宽图使用横幅/纵向渐隐，对普通比例图使用低噪环境背景；`off` 在任务页关闭背景图。

显式的 `appearance` 优先于 Codex/ChatGPT 外观；焦点、安全区和任务模式的显式值优先于图像分析。首页保留更完整的主视觉和原生控件，任务页默认降低背景干扰以保证代码、消息和输入框可读。

### 平台差异

- macOS 的选图脚本会把这些字段写入主题库，可通过 `--appearance`、`--focus-x`、`--focus-y`、`--safe-area`、`--task-mode` 设置。
- Windows 安装会把运行所需的 `assets/` 与 `scripts/` 原子复制到 `%LOCALAPPDATA%\CodexDreamSkin\engine`，所有快捷方式均指向该受管副本，因此安装后可移动或删除源码目录。安装还会初始化 `active-theme`、`themes` 与 `images`，并把「桥本有菜」同时设为首次默认和可切换的已保存主题。系统托盘支持更换背景、保存当前主题、从「已保存主题」切换、暂停和恢复；图片与 `theme.json` 保存在主题仓库中，不写进 Codex 的 `config.toml`。安装会保留用户已有的 `appearanceTheme`；仅在识别到旧版精确托管的浅色三元组时按备份迁移。
- Windows 1.5.1 使用與 macOS 相同的 renderer、CSS、自訂文案及 `colors` 主題欄位；一般操作透過 Flutter 面板保存，不需要記憶體級覆寫。

## 预设与图片类型

- `macos/presets/preset-romantic-rose/` 是置顶的实测精选主题「桥本有菜 / Arina Hashimoto」。macOS 安装后用 `switch-theme-macos.sh --id preset-romantic-rose` 切换。
- 该 preset pack 中只有 `background.jpg`（`2560 × 1440`、16:9、纯背景）和 `theme.json` 会被播种；它由用户提供的 `1672 × 941` 源 PNG 标准化导出，不代表增加了源图细节。Byte-identical 源图归档在 `docs/images/presets/romantic-rose-source.png`，不会随 preset 播种；`romantic-rose-light.jpg` 与 `romantic-rose-dark.jpg` 是 `2308 × 1572` Retina 浅/暗真实首页截图，未发送输入仅在截图时用临时本地样式遮蔽，只作效果预览，绝不能当背景导入。
- `preset-midnight-aurora` 等五套是程序化生成的抽象示例，与用户提供的 AI 生成「桥本有菜」精选图来源不同。精选图不代表 OpenAI/Codex 官方视觉或背书，公开再分发前需确认人物与素材权利。
- Windows 自带与 macOS byte-identical 的 `windows/assets/dream-reference.jpg` 纯背景，并在首次初始化时播种「桥本有菜」；可直接从「已保存主题 → 桥本有菜」切换。README 实机截图仍只作预览，绝不能作为背景导入。
- Flutter / SwiftUI 工作室接收最高 50 MiB 圖片來源，轉換後主題圖必須 ≤16 MiB、最長邊 ≤4096px；來源拒絕任一邊超過 16384px 或總像素超過 50MP。Windows 使用系統 WIC 圖片解碼器（HEIF/WebP 需對應 Windows codec）；舊托盤快速載入入口仍保留 16 MiB 限制。兩端以圖片與主題 SHA-256 修訂值識別熱更新，並在構建首幀前取得圖片比例。
- 自定义生图优先使用 `2560 × 1440`（16:9）：左侧约 50%～58% 保持低信息、低对比，主体放在右侧约 58%～88%。输出必须是连续铺满画布的纯背景，禁止窗口、侧栏、卡片、输入框、文字、Logo 和水印。
- 可直接复制的无人物、右侧成年人物与参考图编辑模板见 `docs/reference-background-prompt-guide.md`；公共默认提示词不指定真人或名人。

## 不要放进这个目录的东西

- API Key、`.codex/auth.json`
- 中转站密钥、服务器私钥
- 含客户隐私的实机截图（若要公开）

## macOS video fork

`1.2.1-video.2` supports MP4 backgrounds up to 256 MiB through the bundled Skill and menu picker. Video plays silently in a loop and suspends for hidden documents or reduced motion. The static image is retained for loading and failure fallback. Windows also supports MP4 through the Flutter panel and validated local CDP file handoff.

## 1.8.0 managed direct launch

Windows uses an explicit **Codex (Xskin)** entry. It requests official OS activation once, reuses verified connections and leaves ordinary existing apps running. No Windows automatic close/reopen or login watcher remains. Pinning uses normal system UI. Pause/disabled preferences make the shortcut open ordinary Codex and remain paused.

Windows uses the existing quiet host → PowerShell → registered MSIX activation chain. The shortcut carries the physical StateRoot. A per-user locator and managed-engine location replace dependence on the removed logon task; custom and redirected data are preserved. Migration validates legacy task, process and shortcut identity. It stops the recorded injector before the legacy monitor, retains bundled Node, and resumes the previous runtime after a failed swap. New quiet hosts do not join inherited output pipes after their direct child exits.

macOS 1.8.1 restores the official-app entry by explicit user choice. Its verified per-user LaunchAgent observes native app notifications, skips existing/paused/debug sessions and gracefully reopens each fresh ordinary launch once. The native helper validates the exact PID, bundle/path and age before asking it to terminate; it never force-quits. Failed relaunches and queued duplicate events cannot trigger a restart loop. The optional managed app in ~/Applications still starts directly, sharing a kernel lock with automatic handoffs. Pause preserves the service/preference but its state prevents handoffs. Updates migrate enabled 1.8.0 preferences and restore the prior service on failure. New installations do not edit Dock preferences. Both platforms retain four languages, media, opacity and overlay; macOS includes the Windows draft-ID, lifecycle fan, long-log and file-creation fixes.

A separate explicit full Restore may close/reopen Codex after confirmation. Account/provider configuration is never changed. No official bundle, app.asar, WindowsApps, signature, Electron fuse or protection is modified. This boundary does not establish authorization for CDP/CSS injection: it remains unconfirmed. [Validation and recovery](direct-launch-shortcut.md) distinguish fixtures/CI from required physical cold-start, login, Store-update and home/task checks.
