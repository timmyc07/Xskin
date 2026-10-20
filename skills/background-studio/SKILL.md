---
name: background-studio
description: 開啟 macOS 原生 Xskin程式，匯入本機圖片或 4K MP4、預覽並套用背景。
---

# Xskin

這個插件開啟真正的 **Xskin.app**，不是網站、瀏覽器分頁或 WebView。

1. 從本技能位置向上兩層取得插件根目錄；不要以聊天工作目錄代替。
2. 執行 `/bin/bash <插件根目錄>/macos/scripts/open-background-studio.sh --json`，完整路徑作為單一參數。
3. 成功結果包含 `appPath` 與 `version`，啟動器已開啟原生程式。不使用瀏覽器工具或網址。
4. 使用者可在程式內選擇或拖入圖片／MP4，以原生控制預覽，再按「套用這個背景」。

開啟程式不代表授權變更背景或重啟 Codex。影片保留原始解析度與幀率，預覽預設暫停；圖片上限 50 MiB、影片上限 256 MiB。媒體全程在本機處理，不上傳雲端。不要修改官方 Codex 程式、帳號或模型設定。
