# Xskin for Windows 1.8.4

**1.8.5 candidate (not yet published)** reduces the overlay/composer gap from 8 to 2 CSS pixels while preserving the native input and controls. Stable downloads below remain 1.8.4; startup remains shortcut-only with no automatic reopen.

1.8.4 保留同一對話紀錄最後合法回報的方案，並明示它不是即時帳戶狀態。快取寫入來源為 0 時顯示「未確認」，提示保留來源值與預設值限制；缺少欄位不補 0。[欄位語義、來源及驗證](https://github.com/timmyc07/Xskin/blob/windows-v1.8.4/docs/usage-fields.md)。Windows 實機驗收仍待完成。

**1.8.2** 補上長紀錄用量回復、等待／重新連線提示與原生半透明材質。最終審核移除重複檔尾讀取，並讓更新驗證等待新版樣式載入。[審核與驗證限制](https://github.com/timmyc07/Xskin/blob/windows-v1.8.3/docs/release-1.8.3-review.md)。官方各頁目視與 Windows 實機冷啟動仍待驗證。

[下載 Windows 1.8.4](https://github.com/timmyc07/Xskin/releases/download/windows-v1.8.4/Xskin-1.8.4-windows-x64.zip) · [發行說明與 SHA-256](https://github.com/timmyc07/Xskin/releases/tag/windows-v1.8.4) · [English](README.en.md)

## 安裝與使用

1. 安裝官方 Microsoft Store `OpenAI.Codex`，解壓完整 Xskin 套件，再開啟 `Install Xskin.exe`。也可先開啟 `xskin.exe` 完成首次設定。套件內附 Node，不需另裝 Flutter。
2. 安裝／升級保留正在執行的 Codex、帳號、背景、語言、遮罩及暫停狀態。只停止身分驗證通過的 Xskin 程序，再更新受管引擎。
3. **完整退出 Codex**（只關閉視窗可能仍在系統匣），再從桌面或開始功能表點 **Codex (Xskin)**。一次操作只要求官方套件啟動一次；面板不必常駐。
4. 可使用 Windows 的右鍵選單釘選該捷徑至開始功能表或工作列。不改工作列私有登錄資料，也不攔截官方入口。
5. 匯入圖片／MP4、確認預覽後按套用。若普通 Codex 已開啟且無可驗證連線，Xskin 會要求手動完整退出；不關閉或重新啟動它。失敗會保留待套用素材並復原先前主題。

暫停時點捷徑會開啟普通官方 Codex，且維持暫停。**繼續顯示皮膚／Apply** 才是明確恢復；如果普通 Codex 已開啟，先手動退出，再恢復。關閉「從 Codex（Xskin）套用背景」只影響後續捷徑啟動。登入 Windows 不會啟動監控器或 Codex，捷徑仍可直接使用。

## 升級、資料目錄與還原

舊登入監控排程與 Startup 捷徑僅在完整身分吻合時移除。受管 `Codex (Xskin)` 捷徑包含實際 `-StateRoot`，可使用中文、emoji、空格與自訂路徑；同名外來捷徑不會被覆寫或刪除。預設資料位於 `%LOCALAPPDATA%\CodexDreamSkin`；MSIX 重新導向時沿用實際儲存位置，並在移除舊排程前保存 `%USERPROFILE%\.xskin-state-root.json` 目錄索引（位於 AppData 外，避免檔案／登錄隔離）。不要手動搬走該目錄。

引擎更新先停止驗證過的 injector，再停止舊 PowerShell／quiet host，避免其子程序持有串流導致無法更新。新 quiet host 以 PowerShell 退出為準，不等待孫程序釋放輸出串流。升級保留既有 bundled Node；交換失敗時復原舊引擎並恢復 injector，不終止其他 Node 或 Codex。

Pause 只暫停皮膚。Restore 會移除皮膚；目前完整 Restore 會顯示明確的關閉／重開確認，**不屬於捷徑啟動流程**。如要關閉偵錯連接埠，請手動完整退出 Codex。解除安裝只移除受管捷徑及舊排程，保留媒體與偏好。需要復原外觀鍵時，先備妥未送出的輸入，再執行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\restore-dream-skin.ps1 -RestoreBaseTheme -PromptRestart -Uninstall
```

套件完整性或安裝失敗時先保留資料目錄，再重新執行安裝。`config.before-dream-skin.toml` 是安裝前備份；正常還原僅恢復受管外觀鍵，保留其他 UTF-8 TOML。`-RecoverConfigBackup` 是明確要求回復整份備份，會另存當前設定。不要刪除帳號或 `auth.json`。

## 背景、overlay 與限制

圖片支援 PNG/JPEG/WebP/HEIC/TIFF；來源上限 50 MiB、16384px／50MP，轉換為最多 4096px JPEG。MP4 上限 256 MiB，保留原始影片位元與幀率，靜音循環播放；隱藏或 Reduce Motion 時暫停。遮罩 0–100%，預設 62%；支援英、繁中、簡中、日文。

任務用量列位於輸入框上方，窄視窗自動換行，首頁不顯示空白用量列。輸入框與原生專案／檔案／外掛工具列採用一致的半透明材質，顯示圖片或影片背景，保留原生位置、圓角與操作。

狀態列僅讀取目前本機對話的 session 記錄。新對話仍使用暫時側欄 ID 時，改由目前輸入框取得正式 ID；風扇依任務開始、完成與中斷事件控制。長紀錄首次必要時向前尋找任務狀態，後續只讀新增範圍。session 新建／替換、切換、資料隔離及序列化訂閱均有回歸測試。不讀取 `auth.json`、不推測方案或虛構用量。

CDP 限於 loopback 並驗證 Store 包、程序與 Browser ID。未修改官方檔案不等於獲得官方授權：**CDP／CSS 注入的適用授權依據仍待確認，不作合規保證**。已查閱的官方依據、實際測試與實機待驗項目見 [驗證與授權範圍](https://github.com/timmyc07/Xskin/blob/windows-v1.8.3/docs/direct-launch-shortcut.md)。

1.8.3 的 Windows runner、Flutter 分析、6 項測試與打包已通過 CI；本次 1.8.4 結果另見[欄位驗證](https://github.com/timmyc07/Xskin/blob/windows-v1.8.4/docs/usage-fields.md)。實機三次冷啟動、重新登入、Store 更新及首頁／任務頁目視檢查仍待完成。升級請解壓至新資料夾並保留舊套件；若要回復舊版，先關閉背景套用與面板，再從舊套件重新安裝，保留資料目錄。

## 建置與測試

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File windows\tests\run-tests.ps1
cd windows\panel
flutter pub get
flutter analyze
flutter test
cd ..\..
powershell.exe -NoProfile -ExecutionPolicy Bypass -File windows\scripts\build-release.ps1
```

開發建置需要 Flutter、Visual Studio Desktop development with C++、Windows SDK 與 Node 22+。Mac 靜態檢查與替身測試不能代替 Windows 冷啟動、重新登入、Store 更新或首頁／任務頁實機驗證。
