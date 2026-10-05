# Hosting the audio ourselves

Until a lesson's file is hosted, its page links to the Telegram post. `tools/fetch_audio.py` fetches the files from Telegram, shrinks them and puts them in our own Cloudflare R2 bucket; after the next deploy those lessons play on the site.

Run it on your own computer whenever you have bandwidth. It is resumable: stop it any time (Ctrl+C) and run it again later. Nothing is downloaded twice.

## One-time setup

1. **Software:** Python 3.10+, ffmpeg (`brew install ffmpeg` / `apt install ffmpeg` / ffmpeg.org on Windows), then
   `pip install -r tools/requirements-mirror.txt` (boto3 + telethon). Optional but much faster downloads: `pip install cryptg` (Telethon then decrypts in C instead of Python).
2. **Telegram API key** (for your own account, free): log in at https://my.telegram.org, open *API development tools*, create an app (any name). Copy `api_id` and `api_hash`.
3. **R2 bucket:** Cloudflare dashboard, R2, *Create bucket* `yahyaaljabri-media`.
   - Public access: *Settings*, *Custom Domains*, connect e.g. `media.<site domain>` once the domain exists. Until then enable the *r2.dev* public URL and use that.
   - *Manage R2 API tokens*, *Create API token*, permission *Object Read & Write* on that bucket only. Copy the Access Key ID and Secret Access Key (the S3 pair, not a `cfat_`/`cfut_` token).
4. Put everything in a `.env` file in the repo root (git-ignored, never committed):

```
TG_API_ID=1234567
TG_API_HASH=0123456789abcdef0123456789abcdef
R2_ACCOUNT_ID=<32-character account id>
R2_ACCESS_KEY_ID=<access key id>
R2_SECRET_ACCESS_KEY=<secret access key>
R2_BUCKET=yahyaaljabri-media
MEDIA_BASE=https://media.example.com        # or the https://pub-….r2.dev URL
```

The first run asks for your phone number and the login code Telegram sends you. The login is kept in `.telegram.session` in the repo folder (git-ignored). Treat that file like a password.

## Running it

```
python tools/fetch_audio.py --dry-run                     # what is still missing (newest first)
python tools/fetch_audio.py --limit 3                     # try three lessons first, then open their pages after deploy
python tools/fetch_audio.py --max-gb 3                    # a batch: stop after about 3 GB downloaded
python tools/fetch_audio.py --max-gb 5 --commit-every 25  # also commit and push site/data/media.json as it goes
python tools/fetch_audio.py --series riyad bukhari        # only some series
```

Without `--commit-every`, commit `site/data/media.json` yourself afterwards. Every push deploys, and the new lessons start playing.

**If you already exported files with Telegram Desktop** (export without the size limit), use them instead of downloading again:
`python tools/fetch_audio.py --export "~/Downloads/Telegram Desktop/ChatExport_…"` (one or more folders, each with its `result.json`).

## Keeping the account safe

The script only reads public channel posts, one at a time, with a 4-second pause between requests (`--pause`). When Telegram asks it to wait (FloodWait), it waits instead of retrying. This is the same traffic as scrolling the channel in the app and saving files. Don't run several copies at once.

## What it does with each file

1. Download the original from the post (or copy it from the export folder).
2. ffmpeg: mono, 48 kbps (HE-AAC with `libfdk_aac` when your ffmpeg has it, else AAC), leading silence trimmed, loudness −16 LUFS, `faststart` so playback starts before the file finishes downloading. About 21 MB per hour of speech; about 40 GB for the whole library.
3. Upload to `audio/<first 16 hex of sha256>.m4a`, cached for a year (the name changes if the content does).
4. Record `Telegram post -> {url, size, duration}` in `site/data/media.json`.

The build reads `media.json`. The lesson then shows the player and a download button; the Telegram post link stays as a second button. The site's Content-Security-Policy allows audio only from the hosts in `media.json`.

## Re-doing a file
`python tools/fetch_audio.py --redo https://t.me/jabiri/4607 …` converts and uploads those lessons again and deletes the earlier copy in R2. Voice notes (low-bitrate Opus) are encoded at 24–32 kbps instead of 48 so they don't grow; files hosted before 2026-10-05 evening at 48 kbps can be redone this way.

## Moving the audio to the site's domain
Connect `media.yaljabri.com` to the bucket (R2, bucket, *Settings*, *Custom Domains*), set `MEDIA_BASE=https://media.yaljabri.com` in `.env`, then run `python tools/fetch_audio.py --relink` and commit `site/data/media.json`. Only the links change; the files stay where they are, and the r2.dev address can be switched off afterwards.
