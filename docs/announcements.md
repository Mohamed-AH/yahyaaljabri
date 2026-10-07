# Announcement posters (إعلانات الدروس)

Posters for lessons and timetables appear on the home page («إعلانات الدروس») and on `/announcements/`. Visitors can open each one at full size and download it. A poster comes down by itself after its end date.

The team adds them through a Telegram bot. Nobody needs GitHub access.

## For the team

- **Add:** send the poster to the bot as a photo (or as a file, for full quality). Optional caption:
  - first line: the title, e.g. `شرح كتاب التوحيد — أول جمعة من كل شهر، مكة المكرمة`
  - end date: `حتى ١٤٤٨/٧/٢` (Hijri), or a Gregorian date such as `حتى 2027-01-10`. Without one, the poster stays until it is removed.
- **Lesson schedule:** start the caption's first line with «جدول», e.g. `جدول الدروس العلمية بمحافظة جدة ١٤٤٨هـ`. It always shows first, before the other posters, and stays until replaced: sending a new schedule takes the old one down by itself.
- **Remove:** reply «حذف» to the poster you sent.
- **See what is up:** `/list`.

The bot answers within the hour, when the site picks up the messages. The poster shows on the site a few minutes after that.

## One-time setup (owner)

1. In Telegram open **@BotFather**, send `/newbot`, pick a name (e.g. «إعلانات موقع الشيخ يحيى الجابري») and a username ending in `bot`. BotFather replies with a **token**. Keep it private: it goes only into GitHub, never into chat or the repo.
2. GitHub, repository **Settings > Secrets and variables > Actions**:
   - *Secrets* → `TELEGRAM_BOT_TOKEN` = the token.
   - *Variables* → `BOT_ADMINS` = the Telegram user ids allowed to post, comma-separated. To get someone's id, they send the bot any message. On the next run the bot replies with their id, and you add it here.
3. **Actions** tab → *Announcements bot* → *Run workflow* once to check it. After that it runs every hour.
4. The timer. GitHub skips most of its own scheduled runs, so the site's Cloudflare Worker starts the bot every hour (and the
   YouTube sync daily at 05:47 Riyadh), using cron triggers in `wrangler.jsonc` (free plan). It needs one token:
   - GitHub → profile picture → **Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token**.
     Name `yaljabri-timer`, an expiry date (put a reminder to renew it), *Only select repositories* → `yahyaaljabri`,
     *Repository permissions* → **Actions: Read and write**. Nothing else.
   - Cloudflare → **Workers & Pages > yahyaaljabri > Settings > Variables and Secrets > Add** → type *Secret*, name `GH_TOKEN`,
     value = the token → *Deploy*.
   - Check: the next hour's run in GitHub's Actions list shows *workflow_dispatch* as its event, and the Worker's *Logs*
     show `telegram-bot.yml: 204`. A `401` means the token expired or lacks the Actions permission.

## How it works

`.github/workflows/telegram-bot.yml` runs `tools/announce_bot.mjs` every hour:
- It reads the bot's new messages and saves each poster as `site/ann/<sha16>.jpg`.
- It updates `site/data/announcements.json`: title, end date, size, and which message it came from.
- It drops expired posters.

Then `tools/ann_thumbs.py` makes 480-px WebP previews (`site/ann/thumb/`) for the home page. The workflow commits and pushes the changes, and the push redeploys the site. Only after that does it confirm the messages to Telegram (`--ack`), so nothing is lost if a run fails. Telegram keeps unconfirmed messages for 24 hours.

The site also hides expired posters at build time (Riyadh date). Tests: `node tests/bot_check.mjs` runs against a fake Telegram API.
