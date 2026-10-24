# Windows 1.9.6 AI 安裝提示詞

將下方整段貼給能下載檔案、執行本機指令的 AI 程式助理。一般純聊天服務無法代為安裝。[English prompt](https://github.com/timmyc07/Xskin#install-with-your-ai)

```text
請直接在這台 Windows x64 電腦安裝 Xskin 1.9.6，包含「獨立版」及「Codex 內建外掛」，完成實際安裝及驗證，不要只提供步驟。

只使用官方專案 Release：https://github.com/timmyc07/Xskin/releases/tag/windows-v1.9.6
下載 Xskin-1.9.6-windows-x64.zip、xskin-plugin-v1.9.6-windows-x64.zip，以及各自同名的 .zip.sha256。執行前用 Get-FileHash -Algorithm SHA256 驗證兩個 ZIP；不符就停止。先讀取套件內 Windows README，保留現有背景、匯入素材、語言、遮罩、暫停狀態與無關 Codex 設定。

將兩個完整 ZIP 分別解壓至目前使用者的固定資料夾，保留所有相鄰檔案。找到包含 xskin.exe 的獨立版根目錄，執行其中的 Install Xskin.exe。找到同時包含 plugin.json、mcp.json、.agents/plugins/marketplace.json 的外掛根目錄。使用官方 Codex CLI；如果 codex 不在 PATH，從已安裝的 OpenAI.Codex Store 套件中尋找官方 CLI。先確認 plugin 指令說明，再執行：
codex plugin marketplace add "<外掛解壓根目錄的絕對路徑>"
codex plugin add codex-background-studio@codex-background-studio-local

確認獨立版版本及外掛已安裝、啟用且為 1.9.6。不必安裝 Flutter、npm 或額外 Node。保留目前 Codex 工作階段；如需重新載入外掛，完成安裝後告知剩餘步驟，不要強制關閉 Codex。沿用安裝程式預設及既有啟動偏好。不要修改官方程式、WindowsApps、app.asar、簽名、帳號、API Key 或 Base URL；未經我要求不要選用新的背景素材。最後回報安裝路徑、版本、驗證結果與尚需操作。
```
