# Announcement posters (إعلانات الدروس)

Posters for lessons and timetables appear on the home page («إعلانات الدروس») and on `/announcements/`. Visitors can open each one at full size and download it. A poster comes down by itself after its end date.

The team adds them through a Telegram bot. Nobody needs GitHub access.

## For the team

- **Add:** send the poster to the bot as a photo (or as a file, for full quality). Optional caption:
  - first line: the title, e.g. `شرح كتاب التوحيد — أول جمعة من كل شهر، مكة المكرمة`
  - end date: `حتى ١٤٤٨/٧/٢` (Hijri), or a Gregorian date such as `حتى 2027-01-10`. Without one, the poster stays until it is removed.
- **Remove:** reply «حذف» to the poster you sent.
- **See what is up:** `/list`.

The bot answers within the hour, when the site picks up the messages. The poster shows on the site a few minutes after that.

## One-time setup (owner)

1. In Telegram open **@BotFather**, send `/newbot`, pick a name (e.g. «إعلانات موقع الشيخ يحيى الجابري») and a username ending in `bot`. BotFather replies with a **token**. Keep it private: it goes only into GitHub, never into chat or the repo.
2. GitHub, repository **Settings > Secrets and variables > Actions**:
   - *Secrets* → `TELEGRAM_BOT_TOKEN` = the token.
   - *Variables* → `BOT_ADMINS` = the Telegram user ids allowed to post, comma-separated. To get someone's id, they send the bot any message. On the next run the bot replies with their id, and you add it here.
3. **Actions** tab → *Announcements bot* → *Run workflow* once to check it. After that it runs every hour.

## How it works

`.github/workflows/telegram-bot.yml` runs `tools/announce_bot.mjs` every hour:
- It reads the bot's new messages and saves each poster as `site/ann/<sha16>.jpg`.
- It updates `site/data/announcements.json`: title, end date, size, and which message it came from.
- It drops expired posters.

Then `tools/ann_thumbs.py` makes 480-px WebP previews (`site/ann/thumb/`) for the home page. The workflow commits and pushes the changes, and the push redeploys the site. Only after that does it confirm the messages to Telegram (`--ack`), so nothing is lost if a run fails. Telegram keeps unconfirmed messages for 24 hours.

The site also hides expired posters at build time (Riyadh date). Tests: `node tests/bot_check.mjs` runs against a fake Telegram API.
