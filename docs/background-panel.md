# Xskin

**macOS 原生應用程式，不是網站或瀏覽器分頁。** 使用系統選檔視窗、原生圖片與影片預覽，再直接套用到 Codex。

## 安裝與開啟

解壓應用程式 ZIP，將 **Xskin.app** 放進「應用程式」，雙擊即可開啟。已編譯的應用程式不需要 Node.js、套件管理器或 Xcode；程式會使用官方 Codex 隨附且經驗證的執行環境。

也可以安裝 Codex 插件來啟動這個程式。解壓插件 ZIP，保留完整的 `codex-background-studio` 資料夾，於該資料夾執行：

```sh
codex plugin marketplace add .
codex plugin add codex-background-studio@codex-background-studio-local
```

在 Codex 輸入「開啟 Xskin」，插件會開啟獨立的原生視窗。程式通常安裝在 `~/Applications/Xskin.app`。

## 匯入與套用

1. 按「選擇檔案」，或把本機圖片／MP4 拖入程式。
2. 查看預覽、解析度與檔案資訊。影片預覽預設暫停，可用原生播放控制查看。
3. 按「套用這個背景」，等待實際播放與版面驗證通過。

開啟程式和匯入檔案不會自行替換目前背景。未套用的素材會保留，重新開啟程式後可繼續；套用失敗時會還原原本設定並保留選擇供重試。

所有媒體都在本機處理。MP4 上限 256 MiB，保留原始解析度、幀率與檔案內容，支援原始 4K 影片，不會轉成 1080p。圖片上限 50 MiB，會轉為最長邊不超過 4096 像素的 JPEG，小圖不放大。原始檔案保留。

## 調整全版遮罩

使用「遮罩深度」滑桿，可一次調整全部區塊的黑色遮罩，範圍為 0–100%，預設 62%。數值越高，背景越暗；拖動時會同步更新預覽，放開滑桿後自動套用，使用鍵盤調整也會套用。

遮罩深度會儲存在本機，重新開啟後沿用設定。這項調整只改變畫面上的黑色遮罩，不會重新編碼或修改媒體；預覽與背景仍使用原有品質的素材。

## 正常啟動與自動套用

開啟「啟動時自動套用」後，從一般 Codex 圖示開啟也會使用目前背景。這個選項沿用可還原的背景引擎；初次啟用可能需要一次受控重啟，自動啟動交接會短暫重新開啟視窗，不是零延遲的官方內建功能。官方應用程式檔案與簽章不會修改。

## 設計與建置

[設計原則與參考來源](panel-design.md)。程式使用 SwiftUI、AppKit 與 AVKit，沒有 WebView、HTTP 面板服務或第三方 UI 套件。

原始碼建置需要 macOS 與 Xcode：

```sh
bash macos/scripts/build-native-studio.sh '/path/Xskin.app'
bash macos/scripts/build-plugin-release.sh
```

發行程式以本機 ad-hoc 簽章建置，未提供 Apple Developer ID 公證。跨機器分發時應先完成正式簽章與公證。
