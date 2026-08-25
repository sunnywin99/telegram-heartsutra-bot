# telegram-heartsutra-bot

在 Telegram 傳一個數字，機器人會自動記一列到 Google 試算表，並算出累計總數。
專門拿來記錄每天念心經的遍數，傳「總計」或 `/total` 隨時查目前累計多少遍。

執行環境：Python 3。開發機是第二台筆電（`C:\claude_practicefiles\telegram-heartsutra-bot`），
正式運行是免費部署在 Render 上，24 小時都能收 Telegram 訊息。

---

## 輸入格式

直接傳一個正整數，例如：

```
108
```

機器人會回覆這次遍數跟累計遍數，同時在 Google 試算表新增一列
「日期時間 / 本次遍數 / 累計遍數」。

傳 `總計`、`累計` 或 `/total` 可以只查目前累計多少遍，不會新增資料列。

---

## 部署步驟

### 1. Google Cloud：申請 Sheets API 憑證

沿用跟 telegram-calendar-bot 一樣的 Google Cloud 專案，只差開一個新 API 跟建一個新憑證：

1. 到 [Google Cloud Console](https://console.cloud.google.com/) 選你原本的專案。
2. 左側選單「API 和服務」→「程式庫」，搜尋 **Google Sheets API**，按「啟用」。
3. 「API 和服務」→「憑證」→「建立憑證」→「OAuth 用戶端 ID」。
   - 應用程式類型選 **電腦版應用程式**（Desktop app），名稱建議取
     `heartsutra-bot-desktop`，跟 calendar bot 那組分開，方便之後管理。
   - OAuth 同意畫面如果已經設定過就不用再設一次。
4. 建好後下載 JSON，改名成 `credentials.json`，放到這個資料夾
   （`C:\claude_practicefiles\telegram-heartsutra-bot\credentials.json`）。
   這個檔案已經在 `.gitignore` 裡，不會被 push 上 GitHub。

### 2. 本機取得 refresh token，並自動建立試算表

在這個資料夾底下開終端機：

```powershell
.\venv\Scripts\python get_refresh_token.py
```

瀏覽器會自動打開，選你要串接的 Google 帳號並同意（因為 App 還在「測試中」狀態，
Google 可能會顯示「這個應用程式未經 Google 驗證」的警告，選「進階」→「前往（不安全）」
即可繼續）。同意後，這支腳本會**自動在你自己的 Google 帳號下建立一份新的
「心經計數表」試算表**（含表頭「日期時間 / 本次遍數 / 累計遍數」）。

完成後終端機會印出四行：

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
GOOGLE_SPREADSHEET_ID=...
```

把這四行存起來，等一下要設到 Render 的環境變數。**不要提交到 git、不要傳給別人。**

### 3. 建立 GitHub repo 並 push 程式碼

（如果你要我幫你在 GitHub 上建 repo 並 push，跟我說一聲，我會照你的既有工作流程處理。）

### 4. Render 部署

1. [Render](https://dashboard.render.com/) 新增 **Web Service**，連到你剛建立的 GitHub repo。
2. 設定：
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python bot.py`
   - **Instance Type**: Free
3. 到 Environment 頁籤，加入環境變數：

   | Key | Value |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | 你的 Telegram bot token |
   | `ALLOWED_TELEGRAM_USER_ID` | 你自己的 Telegram user id（見下方說明） |
   | `GOOGLE_CLIENT_ID` | 步驟 2 印出來的值 |
   | `GOOGLE_CLIENT_SECRET` | 步驟 2 印出來的值 |
   | `GOOGLE_REFRESH_TOKEN` | 步驟 2 印出來的值 |
   | `GOOGLE_SPREADSHEET_ID` | 步驟 2 印出來的值 |
   | `GOOGLE_SHEET_NAME` | 選填，預設 `計數紀錄` |

4. 部署完成後，Render 會給一個網址（例如 `https://xxx.onrender.com`），
   打開應該會看到 `telegram-heartsutra-bot is running`，代表健康檢查端點正常。

**怎麼查自己的 Telegram user id**：在 Telegram 搜尋並開啟 `@userinfobot`，
傳任何訊息給它，它會回覆你的 user id（一串數字）。這一步是為了限制只有你自己
能透過這個機器人寫入你的試算表，避免別人拿到 bot 帳號後亂用。

### 5. UptimeRobot 保活

Render 免費 Web Service 閒置 15 分鐘沒有 HTTP 請求會自動休眠，休眠後 Telegram
訊息會延遲甚至沒反應，要靠外部服務定期打健康檢查網址保持醒著：

1. 到 [UptimeRobot](https://uptimerobot.com/) 免費註冊（或沿用 calendar bot 那組帳號）。
2. 新增一個 Monitor，類型選 HTTP(s)，網址填 Render 給你的那個網址，
   檢查間隔選 5 分鐘（免費方案最短間隔）。
3. 存檔即可，之後 UptimeRobot 會自動每 5 分鐘 ping 一次，Render 就不會睡著。

### 6. 測試

在 Telegram 找到你的機器人，傳 `/start` 應該會收到使用說明，
再傳一個數字像「108」，應該會收到「已記錄：這次 108 遍，累計 108 遍」的回覆，
並且能在 Google 試算表看到那一列。傳「總計」應該回同一個累計數字。

---

## 疑難排解

- **機器人完全沒反應**：先確認 Render 的 Logs 頁籤有沒有錯誤訊息；再確認
  UptimeRobot 的 Monitor 狀態是 Up；`ALLOWED_TELEGRAM_USER_ID` 打錯也會讓
  機器人「已讀不回」（其實是回了「沒有權限」，但只回給你以外的人才看得到）。
- **寫入試算表失敗**：多半是 `GOOGLE_REFRESH_TOKEN` 這組值失效或打錯，
  重新執行一次 `get_refresh_token.py` 取得新的一組再更新 Render 環境變數
  （注意這會建立「另一份」新試算表，記得同步更新 `GOOGLE_SPREADSHEET_ID`，
  或改成手動把新 token 跟舊的 `GOOGLE_SPREADSHEET_ID` 搭配使用）。
- **本機測試**：把環境變數用 PowerShell `$env:` 設定後，
  直接 `.\venv\Scripts\python bot.py` 也能在本機跑（記得先設好 `credentials.json`
  跑過一次 `get_refresh_token.py`）。
