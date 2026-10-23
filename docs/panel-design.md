# Xskin：原生程式設計

macOS 1.9.1 候選版另提供 Codex 內的 MCP App 面板，沿用既有資料。它使用透明畫布、宿主明暗色彩與安全邊距，四語以可鍵盤操作的 radio 選項呈現；重新整理、中斷復原、預覽與套用有獨立狀態。圖片／影片透過私有 MCP 分塊轉為本機 Blob 預覽，不開 HTTP 預覽埠。使用者已確認「更多 → Xskin」可開啟，新預覽與完整套用仍待實際宿主驗收。下列為獨立原生程式的設計紀錄，詳見 [App 內面板與驗證範圍](in-app-studio.md)。

原生程式讓使用者依序完成「導入素材、檢查預覽、套用背景」。設計以媒體內容為中心，
採用石墨灰、近白文字與低飽和暖萊姆綠，讓影片與圖片保有視覺主導權。

## 版面與操作

1.4.0 使用 SwiftUI、AppKit 與 AVKit，採原生選檔、圖片與影片控制；沒有瀏覽器、WebView 或本機 HTTP 面板服務。

- 視窗使用系統標題列顯示 Xskin，不設大型標題、品牌橫幅或行銷標語。
- 大型媒體預覽放在主要位置，清楚區別目前背景與尚未套用的素材。
- 尺寸、類型、檔案大小使用有結構的資訊列；長檔名截斷但可查看完整名稱。
- 導入與設定集中在精簡檢查器內，避免重複外框與無關資訊。
- 「套用背景」保留為唯一主要動作，固定在可觸及的底部區域。
- 可調整大小的原生視窗將媒體預覽與檢查器並排。
- 開關、按鈕、拖放區提供鍵盤焦點；載入、錯誤與成功狀態使用明確文字。
- 動畫只用於短暫狀態變化，尊重減少動態效果的偏好。
- 不增加套件依賴、不使用第三方作品作裝飾，也不加入持續運轉的裝飾動畫。

## 參考與轉化

以下來源提供排版與互動原則。此面板是依自身用途重新設計，未複製其他產品的介面、品牌或素材。

### Linear：資訊層級與安靜的結構

[A calmer interface for a product in motion（2026-03-12）](https://linear.app/now/behind-the-latest-design-refresh)
說明其更新如何降低側欄的視覺重量、統一控制列、減少圖示並柔化分隔線。
本面板將這些原則轉化為少量灰階層次、精簡設定列與一致的間距，避免每個元素爭奪注意力。

### Framer：預覽與屬性分工

[Framer Design](https://www.framer.com/design/) 展示畫布、素材導覽與屬性控制的分工。
本面板讓使用者先看素材，再讀取中繼資料與調整設定；寬版採雙欄，窄版保持相同閱讀順序。

### Raycast：緊湊分組與清楚的操作回饋

[Raycast List 官方文件](https://developers.raycast.com/api-reference/user-interface/list)
提供分組、細節區域與載入回饋等介面模式；
[Window Management 官方說明](https://www.raycast.com/core-features/window-management)
亦展示在偏好設定的擴充功能區啟用功能的流程。
本面板採用清楚的分組與狀態文字，將自動套用整理為單一設定列。

### Lusion v3：內容比例與有限的強調色

[Awwwards 官方作品頁](https://www.awwwards.com/sites/lusion-v3)
記錄其於 **2023-10-02 獲得 Site of the Day，評分 8.25／10**。
本面板借鑑大比例內容展示與克制的色彩分配；原生控制區仍以直接操作和閱讀效率為先。
獎項僅指該參考作品，並非此面板的獲獎或認證聲明。

### 原生產品：Pixelmator Pro 與 Apple macOS HIG

[Pixelmator Pro 官方介面導覽](https://support.apple.com/guide/pixelmator-pro/pixelmator-pro-interface-pix96e754af4/4.4/mac/26)
將畫布、工具區和素材資訊按用途分工。Xskin 採用預覽與控制區並排，把素材尺寸直接放在預覽下方，讓核心操作更集中。
[Apple 的 macOS 設計規範](https://developer.apple.com/design/human-interface-guidelines/designing-for-macos/)
提供原生視窗、選單和桌面操作習慣的指引。Xskin 使用系統標題列、選檔視窗、播放控制與鍵盤操作，不增加品牌橫幅。
