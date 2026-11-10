# 小組生活測試版

沿用原始網頁模板的介面，整理為 Vite / JavaScript 專案。Node.js 用於開發、建置與測試；部署後由 Netlify 提供靜態網頁，Supabase PostgreSQL 提供資料讀寫與交易，不需要另外啟動 Express 伺服器。

## 本機啟動

需要 Node.js 24 與 npm。在此 repo 目錄執行：

```sh
npm ci
npm run dev
```

先依下方說明設定 Supabase，再開啟終端顯示的 localhost 網址。此版本只使用 Supabase 資料庫，不再將業務資料存入 localStorage，也不載入本機範例作為備援。缺少設定時會顯示錯誤並停用選名字進入的按鈕；正式建置會直接失敗。不要直接雙擊開啟 HTML。

正常使用時不顯示頂部橫幅或連線／儲存成功訊息；載入或儲存失敗時才顯示錯誤與重試／重新載入按鈕。雲端設定不完整或連線失敗時不會偷偷改成本機儲存。

## 連接 Supabase 測試資料庫

1. 建立一個專用的 Supabase **測試專案**。
2. 在 SQL Editor 依序執行：
   - [001_schema.sql](supabase/migrations/001_schema.sql)：建立 11 張表與兩個 RPC，預設關閉匿名存取。只需執行一次，不適用已有同名表的資料庫。
   - [002_conflict_http_status.sql](supabase/migrations/002_conflict_http_status.sql)：將業務衝突改為 HTTP 409，避免 API 層自動重試。已執行過建表與 seeding 的專案也需要補執行此檔，不必重建資料。
   - [seed.sql](supabase/seed.sql)：載入模板範例資料。重新執行不會覆寫既有紀錄。
   - [enable-demo.sql](supabase/enable-demo.sql)：啟用共用測試資料的讀寫。
3. 複製 [.env.example](.env.example) 為 `.env.local`，填入自己的 Project URL 與 **publishable key**（舊專案可用 anon key）：

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY
```

4. 重新啟動 `npm run dev`。資料庫載入完成後即可選名字進入；正常連線與儲存不顯示橫幅。用不同裝置選名字並重新載入，即可驗證共用資料。

這兩個 VITE 設定會打包進瀏覽器，必須使用公開金鑰，**不能使用 service_role 或 secret key**。實際環境檔已排除於 Git。

舊版本留在瀏覽器的資料不會自動搬到雲端，也不會被刪除；新版只讀取雲端資料。sessionStorage 僅記住選擇的成員與小組，不儲存排班或調查。需要停止測試存取時，執行 [disable-demo.sql](supabase/disable-demo.sql)。

## 選名字模式的界線

目前依使用者要求保留選名字，沒有驗證登入者身分。知道公開 URL/key 的人可經由測試 RPC 讀寫全部測試資料；介面上的管理／檢視／組員區分不是安全邊界。只使用範例資料，不放真實請假原因、個資或禱告內容。

所有資料表已啟用 RLS，匿名角色無法直接讀寫表；兩個明確命名為 `demo_*` 的 security-definer RPC 是測試專用入口。啟用它們不代表完成正式授權。未來加入 Google／LINE 登入時，需撤銷這兩個 RPC 的匿名權限、綁定固定 member ID，並改成依身分驗證的資料操作與會員權限規則。

## 資料結構

| 表 | 紀錄單位 |
| --- | --- |
| members | 一位成員，固定 member ID |
| groups | 一個小組的基本設定 |
| memberships | 成員與小組的關係、角色 |
| meetings | 一個小組的一次聚會 |
| assignments | 一個日期的一項服事，以 member ID 關聯 |
| cycles | 每組目前與下一期的設定 |
| survey_responses | 小組、期別、成員的一份服事／禱告回覆 |
| leave_requests | 一筆請假／代班 |
| custom_surveys | 一則自訂調查公告 |
| notifications | 一則通知 |
| group_documents | 各組的公告模板、禱告配對清單、變更紀錄等獨立文件 |

第一版以關聯 ID、外鍵與唯一索引管理主要關係；可變的表單內容放在各筆紀錄的 JSONB `data`，不是把整個應用存成一筆。禱告配對文件仍沿用模板的姓名陣列，正式帳號／更名功能上線前需一併轉成 ID。

前端只送出改動的紀錄與預期舊值。RPC 會在單一交易內比較舊值、執行更新；兩個人修改不同回覆可以並存，修改同一紀錄時後到者會收到衝突提示。代班、排班與紀錄更新會一起提交，任一衝突則全部回滾。測試版採每 10 秒與視窗重新聚焦時拉取資料；正在編輯或有未儲存修改時不覆蓋表單。

發生網路錯誤可按「重試儲存」。發生衝突則先保留需要的文字，再按「重新載入資料」，確認放棄本機修改後重填；此版沒有自動合併同一份回覆。

## 已接通與尚未開放的功能

已接通：小組設定、本期各日期手動排班、服事意願、禱告調查與配對資料、請假／代班、調查公告、通知、期別設定、LINE 公告模板。

原模板的「自動產生服事排班」與「下一期發布」只有提示文字，並未真正生成排班；本版明確停用這兩個按鈕。自訂調查目前只支援公告資料，自訂題目、填答與結果統計尚未開放。期別設定尚不是完整歷史期別管理；日期沿用模板格式與範例，不適合直接當真實日程。調查截止日期目前是提示，不強制鎖定填答。LINE 按鈕只複製文字，不會自動傳訊。

## GitHub 與 Netlify

此資料夾已初始化為獨立 Git repo。首次設定遠端時，可在 GitHub 建立空白 repo，再於本目錄執行（已完成者不必重做）：

```sh
git add .
git commit -m "Initialize group life demo with Supabase persistence"
git remote add origin https://github.com/YOUR_ACCOUNT/group-life.git
git push -u origin main
```

Netlify 選擇 Import an existing project，連接此 repo。設定已放在 [netlify.toml](netlify.toml)：

- Base directory：留空（將本資料夾作為 repo 根目錄）。
- Build command：`npm run build`。
- Publish directory：`dist`。
- Node.js：24。
- 必須在 Netlify 加入上述兩個 `VITE_SUPABASE_*` 環境變數，供 Production 的建置使用，再重新部署。缺少任一變數會讓建置失敗；本機 `.env.local` 不會透過 GitHub 傳到 Netlify。
- 若 repo 根目錄外還包著 `group-life` 資料夾，Base directory 設為 `group-life`，Publish directory 仍填 `dist`。
- 若線上仍顯示「已儲存在此瀏覽器」，代表仍在使用舊版部署。請推送新版程式、設定環境變數並完成一次成功的部署；只修改環境變數不會改變已發布的檔案。

## 檢查與維護

```sh
npm test
npm run build
```

測試使用 PGlite 執行實際 PostgreSQL schema / RPC，驗證預設存取限制、獨立回覆、同筆衝突、交易回滾與外鍵。這不取代真實 Supabase HTTP API 的連線驗收；提供雲端設定後仍需驗證兩台裝置操作。

雲端設定完成後，可執行 `node --use-system-ca --env-file=.env.local scripts/check-supabase.mjs` 做唯讀檢查。加上 `--write` 會使用獨立暫存紀錄測試新增、更新、不同連線讀取及衝突，最後清除；請先執行第二份 migration。腳本不輸出金鑰。若測試被中斷，可用輸出的暫存 ID 搭配 `--cleanup-probe ID` 清除該筆紀錄。

- [src/app.js](src/app.js)：模板介面與操作。
- [src/store.js](src/store.js)：儲存佇列、錯誤狀態與重新載入。
- [src/records.js](src/records.js)：UI 資料與資料庫紀錄的轉換、差異比對。
- [src/repository.js](src/repository.js)：Supabase 資料存取。
- [src/config.js](src/config.js)、[vite.config.js](vite.config.js)：執行時與建置時的必要資料庫設定檢查。
- [src/seed.json](src/seed.json)：模板範例資料。修改後執行 `node scripts/generate-seed.mjs` 重新產生 SQL；不會自動更動已存在的資料庫。
