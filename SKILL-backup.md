---
name: telegram-heartsutra-bot
description: Background and feature spec for telegram-heartsutra-bot — a Python service that lets the user text a Telegram bot a number (count of 心經/Heart Sutra recitations) and have it append a row to a Google Sheet with a running cumulative total. Use when the user references "telegram-heartsutra-bot", 「心經計數」/「念心經次數」, HeartSutraCountingBot, asks to continue/resume work on it, or asks what this project is / where it lives.
user-invocable: true
---

# telegram-heartsutra-bot

Base directory for this skill: `C:\claude_practicefiles\.claude\skills\telegram-heartsutra-bot`

## What this is

A small Python backend that bridges Telegram and Google Sheets: the user
texts a dedicated Telegram bot a plain positive integer (e.g. `108`, meaning
"recited the Heart Sutra 108 times"), and the bot appends a row —
date/time, this entry's count, running cumulative total — to a dedicated
Google Sheet, then replies with the new total **and** today's cumulative
total and the date recording started (e.g. `已記錄：這次 50 遍，今日累計
60 遍，從 2026年8月25日 到今日總共累計 280 遍`, added commit `0bbccde`,
2026-08-29). Today's total is computed on the fly by summing same-day rows
— no extra sheet column was added. Sending `總計`/`累計`/`/total` still
reports just the plain current cumulative total (not today's) without
writing a row. This is the
sibling project to [[project_telegram_calendar_bot]] — same architecture
pattern (Telegram long polling + Render + a Google OAuth Desktop client),
different Google API (Sheets instead of Calendar).

- Local repo: `C:\claude_practicefiles\telegram-heartsutra-bot` (git,
  `master` branch)
- GitHub: https://github.com/sunnywin99/telegram-heartsutra-bot (private)
- `gh` (GitHub CLI) is already authenticated on this machine under account
  `sunnywin99` — same account as [[project_trade_calc]].
- Deploy target: **Render free Web Service** (not a Claude Artifact — this
  is a Python backend). **Deployed and live as of 2026-08-25**:
  `https://telegram-heartsutra-bot.onrender.com` (service id
  `srv-da6o300u01pc738ol7d0`, region Oregon). Kept alive on the free tier
  via an UptimeRobot HTTP(s) monitor hitting the Flask health-check route
  (`/`) every 5 minutes, same account/pattern as calendar bot's monitor.
- Development happens on this device — the user calls it 第二台桌電
  ("second desktop"), **not** 第二台筆電 ("second laptop") as earlier
  memory files assumed; see [[machine_setup]], which may need correcting.
- Telegram bot: **HeartSutraCountingBot**, a fresh dedicated bot created via
  @BotFather specifically for this project (not shared with calendar bot),
  per the user's explicit choice to keep projects on separate bots.
- Google Sheet: **「心經計數表」**, created automatically by
  `get_refresh_token.py` under the user's own Google account (not the
  service account/app's) so the user can open and browse it directly —
  id `1jMwwaGaIgO3bLONxxvshxhDoSbzfdvIO9ndG4gGeX3s`. Tab name `計數紀錄`,
  header row `日期時間 / 本次遍數 / 累計遍數`.
- For the full chronological build history (translated to plain Traditional
  Chinese), see [[project_telegram_heartsutra_bot_history]] / the
  telegram-heartsutra-bot-history Artifact — that's the authoritative
  changelog, this file is just an orientation summary.

**Always re-read `bot.py` and run `git log --oneline` in the repo before
making changes** — this file is a snapshot as of commit `0bbccde`
(2026-08-29) and the code may have moved on since.

## Architecture

```
Telegram user ──(a plain number, e.g. "108")──> bot.py (long polling, python-telegram-bot)
                                                     │
                                                     ├─ read Sheet!A2:C all rows → first entry's date,
                                                     │  current cumulative (last row's col C), today's
                                                     │  existing sum (rows whose date == today)
                                                     ├─ new_total = current + this entry
                                                     ├─ today_total = today's existing sum + this entry
                                                     │
                                                     └─ Google Sheets API (googleapiclient)
                                                          spreadsheets().values().append() on GOOGLE_SPREADSHEET_ID
```

`bot.py` also runs a tiny Flask app (`/` → "telegram-heartsutra-bot is
running") in a background thread purely so Render's free Web Service tier
has an HTTP endpoint to consider "alive" — the actual bot logic is 100%
Telegram long polling, no webhook.

### Environment variables (set in Render's dashboard, never committed)

| Key | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | HeartSutraCountingBot's token from @BotFather |
| `ALLOWED_TELEGRAM_USER_ID` | Only this Telegram user id may record entries (`8735906224`, same account as calendar bot — get via @userinfobot) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` | From `get_refresh_token.py`'s one-time local OAuth run |
| `GOOGLE_SPREADSHEET_ID` | Printed by the same one-time script, which also creates the sheet |
| `GOOGLE_SHEET_NAME` | Optional, defaults to `計數紀錄` |
| `PORT` | Set automatically by Render |

`credentials.json` (the downloaded OAuth client JSON) is git-ignored — it
only ever exists locally, never in the repo.

**Windows needs an explicit `tzdata` package**: `ZoneInfo("Asia/Taipei")`
throws `ZoneInfoNotFoundError` on this machine's Python without it — Windows
doesn't ship the IANA tz database the way Linux does. Fixed by adding
`tzdata` to `requirements.txt` (commit `870dfdf`). Render's Linux runtime
likely wouldn't have needed this, but it's harmless there and keeps local
testing working.

## Google Cloud project

Reuses the **same** Google Cloud project as calendar bot,
`telegram-calendar-bot-504106` — Sheets API was already enabled (unclear
exactly when, but confirmed already-on when this project checked). This
session added a second-family OAuth client, **`heartsutra-bot-desktop`**
(Desktop app type, distinct from calendar bot's `telegram-bot-desktop`),
used for `get_refresh_token.py`. Same "can't re-download the client secret
after the creation dialog closes" constraint as calendar bot — see that
skill file for details, it applies identically here.

`get_refresh_token.py` in this project does **two things** in one run
(unlike calendar bot's version, which only gets the token): it also calls
`spreadsheets().create()` right after obtaining credentials, to build the
new sheet under the user's own account. Re-running this script to rotate a
lost/expired refresh token will therefore also create a **second, empty**
spreadsheet — the sensible recovery move is to manually swap the new
`GOOGLE_REFRESH_TOKEN` in but keep the original `GOOGLE_SPREADSHEET_ID`
(don't blindly use whatever new spreadsheet id gets printed), so history
isn't split across two sheets.

## Machine naming correction

Earlier work (calendar bot, trade-calc) assumed this development machine is
called 第二台筆電 ("second laptop") — see [[machine_setup]]. The user
corrected this mid-session on 2026-08-25: it's actually called **第二台桌電**
("second desktop"). The underlying claude-in-chrome deviceId
(`1c9440ae-7ea4-4a17-adf7-dfaac0d9ba48`) is unchanged and still resolves to
this same machine; only the display name was wrong. [[machine_setup]]
should be corrected to match — check whether that's been done yet before
relying on its wording.

## Working style for this project

Same user as [[project_trade_calc]] and [[project_telegram_calendar_bot]] —
expect Traditional Chinese only (see [[feedback_chinese_only]]). Same
external-service setup pattern as calendar bot: Google Cloud console clicks,
Render account, UptimeRobot account, Telegram bot creation via @BotFather —
flag clearly which steps need the user's own hands (account logins, clicking
"Allow" on OAuth consent, correctly identifying the *real* @userinfobot
among several impersonators with matching display names but different
`@handles` — this happened during setup, be alert to it) versus which Claude
can do directly (code, git, `gh`, browser automation on consoles once a
browser session is already logged in — see [[machine_setup]]).

## When invoked

1. Confirm the repo is still at
   `C:\claude_practicefiles\telegram-heartsutra-bot` and check
   `git log --oneline -10` + skim `bot.py` to see what's changed since this
   doc was written.
2. Summarize current state / answer the user's question using the fresh
   info, not blindly from this file.
3. If asked to continue development, every change follows the same
   **standing 6-step workflow** (see
   [[feedback_telegram_heartsutra_bot_workflow]], mirroring
   [[feedback_telegram_calendar_bot_workflow]] but for this project):
   1. Edit the code (`bot.py`/`get_refresh_token.py`/`README.md`).
   2. `git commit` + `git push` (telegram-heartsutra-bot repo).
   3. Confirm Render picked up the new commit and redeployed cleanly (check
      the Render dashboard's Deploy/Logs tab) — pushing to GitHub does not
      by itself mean the live bot is running the new code.
   4. Add a new `ENTRIES` item to telegram-heartsutra-bot-history's
      `index.html` (translated to plain Traditional Chinese), then
      commit/push/republish that repo's Artifact.
   5. Update this skill file (`SKILL.md`) with whatever changed, and sync
      `SKILL-backup.md` in the telegram-heartsutra-bot repo (commit+push) so
      the disaster-recovery backup copy doesn't drift.
   6. Update memory (`[[project_telegram_heartsutra_bot]]` and any other
      relevant memory file) with what changed and why.
