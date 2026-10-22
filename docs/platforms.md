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
| 四語介面 / 拖放 / 獨立全版遮罩 | ✅ | ✅（1.5.1） |
| 面板關閉後從專用入口自動套用 | ✅（Dock 入口） | ✅（Codex (Xskin) 桌面 / 開始捷徑，可釘選工作列） |
| 本地主题保存 / 切换 | ✅（菜单栏） | ✅（系统托盘） |
| 官方签名校验 | ✅ | Store 签名类型 + 包身份 |
| 客户部署提示词 | ✅ | ❌（可用 Mac 文案改写） |
| 打客户 ZIP | ✅ `build-client-release.sh` | ✅ `scripts/build-release.ps1` |

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

## macOS 1.6.0 parity and automatic startup

macOS ports the Windows 1.5.4 Work/Dot surface detection, card-clipped original video, native Your dot transparency, active-embedder playback control, and message-streaming routing optimization. Complete MP4 integrity checks use a 1 MiB buffer; local copies must match the inspected source digest. The SwiftUI/AppKit/AVKit studio remains native; Windows Flutter, Store activation, PowerShell, and GPU accounting are platform-specific.

`dream-skin-macos.sh autostart enable` installs a per-user LaunchAgent that handles the original official Codex app from Finder, Spotlight, and the Dock. It gracefully reopens a newly launched ordinary process once; already-open windows and explicit debug launches are skipped. Exact executable/PID/start-time checks, a maximum launch age of 15 seconds, and a 30-second handoff guard prevent unrelated or repeated restarts. Refused quits are never forced. Login and quit leave Codex closed. Enabling the option restores any old Xskin-managed Dock entry to the official app; disable, Pause, and Restore stop the service. Official app files and signatures remain unchanged.

Engine replacement stops and resumes the verified watcher, restores the previous runtime on failure, and preserves paused state, theme media, and preferences. Its working directory lives outside the replaceable engine.

macOS 1.6.1 uses native launch notifications to start that handoff immediately. Native Work shells do not need an active Codex tab wrapper. Guarded early injection waits for React's shell even after document loading completes, shows the saved artwork as soon as it appears, then attaches the original video. Unrecognized windows expire after ten seconds. Cold launch still includes the official app's startup and video decoding; Xskin does not guarantee zero latency or modify the official app to hide that work.

Windows 1.5.5 backports those native Work selectors and the ten-second guarded shell wait, including observer cancellation on pause, theme changes, expiry and shutdown. Flutter preview views are keyed to their video controllers so replacing videos cannot retain the previous player's dimension subscriptions. Windows keeps its verified managed launch entry; it does not install a macOS-style application observer service.
