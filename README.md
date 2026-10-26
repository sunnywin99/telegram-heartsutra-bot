# telegram-heartsutra-bot

在 Telegram 傳一個數字，機器人會自動記一列到 Google 試算表，並算出累計總數。
專門拿來記錄每天念心經的遍數，傳「總計」或 `/total` 隨時查目前累計多少遍。

執行環境：**Cloudflare Workers 免費方案**（JavaScript），不需要任何一台電腦一直開著。
push 到 GitHub 的 `master` 後，Cloudflare 會自動部署新版本。

---

## 輸入格式

直接傳一個正整數，例如：

```
108
```

機器人會回覆「已記錄：+本次 (今日累計) , 總累計 (from 起始日期)」，同時在 Google 試算表新增一列
「日期時間 / 本次遍數 / 累計遍數」。

傳 `總計`、`累計` 或 `/total` 可以只查目前累計多少遍，不會新增資料列。

---

## 運作方式

- Telegram 收到訊息時呼叫 Worker 的 `POST /telegram`（webhook）。
- Worker 用 Google 的 refresh token 換 access token，再直接呼叫 Google Sheets API 讀寫試算表。
  所有資料都在試算表裡，Worker 本身不存任何東西。
- 程式：`src/index.js`（Worker）、`src/logic.js`（指令解析、日期、累計計算）。測試：`npm test`。

## 第一次設定（只需要做一次）

1. 登入 [Cloudflare](https://dash.cloudflare.com/)，左邊選單「運算」→「Workers 和 Pages」→「建立」→
   **Continue with GitHub**，選 `sunnywin99/telegram-heartsutra-bot`，專案名稱保持
   `telegram-heartsutra-bot`，其他用預設值，按「部署」。
2. 到 Worker 的「設定」→「變數和機密」→「新增變數」，下面四個都要**勾「秘密」**，
   最後按「新增變數並部署」：

   | 金鑰 | 值 |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | 這個 bot 的 Telegram token |
   | `GOOGLE_CLIENT_ID` | 原本 Render／`.env` 裡那組 |
   | `GOOGLE_CLIENT_SECRET` | 同上 |
   | `GOOGLE_REFRESH_TOKEN` | 同上 |

3. 打開 `https://telegram-heartsutra-bot.sunnywin99.workers.dev/setup`。它會逐項檢查
   Token、Google 授權、試算表，全部正常就向 Telegram 註冊 webhook，並顯示目前累計遍數。
4. 在 Telegram 傳 `/total` 確認。

`ALLOWED_TELEGRAM_USER_ID`、`GOOGLE_SPREADSHEET_ID`、`GOOGLE_SHEET_NAME` 寫在 `wrangler.toml` 的 `[vars]`，不是機密。

## 之後改程式

改好 push（或合併）到 `master`，Cloudflare 會自動重新部署。
Worker 頁面的「部署」看有沒有成功，「Observability」看執行記錄。

## Google 授權失效時：重新申請 refresh token

`/setup` 顯示「Google 授權失敗：Token has been expired or revoked」之類的訊息，
就要重新申請一組 refresh token。需要一台有 Python 的電腦：

1. 到 [Google Cloud Console](https://console.cloud.google.com/) 原本的專案，
   「API 和服務」→「憑證」，下載這個 bot 的 OAuth 用戶端（電腦版應用程式）JSON，
   改名成 `credentials.json` 放在 repo 資料夾。
2. 建好 venv 並 `pip install -r requirements.txt`，執行：

   ```powershell
   .\venv\Scripts\python get_refresh_token.py --keep-sheet
   ```

   `--keep-sheet` 表示沿用原本的試算表，不另外建新的。瀏覽器會打開，選 Google 帳號並同意。
3. 把印出來的 `GOOGLE_REFRESH_TOKEN`（以及 CLIENT_ID／CLIENT_SECRET，如果有變）更新到 Cloudflare，
   再打開一次 `/setup`。

**避免 7 天就失效**：Google Cloud 的 OAuth 同意畫面如果還是「測試中」，refresh token 7 天後就會失效。
到「API 和服務」→「OAuth 同意畫面」（或「目標對象」）按 **發布應用程式**，改成「實際運作中」。
自己用的話不需要送 Google 審查，登入時會看到「未經驗證」的警告，選「進階」→「前往」即可。

## 疑難排解

- **機器人完全沒反應**：重新打開一次 `/setup` 看它說什麼。
  `ALLOWED_TELEGRAM_USER_ID` 打錯的話，機器人會回「沒有權限」。
- **本機測試**：`npm install` 後建立 `.dev.vars`（寫上面四個值），執行 `npx wrangler dev`。
  注意本機的 `/setup` 會把 webhook 指到本機網址，測完要再打開一次正式 Worker 的 `/setup`。
- **舊版**：2026-10 以前是 Python 版（`bot.py`，跑在 Render、後來自架桌電），可以在 git 歷史找到。
