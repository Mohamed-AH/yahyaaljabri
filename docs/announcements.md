# Announcement posters (إعلانات الدروس)

Posters for lessons and timetables appear on the home page («إعلانات الدروس») and on `/announcements/`. Visitors can open each one at full size and download it. A poster comes down by itself after its end date.

The team adds them through a Telegram bot. Nobody needs GitHub access.

## For the team

Open the bot and send **/menu** (or tap the menu button). Everything is buttons:

- **📋 الإعلانات:** all posters in the order they appear on the site, each with its state (منشور، مسودة، انتهى). Tap one to:
  - **✏️ تعديل النص:** the bot asks for the new title; answer by replying to its question.
  - **📅 تاريخ الانتهاء:** a Hijri date such as `١٤٤٨/٧/٢` (it comes down after that day), or `بدون`.
  - **⬆️ / ⬇️ / ⏫:** move it one place up or down, or to the top.
  - **🗑 حذف:** asks once more before removing it.
- **➕ إضافة إعلان:** send the picture (as a photo, or as a file for full quality). The bot asks for the title and the end date
  (unless they are already in the caption, e.g. first line the title and `حتى ١٤٤٨/٧/٢`), then shows the poster with
  **✅ نشر في الأعلى / في الأسفل**. Until then it is a draft and does not show on the site.
- **Lesson schedule:** a title starting with «جدول» (or `#جدول` in the caption) marks the schedule poster; publishing a new one
  takes the old one down by itself. It goes where you publish it, like any other poster.

The bot answers at once; the site shows each change about two minutes later. Only the Telegram users in `BOT_ADMINS` can
use it; anyone else is told their Telegram id, so the owner can add them.

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

5. **The instant menu (2026-11-12).** The Worker answers the bot itself, through a Telegram webhook to
   `https://yaljabri.com/bot` (`worker/bot.js`), and saves each change straight to `site/data/announcements.json` on GitHub.
   - GitHub: edit the `yaljabri-timer` token (Settings > Developer settings > Fine-grained tokens > the token > Edit) and add
     *Repository permissions* → **Contents: Read and write** (Actions stays Read and write). Same token, nothing to copy.
   - Cloudflare → **Workers & Pages > yahyaaljabri > Settings > Variables and Secrets > Add**:
     `TELEGRAM_BOT_TOKEN` (type *Secret*, the bot's token) and `BOT_ADMINS` (type *Text*, the same ids as in GitHub) → *Deploy*.
   - GitHub → Settings > Secrets and variables > Actions > *Variables* → `BOT_WEBHOOK` = `on`. The next hourly run (or
     *Run workflow*) points the bot at the Worker. `BOT_WEBHOOK` = `off` (or removing it) switches back to hourly answers.
   - Check: send the bot `/menu`; it should answer within seconds. If not, the hourly run's log prints Telegram's last webhook error.

## How it works

**With the instant menu** (`BOT_WEBHOOK=on`), `worker/bot.js` handles every message and button and commits
`site/data/announcements.json` through the GitHub API (retrying when the file changed meanwhile). The file's order is the
site's order; a new picture is first a `draft` with Telegram's `file_id` and no image. The bot then starts the workflow below
at once, which downloads the picture, sizes it, makes its preview and removes pictures no poster uses any more. Telegram
calls the Worker with a secret header derived from the bot token (`webhookSecret()` in `worker/posters.js`); other calls get 403.

**Hourly** (and without the instant menu, for everything), `.github/workflows/telegram-bot.yml` runs `tools/announce_bot.mjs`:
- It reads the bot's new messages and saves each poster as `site/ann/<sha16>.jpg`.
- It updates `site/data/announcements.json`: title, end date, size, and which message it came from.
- It drops expired posters.

Then `tools/ann_thumbs.py` makes 480-px WebP previews (`site/ann/thumb/`) for the home page. The workflow commits and pushes the changes, and the push redeploys the site. Only after that does it confirm the messages to Telegram (`--ack`), so nothing is lost if a run fails. Telegram keeps unconfirmed messages for 24 hours.

The site also hides expired posters and drafts at build time (Riyadh date). Tests: `node tests/bot_check.mjs` (the hourly job)
and `node tests/posters_bot_check.mjs` (the instant menu) run against a fake Telegram API and a fake GitHub.
