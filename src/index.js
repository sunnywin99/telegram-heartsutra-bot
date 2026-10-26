/**
 * Cloudflare Worker 版的心經計數機器人：傳數字就寫一列到 Google 試算表，並回覆累計。
 *
 * Telegram 有新訊息時呼叫 POST /telegram（webhook）。沒有排程、也不需要另外存狀態，
 * 所有資料都在 Google 試算表裡。
 *
 * 設定（Cloudflare 後台 → Worker → 設定 → 變數和機密，類型都選「秘密」）：
 *   TELEGRAM_BOT_TOKEN      跟 @BotFather 申請的 token
 *   GOOGLE_CLIENT_ID        get_refresh_token.py 印出來的值（原本 Render／.env 裡那組）
 *   GOOGLE_CLIENT_SECRET    同上
 *   GOOGLE_REFRESH_TOKEN    同上
 * 寫在 wrangler.toml 的 [vars]：
 *   ALLOWED_TELEGRAM_USER_ID  只處理這個 Telegram user id 的訊息
 *   GOOGLE_SPREADSHEET_ID     心經計數表的 ID
 *   GOOGLE_SHEET_NAME         分頁名稱，預設「計數紀錄」
 *
 * 第一次部署、填好上面的值之後，打開 https://<worker 網址>/setup，
 * 會逐項檢查設定，並向 Telegram 註冊 webhook。
 */
import {
  USAGE_TEXT,
  currentTotal,
  parseCommand,
  recordedText,
  recordingStats,
  taipeiNow,
} from "./logic.js";

const REQUIRED_SECRETS = [
  "TELEGRAM_BOT_TOKEN",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "GOOGLE_SPREADSHEET_ID",
];

// 下面三個 *_BASE 只在本機測試時用來指向假的伺服器
const telegramBase = (env) => env.TELEGRAM_API_BASE || "https://api.telegram.org";
const oauthBase = (env) => env.GOOGLE_OAUTH_BASE || "https://oauth2.googleapis.com";
const sheetsBase = (env) => env.SHEETS_API_BASE || "https://sheets.googleapis.com";
const sheetName = (env) => env.GOOGLE_SHEET_NAME || "計數紀錄";

async function webhookSecret(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

async function telegram(env, method, body) {
  const res = await fetch(`${telegramBase(env)}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
  if (!data.ok) console.error(`Telegram ${method} 失敗：${data.description}`);
  return data;
}

function sendMessage(env, chatId, text) {
  return telegram(env, "sendMessage", { chat_id: chatId, text });
}

/** 用 refresh token 換一個短效的 access token */
async function googleAccessToken(env) {
  const res = await fetch(`${oauthBase(env)}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Google 授權失敗：${data.error_description || data.error || `HTTP ${res.status}`}`);
  }
  return data.access_token;
}

async function sheetsRequest(env, accessToken, path, init = {}) {
  const url = `${sheetsBase(env)}/v4/spreadsheets/${encodeURIComponent(env.GOOGLE_SPREADSHEET_ID)}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google 試算表錯誤：${data.error?.message || `HTTP ${res.status}`}`);
  return data;
}

async function getValues(env, accessToken, range) {
  const data = await sheetsRequest(env, accessToken, `/values/${encodeURIComponent(range)}`);
  return data.values || [];
}

async function appendRow(env, accessToken, row) {
  const range = encodeURIComponent(`${sheetName(env)}!A:C`);
  await sheetsRequest(env, accessToken, `/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values: [row] }),
  });
}

/** 處理一則文字訊息，回傳要回覆的文字 */
async function handleText(env, text) {
  const cmd = parseCommand(text);
  if (cmd.kind === "help") return USAGE_TEXT;
  if (cmd.kind === "bad") return "看不出這是一個有效的數字，麻煩重打一次。\n\n" + USAGE_TEXT;

  let accessToken;
  try {
    accessToken = await googleAccessToken(env);
  } catch (err) {
    console.error("連線 Google 試算表失敗", err);
    return "連線 Google 試算表時發生錯誤，稍後再試一次。";
  }

  if (cmd.kind === "total") {
    try {
      const total = currentTotal(await getValues(env, accessToken, `${sheetName(env)}!C2:C`));
      return `目前累計 ${total} 遍 🙏`;
    } catch (err) {
      console.error("讀取累計總數失敗", err);
      return "讀取累計總數時發生錯誤，稍後再試一次。";
    }
  }

  // record
  const now = taipeiNow();
  try {
    const rows = await getValues(env, accessToken, `${sheetName(env)}!A2:C`);
    const stats = recordingStats(rows, now.date);
    const newTotal = stats.grandTotal + cmd.count;
    await appendRow(env, accessToken, [now.dateTime, cmd.count, newTotal]);
    return recordedText(cmd.count, stats.todayTotal + cmd.count, newTotal, stats.firstDate);
  } catch (err) {
    console.error("寫入 Google 試算表失敗", err);
    return "寫入 Google 試算表時發生錯誤，稍後再試一次。";
  }
}

async function handleUpdate(update, env) {
  const message = update.message;
  if (!message || typeof message.text !== "string") return; // 只處理文字訊息
  const userId = message.from?.id;
  if (userId !== Number(env.ALLOWED_TELEGRAM_USER_ID)) {
    console.warn(`拒絕未授權使用者 ${userId ?? "unknown"} 的訊息`);
    await sendMessage(env, message.chat.id, "這個機器人只服務特定使用者，你沒有權限使用。");
    return;
  }
  await sendMessage(env, message.chat.id, await handleText(env, message.text));
}

async function setup(url, env) {
  const missing = REQUIRED_SECRETS.filter((k) => !env[k]);
  if (missing.length) {
    return `還沒設定：${missing.join("、")}\n請到 Cloudflare 後台這個 Worker 的「設定 → 變數和機密」新增（勾選「秘密」），存檔後再打開這個網址一次。`;
  }
  const me = await telegram(env, "getMe", {});
  if (!me.ok) return `Bot Token 無效（${me.description}），請確認 TELEGRAM_BOT_TOKEN 有沒有貼錯。`;

  let total;
  try {
    const accessToken = await googleAccessToken(env);
    total = currentTotal(await getValues(env, accessToken, `${sheetName(env)}!C2:C`));
  } catch (err) {
    return `${err.message}\n請確認 GOOGLE_CLIENT_ID／GOOGLE_CLIENT_SECRET／GOOGLE_REFRESH_TOKEN／GOOGLE_SPREADSHEET_ID 有沒有貼錯。`;
  }

  const hook = `${url.origin}/telegram`;
  const res = await telegram(env, "setWebhook", {
    url: hook,
    secret_token: await webhookSecret(env.TELEGRAM_BOT_TOKEN),
    allowed_updates: ["message"],
  });
  if (!res.ok) return `向 Telegram 註冊 webhook 失敗：${res.description}`;
  return `設定完成！@${me.result.username} 現在由這個 Worker 處理訊息（${hook}）。\nGoogle 試算表連線正常，目前累計 ${total} 遍。傳 /total 給機器人試試看。`;
}

const textResponse = (body, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/telegram" && request.method === "POST") {
      const expected = await webhookSecret(env.TELEGRAM_BOT_TOKEN || "");
      if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== expected) {
        return textResponse("forbidden", 403);
      }
      const update = await request.json().catch(() => null);
      // 一律回 200，避免 Telegram 因為錯誤一直重送同一則訊息（重送會重複記錄遍數）
      if (update) {
        try {
          await handleUpdate(update, env);
        } catch (err) {
          console.error("處理訊息失敗", err);
        }
      }
      return textResponse("ok");
    }

    if (url.pathname === "/setup") return textResponse(await setup(url, env));

    return textResponse("telegram-heartsutra-bot is running");
  },
};
