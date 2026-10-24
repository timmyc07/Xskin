# Xskin for Windows 1.9.6

1.9.6 原始碼已同步 macOS 的 Apply 監看程序保留與隱藏 Dot 影片驗證修復。以下公開下載仍為 1.9.4；新版驗證記錄見 [Windows 更新記錄](https://github.com/timmyc07/Xskin/blob/main/windows/CHANGELOG.md)。

本版本將 macOS 1.9.4 已完成的內嵌工作室、原始媒體預覽、套用後保留預覽、中斷復原、六組預設與官方啟動自動套用移植到 Windows。沿用 Flutter 面板、PowerShell 引擎與 Store 套件啟動；沒有增加額外產品功能。[對齊範圍與驗證](../docs/windows-parity.md) · [English](README.en.md)

**下載 Windows 1.9.4：[獨立版](https://github.com/timmyc07/Xskin/releases/download/windows-v1.9.4/Xskin-1.9.4-windows-x64.zip) · [Codex 內建外掛](https://github.com/timmyc07/Xskin/releases/download/windows-v1.9.4/xskin-plugin-v1.9.4-windows-x64.zip) · [Release 與 SHA-256](https://github.com/timmyc07/Xskin/releases/tag/windows-v1.9.4#release-assets)。** 每個 ZIP 都有同名 `.zip.sha256` 校驗檔，請在執行前驗證。也可以將[安裝提示詞](https://github.com/timmyc07/Xskin/blob/main/windows/CLIENT_DEPLOY_PROMPT.md)交給能執行本機指令的 AI，安裝獨立版及內建外掛。

## Codex 內嵌工作室

下載並解壓完整的 `xskin-plugin-v1.9.4-windows-x64.zip`，保留整個資料夾於固定位置。以下路徑必須指向同時含有 `plugin.json`、`mcp.json` 及 `.agents/plugins/marketplace.json` 的解壓根目錄。套件包括 Windows 專用啟動器、Node 與編譯後工作室，不需要安裝 npm 或 Flutter。

```powershell
codex plugin marketplace add "D:\完整路徑\Xskin-plugin"
codex plugin add codex-background-studio@codex-background-studio-local
```

重新載入外掛後從導航中的 Xskin（可能位於 More）開啟，或要求呼叫 `xskin_open`。選擇圖片／MP4、查看預覽，再明確套用。預覽影片預設暫停，套用後保留已載入的原始媒體。遮罩、四語設定、暫停與恢復已儲存背景和 Flutter 共用狀態。Refresh 只讀取狀態；中斷變更使用明確的 Recover 操作，保留待套用素材。

內嵌 Apply、遮罩與 Resume 只使用現有且驗證通過的背景連線，不會開啟或重開目前的 Codex。沒有連線時，明確啟用「官方 Codex 開啟時自動套用」，完整退出 Codex（只關閉視窗可能仍在系統匣），再開啟官方程式。之後每次新的普通啟動會正常重開一次以建立連線。既有、暫停、停用及偵錯工作階段會略過；拒絕退出時不強制關閉，也不反覆嘗試。

只開啟／重新整理面板或匯入素材，不會啟用自動套用，也不改官方外觀偏好。監控器由目前使用者的登入排程維持，面板可關閉；關閉自動套用或 Restore 只移除身分相符的 Xskin 排程。安裝時已存在的 Codex 工作階段保持運作。

## 獨立面板與直接啟動

使用 `Xskin-1.9.4-windows-x64.zip` 的完整內容，開啟 `Install Xskin.exe` 或 `xskin.exe`。保留全部 DLL／assets／scripts。Flutter 支援拖放、預覽、套用、四語與遮罩；原有 `Codex (Xskin)` 桌面／開始捷徑可直接啟動，不必經過官方入口的重開。既有普通 Codex 無連線時，先手動完整退出。

暫停保留設定與登入服務，但停止套用；Resume／Apply 才明確恢復。資料保存在 `%LOCALAPPDATA%\CodexDreamSkin`；MSIX 重新導向或自訂根目錄沿用實際路徑及 `%USERPROFILE%\.xskin-state-root.json`。升級保留背景、匯入、語言、遮罩與暫停，失敗會復原舊引擎／設定。不覆寫同名外來捷徑。首次全新安裝使用 midnight aurora，既有主題不變；主題庫包含與 macOS 相同的六組預設。

## 媒體、用量與恢復

圖片支援 PNG/JPEG/WebP/HEIC/TIFF，來源 ≤50 MiB、每邊 ≤16384px、≤50MP，轉換後最長邊 ≤4096px／≤16 MiB。HEIF/WebP 依 Windows codec。MP4 ≤256 MiB，保留原始位元、解析度與幀率；靜音循環，隱藏或 Reduce Motion 時暫停。遮罩 0–100%，預設 62%。

Codex／Work／Dot 背景及 Token／快取／方案／額度列保留現有共同實作。用量讀取目前本機對話的官方紀錄，不讀 auth.json、不推測方案；背景診斷包含原始影片的總幀／掉幀數。[欄位語義](../docs/usage-fields.md)

完整 Restore 可明確詢問關閉／重開以移除偵錯連線。需要回復受管外觀鍵時執行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\restore-dream-skin.ps1 -RestoreBaseTheme -PromptRestart -Uninstall
```

保留資料目錄。config.toml 只用嚴格 UTF-8、原子寫入及可恢復備份；一般復原保留無關 TOML。只有明確使用 `-RecoverConfigBackup` 才恢復整份備份。CDP 僅 loopback，驗證套件、程序、Browser ID；不修改 WindowsApps、app.asar、簽名、帳號、API Key 或 Base URL。CDP／CSS 注入的官方授權依據仍未確認。

## 建置與測試

```powershell
npm ci --prefix plugin --ignore-scripts --no-audit --no-fund
npm test --prefix plugin
powershell.exe -NoProfile -ExecutionPolicy Bypass -File windows\scripts\build-release.ps1 -Flutter "D:\flutter\bin\flutter.bat"
```

需要 Node 22+、Flutter 與 Visual Studio C++／Windows SDK。建置會執行 Windows 引擎測試、Flutter analysis／tests，產生獨立面板與內嵌外掛 ZIP／SHA-256。測試使用隔離資料及程序替身；官方 Home／task 目視、實際登入、Store 更新與持續 4K 播放仍須實機驗收。
