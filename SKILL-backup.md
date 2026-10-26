---
name: telegram-heartsutra-bot
description: Background and feature spec for telegram-heartsutra-bot — a Cloudflare Worker (JavaScript, formerly Python) that lets the user text a Telegram bot a number (count of 心經/Heart Sutra recitations) and have it append a row to a Google Sheet with a running cumulative total. Use when the user references "telegram-heartsutra-bot", 「心經計數」/「念心經次數」, HeartSutraCountingBot, asks to continue/resume work on it, or asks what this project is / where it lives.
user-invocable: true
---

# telegram-heartsutra-bot

Base directory for this skill (second desktop's CLI): `C:\claude_practicefiles\.claude\skills\telegram-heartsutra-bot`

## What this is

A small Telegram ↔ Google Sheets bridge: the user texts a dedicated Telegram
bot a plain positive integer (e.g. `108`, meaning "recited the Heart Sutra
108 times"), and the bot appends a row — date/time, this entry's count,
running cumulative total — to a dedicated Google Sheet, then replies in a
compact format: `已記錄：+50 (60) , 280 (from 2026/08/25)` — `+N` this entry,
`(X)` today's cumulative, `M` the grand total, `(from ...)` the first-ever
recorded date. Today's total is computed by summing same-day rows (no extra
column). The user found an earlier sentence-style reply too verbose, so keep
it compact. `總計`/`累計`/`/total` reports just the plain current cumulative
total without writing a row. Full-width digits (`１０８`) count as numbers.

- GitHub: https://github.com/sunnywin99/telegram-heartsutra-bot
  (**public** repo — never commit secrets)
- **Production: Cloudflare Workers free plan (since 2026-10-26)**,
  `https://telegram-heartsutra-bot.sunnywin99.workers.dev`, connected to
  GitHub via Workers Builds — every push to `master` auto-deploys.
  - Secrets in the Cloudflare dashboard (Worker → 設定 → 變數和機密, "秘密"
    checked): `TELEGRAM_BOT_TOKEN`, `GOOGLE_CLIENT_ID`,
    `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`.
  - Plain vars in `wrangler.toml`: `ALLOWED_TELEGRAM_USER_ID` (`8735906224`),
    `GOOGLE_SPREADSHEET_ID`, `GOOGLE_SHEET_NAME` (`計數紀錄`).
  - `/setup` checks every secret, the Telegram token, the Google refresh
    token and sheet access, then registers the webhook — use it first when
    anything breaks; it reports exactly which value is wrong.
- History: Python + python-telegram-bot long-polling on Render free tier
  (live 2026-08-25, UptimeRobot keep-alive) → Render's 750hr/month pool ran
  out → self-hosted third desktop via Windows Scheduled Task (2026-09) →
  the third desktop died → rewritten as a Cloudflare Worker (2026-10-26),
  same rewrite pattern as telegram-clock-alert-bot. Python bot files were
  removed; they're in git history. Render/UptimeRobot are no longer used.
- **Development: Claude Code cloud sessions.**
- Telegram bot: **HeartSutraCountingBot**, a dedicated bot (not shared).
- Google Sheet: **「心經計數表」** in the user's own Google account, id
  `1jMwwaGaIgO3bLONxxvshxhDoSbzfdvIO9ndG4gGeX3s`, tab `計數紀錄`, header row
  `日期時間 / 本次遍數 / 累計遍數`.
- Changelog: the telegram-heartsutra-bot-history repo and its Artifact —
  authoritative; this file is an orientation summary.

**Always re-read `src/` and run `git log --oneline` before making changes.**

## Architecture

```
Telegram ──webhook POST /telegram──> Worker (src/index.js)
                                       ├─ checks X-Telegram-Bot-Api-Secret-Token
                                       │  (= first 32 hex chars of sha256(bot token))
                                       ├─ checks ALLOWED_TELEGRAM_USER_ID
                                       ├─ parseCommand (src/logic.js)
                                       ├─ POST oauth2.googleapis.com/token (refresh_token grant)
                                       ├─ GET  Sheets values {tab}!A2:C → recordingStats
                                       └─ POST Sheets values {tab}!A:C:append (RAW, INSERT_ROWS)
```

No Durable Object / storage — all data lives in the sheet. The webhook
always answers 200 so Telegram never re-sends (a re-send would double-count).
`TELEGRAM_API_BASE` / `GOOGLE_OAUTH_BASE` / `SHEETS_API_BASE` env vars exist
only so local tests can point at a fake server.

## Google Cloud project

Reuses calendar bot's project `telegram-calendar-bot-504106`, OAuth client
**`heartsutra-bot-desktop`** (Desktop app type). The client secret can't be
re-downloaded after the creation dialog closes (same as calendar bot).

If the refresh token is expired/revoked, run
`get_refresh_token.py --keep-sheet` on a computer with Python (needs
`credentials.json` for that OAuth client) and paste the new
`GOOGLE_REFRESH_TOKEN` into Cloudflare. Without `--keep-sheet` the script
also creates a brand-new empty spreadsheet — don't switch to that one.
If the OAuth consent screen is still in "Testing", refresh tokens expire
after 7 days; publishing it to "In production" avoids that (personal use
needs no Google review, just an "unverified app" warning at login).

## Working style for this project

Same user as the other Telegram bots — Traditional Chinese only (see
[[feedback_chinese_only]]). Not a developer: give exact click paths, one
step at a time. Watch for fake @userinfobot impersonators if the user ever
needs to look up their Telegram id again.

## When invoked

1. Check `git log --oneline -10` + skim `src/`.
2. Answer from the fresh info, not blindly from this file.
3. Standing 4-step workflow for changes:
   1. Edit `src/` (keep `USAGE_TEXT`, `README.md`, `test/` in sync), run
      `npm test`; for behavior changes, `npx wrangler dev` with fake
      Telegram/Google servers via the `*_BASE` vars in `.dev.vars`.
   2. Commit + push to the session's branch, then (with the user's OK)
      fast-forward `master`; Cloudflare auto-deploys.
   3. Add an `ENTRIES` item to telegram-heartsutra-bot-history's
      `index.html` (plain Traditional Chinese), commit/push, republish its
      Artifact.
   4. Update this `SKILL-backup.md` (commit + push).
