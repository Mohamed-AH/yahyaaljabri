# Daily Telegram sync

Every morning (06:35 Riyadh, started by the Worker's timer; GitHub's own schedule at 12:50 is a backup) the workflow
`.github/workflows/telegram-sync.yml`:

1. reads the new posts of t.me/jabiri, t.me/jabrih and t.me/aljabri013 (`tools/tg_sync.py`) and appends them to
   `data/telegram/<channel>.jsonl`, one post per line, never rewriting older ones;
2. imports them (`tools/telegram_lessons.py`, `tools/import_telegram.py`, the same rules, overrides and spelling fixes as by hand);
3. checks that no existing lesson changed or disappeared and that at most 30 lessons are new (`tools/tg_report.py check`);
4. downloads, converts and uploads the new audio to R2 (`tools/fetch_audio.py`, at most 4 GB a run; a lesson appears on the site
   only once its audio is hosted, and a download that fails is retried the next day; `data/no_audio.json` lists lessons that
   can never come from Telegram);
5. builds the site, runs `tests/e2e.mjs` and `tests/xss_check.mjs`, and pushes to `main` (which deploys);
6. sends a summary through the announcements bot to the chats in `SYNC_NOTIFY`: lessons now live, lessons waiting for their
   audio, and posts held for review (no title, maybe another speaker: answer them in `data/telegram_overrides.json` as before).

It stops without publishing, and the bot says why, when an existing lesson would change, when more than 30 lessons are new,
when the build or a test fails, or when the Telegram login no longer works. When Telegram asks it to wait more than two
minutes it stops reading and continues on the next run. Only one run at a time.

## One-time setup

1. **A reading-only Telegram account.** A second account (spare number) used only for this, so the daily job never holds the
   login of anyone's own chats. It needs to join nothing: the channels are public.
2. **Its login line.** In Cloud Shell, in the `yahyaaljabri` folder with your `.env` (for `TG_API_ID` / `TG_API_HASH`, which
   can stay the same):
   `git pull && ~/venv/bin/python tools/tg_login.py`
   Enter the second account's phone number and the code Telegram sends to it. It prints one long line: that line is the login.
3. **GitHub secrets** (repository, Settings > Secrets and variables > Actions > *New repository secret*):
   `TG_API_ID`, `TG_API_HASH`, `TG_SESSION` (the line from step 2), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
   (from `.env`). `TELEGRAM_BOT_TOKEN` is already there for the announcements bot.
4. **Who gets the summary:** tab *Variables*, `SYNC_NOTIFY` = your Telegram user id (several: comma-separated). Each person
   presses *Start* in the announcements bot once, or the bot cannot write to them.
5. Then delete `.env` and `.telegram.session` from Cloud Shell, and start the first run by hand: Actions > *Telegram sync* >
   *Run workflow*.

## Stopping it

Actions > *Telegram sync* > ⋯ > *Disable workflow*. To cancel the login itself: in Telegram on the reading account,
Settings > Devices > end the session (the next run then stops and says so). A new login is step 2 again.

## Checking it offline

`pip install telethon && python tests/tg_sync_check.py`: post conversion (every stored post's text round-trips), appending
only newer posts, the safety stops, the summary, and that older lessons stay exactly as they were when newer posts arrive.
