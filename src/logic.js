// 不碰網路的純邏輯：指令解析、台北時間格式、從試算表資料算累計。
// 抽出來是為了能用 node --test 直接測（test/logic.test.js）。

const TZ_OFFSET_MS = 8 * 60 * 60 * 1000; // Asia/Taipei，沒有日光節約

export const USAGE_TEXT =
  "直接傳一個數字給我，我會記一列到 Google 試算表，並自動算出累計總數。例如：\n" +
  "108\n\n" +
  "傳「總計」或 /total 可以查目前累計多少遍。";

const pad = (n) => String(n).padStart(2, "0");

/** 台北時間，回傳 { dateTime: "YYYY/MM/DD HH:MM:SS", date: "YYYY/MM/DD" } */
export function taipeiNow(ms = Date.now()) {
  const d = new Date(ms + TZ_OFFSET_MS);
  const date = `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  return { dateTime: `${date} ${time}`, date };
}

/** 解析訊息：help / total / record / bad。全形數字（１０８）也算數字，跟 Python 的 isdigit() 一樣 */
export function parseCommand(rawText) {
  const text = (rawText || "").trim();
  if (text === "/start" || text === "/help") return { kind: "help" };
  if (text === "/total" || text === "總計" || text === "累計") return { kind: "total" };
  const normalized = text.normalize("NFKC");
  if (/^[0-9]+$/.test(normalized) && Number(normalized) > 0) {
    return { kind: "record", count: Number(normalized) };
  }
  return { kind: "bad" };
}

function toInt(v) {
  return parseInt(String(v).replace(/,/g, ""), 10);
}

/** 試算表 C2:C 的資料 → 目前累計（最後一列的 C 欄） */
export function currentTotal(cValues) {
  if (!cValues || cValues.length === 0) return 0;
  const last = cValues[cValues.length - 1];
  if (!last || last.length === 0) return 0;
  return toInt(last[0]);
}

/**
 * 試算表 A2:C 的資料 → { firstDate, grandTotal, todayTotal }
 * firstDate：第一筆記錄的日期；todayTotal：今天已經記了幾遍
 */
export function recordingStats(rows, todayStr) {
  if (!rows || rows.length === 0) return { firstDate: todayStr, grandTotal: 0, todayTotal: 0 };
  const firstDate = String(rows[0][0]).split(" ")[0];
  const last = rows[rows.length - 1];
  const grandTotal = last.length >= 3 && last[2] ? toInt(last[2]) : 0;
  let todayTotal = 0;
  for (const row of rows) {
    if (row.length >= 2 && row[1] && String(row[0]).startsWith(todayStr)) todayTotal += toInt(row[1]);
  }
  return { firstDate, grandTotal, todayTotal };
}

export function recordedText(count, todayTotal, newTotal, firstDate) {
  return `已記錄：+${count} (${todayTotal}) , ${newTotal} (from ${firstDate})`;
}
