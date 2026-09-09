"""
主程式：Telegram 長輪詢，收到數字就寫入 Google 試算表一列，並自動計算累計總數。
Render 免費方案保活用的健康檢查網址也在這裡。

環境變數（Render 的 Environment 頁籤設定，或本機/自架伺服器同資料夾的 .env 檔，見 .env.example）：
    TELEGRAM_BOT_TOKEN        跟 @BotFather 申請的 token
    ALLOWED_TELEGRAM_USER_ID  只允許這個 Telegram user id 的訊息被記錄（防止別人亂用）
    GOOGLE_CLIENT_ID          get_refresh_token.py 印出來的值
    GOOGLE_CLIENT_SECRET      get_refresh_token.py 印出來的值
    GOOGLE_REFRESH_TOKEN      get_refresh_token.py 印出來的值
    GOOGLE_SPREADSHEET_ID     create_sheet.py 印出來的試算表 ID
    GOOGLE_SHEET_NAME         分頁名稱，預設 "計數紀錄"
    PORT                      Render 會自動設定；自架伺服器同時跑多個 bot 時要各自設不同埠號
"""
import logging
import os
import threading
from datetime import datetime
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from flask import Flask
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from telegram import Update
from telegram.ext import Application, ContextTypes, MessageHandler, filters

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
ALLOWED_TELEGRAM_USER_ID = int(os.environ["ALLOWED_TELEGRAM_USER_ID"])
GOOGLE_CLIENT_ID = os.environ["GOOGLE_CLIENT_ID"]
GOOGLE_CLIENT_SECRET = os.environ["GOOGLE_CLIENT_SECRET"]
GOOGLE_REFRESH_TOKEN = os.environ["GOOGLE_REFRESH_TOKEN"]
GOOGLE_SPREADSHEET_ID = os.environ["GOOGLE_SPREADSHEET_ID"]
GOOGLE_SHEET_NAME = os.environ.get("GOOGLE_SHEET_NAME", "計數紀錄")
PORT = int(os.environ.get("PORT", "8080"))

TIMEZONE = ZoneInfo("Asia/Taipei")
SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

USAGE_TEXT = (
    "直接傳一個數字給我，我會記一列到 Google 試算表，並自動算出累計總數。例如：\n"
    "108\n\n"
    "傳「總計」或 /total 可以查目前累計多少遍。"
)


def _get_sheets_service():
    creds = Credentials(
        token=None,
        refresh_token=GOOGLE_REFRESH_TOKEN,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=SHEETS_SCOPES,
    )
    creds.refresh(GoogleAuthRequest())
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def _get_current_total(service) -> int:
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=GOOGLE_SPREADSHEET_ID, range=f"{GOOGLE_SHEET_NAME}!C2:C")
        .execute()
    )
    values = result.get("values", [])
    if not values:
        return 0
    last_row = values[-1]
    if not last_row:
        return 0
    return int(last_row[0])


def _get_recording_stats(service, today_str: str):
    """回傳 (第一筆記錄的日期字串 YYYY/MM/DD, 目前累計總數, 今日已累計遍數)。"""
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=GOOGLE_SPREADSHEET_ID, range=f"{GOOGLE_SHEET_NAME}!A2:C")
        .execute()
    )
    rows = result.get("values", [])
    if not rows:
        return today_str, 0, 0

    first_date_str = rows[0][0].split(" ")[0]
    last_row = rows[-1]
    grand_total = int(last_row[2]) if len(last_row) >= 3 and last_row[2] else 0
    today_total = sum(
        int(row[1])
        for row in rows
        if len(row) >= 2 and row[1] and row[0].startswith(today_str)
    )
    return first_date_str, grand_total, today_total


def _append_row(service, count: int, new_total: int, now: datetime):
    now_str = now.strftime("%Y/%m/%d %H:%M:%S")
    body = {"values": [[now_str, count, new_total]]}
    service.spreadsheets().values().append(
        spreadsheetId=GOOGLE_SPREADSHEET_ID,
        range=f"{GOOGLE_SHEET_NAME}!A:C",
        valueInputOption="RAW",
        insertDataOption="INSERT_ROWS",
        body=body,
    ).execute()


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    if user is None or user.id != ALLOWED_TELEGRAM_USER_ID:
        await update.message.reply_text("這個機器人只服務特定使用者，你沒有權限使用。")
        logger.warning("拒絕未授權使用者 %s 的訊息", user.id if user else "unknown")
        return

    text = (update.message.text or "").strip()

    if text in ("/start", "/help"):
        await update.message.reply_text(USAGE_TEXT)
        return

    try:
        service = _get_sheets_service()
    except Exception:
        logger.exception("連線 Google 試算表失敗")
        await update.message.reply_text("連線 Google 試算表時發生錯誤，稍後再試一次。")
        return

    if text in ("/total", "總計", "累計"):
        try:
            total = _get_current_total(service)
        except Exception:
            logger.exception("讀取累計總數失敗")
            await update.message.reply_text("讀取累計總數時發生錯誤，稍後再試一次。")
            return
        await update.message.reply_text(f"目前累計 {total} 遍 🙏")
        return

    if not text.isdigit() or int(text) <= 0:
        await update.message.reply_text("看不出這是一個有效的數字，麻煩重打一次。\n\n" + USAGE_TEXT)
        return

    count = int(text)
    now = datetime.now(TIMEZONE)
    today_str = now.strftime("%Y/%m/%d")
    try:
        first_date_str, current_total, today_existing = _get_recording_stats(service, today_str)
        new_total = current_total + count
        today_total = today_existing + count
        _append_row(service, count, new_total, now)
    except Exception:
        logger.exception("寫入 Google 試算表失敗")
        await update.message.reply_text("寫入 Google 試算表時發生錯誤，稍後再試一次。")
        return

    await update.message.reply_text(
        f"已記錄：+{count} ({today_total}) , {new_total} (from {first_date_str})"
    )


def _run_health_check_server():
    app = Flask(__name__)

    @app.route("/")
    def index():
        return "telegram-heartsutra-bot is running"

    app.run(host="0.0.0.0", port=PORT)


def main():
    threading.Thread(target=_run_health_check_server, daemon=True).start()

    application = Application.builder().token(TELEGRAM_BOT_TOKEN).build()
    application.add_handler(MessageHandler(filters.TEXT, handle_message))

    logger.info("機器人啟動，開始長輪詢...")
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
