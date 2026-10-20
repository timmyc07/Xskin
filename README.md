<div align="center">

# Xskin

### 讓 Codex 成為你的工作風景。

把喜歡的圖片與原始 4K 影片，變成每天打開 Codex 時的背景。<br>
原生 macOS 體驗，從匯入、預覽到套用，在一個精簡視窗裡完成。

[![Version](https://img.shields.io/badge/version-1.4.0-dceda0?style=flat-square)](https://github.com/timmyc07/Xskin/releases/tag/v1.4.0)
![macOS 13+](https://img.shields.io/badge/macOS-13%2B-202420?style=flat-square&logo=apple&logoColor=white)
![Apple Silicon](https://img.shields.io/badge/Apple_Silicon-arm64-202420?style=flat-square)
[![MIT License](https://img.shields.io/badge/license-MIT-202420?style=flat-square)](macos/LICENSE)

**[下載 Xskin 1.4.0](https://github.com/timmyc07/Xskin/releases/tag/v1.4.0)** · [使用指南](docs/background-panel.md) · [English](README.en.md) · [回報問題](https://github.com/timmyc07/Xskin/issues)

</div>

![Xskin 原生 macOS 應用程式](docs/images/xskin.png)

## 喜歡的畫面，值得保留原貌

Xskin 為想要個人化工作空間的 Codex 使用者而設計。選一張安靜的照片，或一段富有層次的動態風景；保留熟悉的對話與工作流程，讓背景成為日常的一部分。

| 你的素材，你的風格 | 看清楚，再套用 | 原生而精簡 | 為日常使用而設計 |
| --- | --- | --- | --- |
| 匯入本機圖片與 MP4，支援原始 4K 影片。 | 原生媒體預覽、解析度與檔案大小，確認後再變更背景。 | 獨立 macOS App，使用系統選檔、拖放與播放控制。 | 記住目前背景與未套用素材，支援正常開啟 Codex 時自動套用。 |

## 從素材到背景，只要三步

1. **匯入** — 按「選擇檔案」，或直接將圖片、MP4 拖入 Xskin。
2. **預覽** — 檢視構圖、解析度與檔案資訊；影片可透過原生控制播放。匯入不會改變目前背景。
3. **套用** — 按「套用這個背景」。Xskin 會檢查實際套用結果，失敗時還原原有設定，保留素材供你重試。

下載後解壓，將 **Xskin.app** 移至「應用程式」並開啟。預編譯版本不需要另外安裝 Node.js、套件管理器或 Xcode。

> v1.4.0 使用本機 ad-hoc 簽章，尚未通過 Apple Developer ID 公證。macOS 可能顯示來源驗證提示；請先確認下載自本專案的 Release，並參閱 [使用指南](docs/background-panel.md)。

## 細節，為你的工作留出空間

### 4K 保留原始品質

MP4 直接保留原始檔案內容，不重新編碼，也不降成 1080p。解析度與幀率維持原樣；你的來源是 4K，套用的就是同一份 4K 素材。

### 有氛圍，也有閱讀層次

影片以靜音循環方式成為 Codex 背景。全版黑色遮罩與透明側欄讓畫面連貫，也為文字與控制項保留對比。原生對話、專案與輸入功能仍可正常操作。

透過「遮罩深度」滑桿，一次調整全部區塊的遮罩，範圍 0–100%，預設 62%。拖動時同步預覽，放開後自動套用；使用鍵盤調整也會套用，設定保留至下次開啟。遮罩只改變顯示效果，不修改圖片或影片內容，原始畫質照樣保留。

### 預覽與背景，各有節奏

影片預覽預設暫停，需要時再播放。背景在視窗隱藏或系統啟用「減少動態效果」時暫停播放，減少不需要的持續運作。

### 下次開啟，延續現在的風格

開啟「啟動時自動套用」，之後從一般 Codex 圖示啟動，也會載入目前背景。未套用的素材會保留在本機，重新開啟 Xskin 後可接續處理。

自動套用透過本機背景服務完成啟動交接，可能短暫重新開啟 Codex 視窗；這不是官方內建的零延遲啟動畫面。

## 支援素材

| 類型 | 支援格式 | 檔案上限 | 處理方式 |
| --- | --- | --- | --- |
| 圖片 | JPG、PNG、WebP、HEIC、TIFF | 50 MiB | 轉為 JPEG，最長邊不超過 4096 像素；小圖不放大。 |
| 影片 | MP4，建議 H.264 編碼 | 256 MiB | 原始檔案直接保留，不重新編碼；支援 4K 解析度。 |

匯入會建立本機副本，原始檔案保留。MP4 是容器格式，實際播放支援仍取決於影片編碼與系統解碼能力。

## 你的素材，留在你的 Mac

- **本機處理**：Xskin 不會將匯入的圖片或影片上傳雲端。
- **不需要額外帳號**：不要求提供 OpenAI API Key，也不改寫 Codex 帳號、API Key 或模型供應商設定。
- **不修改官方安裝包**：背景引擎透過本機連線套用外觀，不改動官方應用程式檔案與程式碼簽章。
- **可檢視的實作**：介面使用 SwiftUI、AppKit 與 AVKit；沒有 WebView、HTTP 面板服務或第三方 UI 套件。背景引擎使用 Codex 隨附且經驗證的 Node 執行環境。

背景引擎的除錯連線僅綁定本機回環位址。這仍是外部客製化工具，請從可信來源下載，並避免執行不明本機程式。

## 系統需求與使用邊界

| 項目 | 需求 |
| --- | --- |
| 作業系統 | macOS 13 或更新版本 |
| 處理器 | Apple Silicon；v1.4.0 預編譯版為 arm64 |
| 必要軟體 | 已安裝官方 Codex Desktop，且其隨附執行環境可通過驗證 |
| 安裝方式 | 獨立 App；也可透過 Codex 插件啟動，詳見 [使用指南](docs/background-panel.md) |

- 本版原生 App 面向 macOS；不提供 Windows 或 Intel Mac 的預編譯版本。
- Codex 更新可能改變介面與啟動行為，影響外觀套用；遇到異常可先關閉自動套用並回報版本資訊。
- 4K 影片的解碼與播放負載取決於素材幀率、編碼及 Mac 硬體。Xskin 保留原始品質，不保證所有素材都有相同的資源用量。
- Xskin 是獨立開源專案，與 OpenAI、Apple 無官方合作或背書關係。

<details>
<summary><strong>開發、建置與測試</strong></summary>

原始碼建置需要 macOS 與 Xcode Command Line Tools。介面原始碼位於 [`macos/native/Xskin.swift`](macos/native/Xskin.swift)，背景引擎位於 [`macos/scripts/`](macos/scripts/)。

```sh
git clone https://github.com/timmyc07/Xskin.git
cd Xskin
bash macos/scripts/build-native-studio.sh "$PWD/build/Xskin.app"
```

執行現有的 macOS 檢查：

```sh
cd macos
npm test
```

測試背景套用或自動啟動前，請保存未送出的輸入；相關流程可能重新開啟 Codex。貢獻時請附上系統、Codex 與 Xskin 版本，以及可重現步驟，勿提交私密對話、素材或金鑰。

</details>

## 開源與致謝

Xskin 採用 [MIT License](macos/LICENSE)。本專案延伸自 [Codex Dream Skin Themes](https://github.com/aithink001/Codex-Dream-Skin-Themes) 與 [Codex Dream Skin](https://github.com/Fei-Away/Codex-Dream-Skin)，感謝上游貢獻者建立的主題引擎與工作流程。相關授權與聲明請見 [NOTICE](macos/NOTICE.md)。

Codex、OpenAI、macOS 與 Apple 等名稱及商標歸各權利人所有。請只使用你有權使用與分享的背景素材。

---

**把喜歡的畫面，帶進每天的工作。** [下載 Xskin →](https://github.com/timmyc07/Xskin/releases/tag/v1.4.0)
