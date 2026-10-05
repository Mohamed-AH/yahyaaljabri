# الموقع الرسمي لفضيلة الشيخ الوالد يحيى بن أحمد الجابري

An Arabic (right-to-left) static website that organises the lessons, khutab and lectures of الشيخ يحيى بن أحمد الجابري حفظه الله, built for his team. It is a fork of [drwasiullah](https://github.com/Mohamed-AH/drwasiullah): same engine, design, hosting and tests; different content source.

The Sheikh's material lives in two Telegram channels, [t.me/jabiri](https://t.me/jabiri) (official) and [t.me/jabrih](https://t.me/jabrih) (second), plus a [YouTube channel](https://www.youtube.com/channel/UCxuTw0MBmEtEBFcsaPexdfg). Today the site holds 1,875 audio lessons in 38 series, taken from both Telegram channels and de-duplicated.

## How it works

```
Telegram Desktop JSON exports ── tools/telegram_lessons.py ──► lessons.json (merged, de-duplicated, titled, grouped)
                                                                   │  data/telegram_overrides.json (manual fixes)
                                  tools/import_telegram.py ◄────────┘
                                          ▼
                               site/data/library.json ──► scripts/build.mjs ──► dist/ (~1,900 HTML pages) ──► Cloudflare
```

- **Export.** In Telegram Desktop: channel → ⋮ → Export chat history → Format: JSON. Media can be left out (or capped at a size): the JSON still lists every post with its file name, size and duration. Put the two exports in `telegram/jabiri/` and `telegram/jabrih/` (not committed).
- **Merge.** `python tools/telegram_lessons.py` collapses posts of the same file (size + duration) across the channels (jabiri, jabrih, and the Q&A channel aljabri013, where each question post is paired with the answer that follows it or the audio link inside it), merges a voice note and an m4a of the same lesson, takes each title from the caption, the file name, or the describing post before/after the audio (checked against the length stated in it), and assigns a series from the `SERIES` patterns at the top of the file. Lessons it cannot title, or that look like another speaker, are flagged.
- **Import.** `python tools/import_telegram.py` writes `site/data/library.json`, leaving out flagged lessons. Fix or approve one in `data/telegram_overrides.json`: `{"jabiri-1234": {"title": "…", "series": "riyad", "publish": true}}`.
- **Audio.** Until a lesson's audio is in our own storage, its page links to the Telegram post («استمع على تيليجرام»). `tools/fetch_audio.py` downloads the files through your own Telegram account (or takes them from a Telegram Desktop export), converts them to mono AAC 48 kbps and uploads them to R2, recording post -> URL in `site/data/media.json`; the build then shows the player. Setup and usage: [docs/audio-hosting.md](docs/audio-hosting.md).
- **Announcements.** Lesson posters («إعلانات الدروس») come from a Telegram bot the team sends them to; an hourly GitHub Action saves them and redeploys. See [docs/announcements.md](docs/announcements.md).

## Run it locally

```bash
node scripts/build.mjs && (cd dist && python3 -m http.server 8000)   # http://localhost:8000
```

Tests (Playwright + axe-core; `CHROMIUM=/path/to/chromium` to use an installed browser):

```bash
node tests/e2e.mjs http://localhost:8000 && node tests/xss_check.mjs http://localhost:8000 && node tests/a11y_check.mjs http://localhost:8000
node tests/bot_check.mjs   # the announcements bot against a fake Telegram API
# the docked player, with hosted audio faked for the Bukhari series:
MEDIA_JSON=tests/fixtures/media.json node scripts/build.mjs && node tests/player_check.mjs http://localhost:8000   # rebuild without MEDIA_JSON afterwards
```

## Still to do

- Domain (placeholder `SITE` in `site/js/core.js`), Cloudflare project, Search Console.
- Audio files: run `tools/fetch_audio.py` in batches (see docs/audio-hosting.md).
- YouTube lessons: `ingest.py` reads a channel *handle*; this channel is known by id (`config.json` → `channel_id`), so `ingest.py` needs a small change first. Needs a `YOUTUBE_API_KEY`.
- 64 recordings without any title and 19 possibly by other speakers are waiting for a person (`data/telegram_overrides.json`).
- Biography page: `site/data/bio.json` (format in `docs/bio-spec.md`).
