# Backups

The site's code and data are in this GitHub repo. The one thing that can't be rebuilt cheaply is the hosted audio (about 40 GB in the
R2 bucket `yahyaaljabri-media`; re-making it means downloading ~128 GB from Telegram again). So once a week
`.github/workflows/backup.yml` copies that bucket to a **Backblaze B2** bucket outside Cloudflare and checks the copy.

What each run does:
1. `rclone copy` R2 → `b2:<bucket>/media/` (only new files; it never deletes anything in B2).
2. A git bundle of this repo (all branches and history) → `b2:<bucket>/git/yahyaaljabri.bundle`.
3. `tools/verify_backup.py`: every file in `site/data/media.json` is in B2 with the right size, and 20 random files match their sha256.
4. The same presence check on the live R2 bucket, so a file missing from the site shows up too.

A failed check fails the run and GitHub emails you. Started every Sunday 04:13 Riyadh by GitHub's schedule and by the Worker's timer
(`JOBS` in `worker/index.js`); the *Run workflow* button runs it by hand. Cost: about $0.20 a month (B2: first 10 GB free, then
$6.95 per TB a month, no minimum; downloads free up to 3× what is stored). Offline test: `python tests/backup_check.py`.

## One-time setup

1. **B2 bucket** (backblaze.com, done 2026-11-05): private, encryption on, Lifecycle Settings *Keep prior versions for 90 days*.
   Application key limited to that bucket, Read and Write. Caps & Alerts: storage cap above 40 GB.
2. **R2 read-only token:** Cloudflare, R2, *Manage R2 API tokens*, *Create API token*: permission **Object Read only**, bucket
   `yahyaaljabri-media` only. Copy the Access Key ID and Secret Access Key (the S3 pair).
3. **GitHub** (repo Settings, Secrets and variables, Actions):
   - Secrets: `B2_KEY_ID` (B2 keyID), `B2_APP_KEY` (B2 applicationKey), `R2_ACCOUNT_ID` (32-character Cloudflare account id),
     `R2_BACKUP_ACCESS_KEY_ID`, `R2_BACKUP_SECRET_ACCESS_KEY` (the read-only pair from step 2).
   - Variable (Variables tab): `B2_BUCKET` = the B2 bucket name.
4. Actions, **Backup**, *Run workflow*. The first run copies everything (roughly half an hour to two hours); check its summary.
5. Keep all of these keys in a password manager too.

## Restoring

Set up rclone on any computer with the same two remotes (`rclone config`, or the `RCLONE_CONFIG_*` variables at the top of
`backup.yml`; for restoring into R2 the token needs *Object Read & Write*).

| What happened | Do this |
| --- | --- |
| Some lessons don't play | `python tools/verify_backup.py --remote r2:yahyaaljabri-media` lists the missing keys; copy each back: `rclone copyto b2:<bucket>/media/<key> r2:yahyaaljabri-media/<key>` (keys look like `audio/<hex>.m4a`) |
| Whole bucket lost | Create the bucket again (same name), `rclone copy b2:<bucket>/media r2:yahyaaljabri-media`, reconnect `media.yaljabri.com` under the bucket's Custom Domains |
| A file was overwritten or deleted in B2 | B2, Browse Files, *Show hidden/previous versions*: older versions stay 90 days |
| GitHub repo lost | `rclone copy b2:<bucket>/git/yahyaaljabri.bundle .` then `git clone yahyaaljabri.bundle yahyaaljabri`, push to a new repo, reconnect Cloudflare Workers Builds, add the secrets again |
| Cloudflare account lost for good | Serve `dist/` from any static host; make the B2 bucket (or a copy) public and run `MEDIA_BASE=<its public URL>/media python tools/fetch_audio.py --relink`, then rebuild. Download buttons (`/dl/`) need the Worker and won't work there |
| Bad deploy | Cloudflare, Workers, yahyaaljabri, Deployments: roll back; then `git revert` |

Twice a year, try one restore: `rclone copyto` a random file from B2 to your computer and play it.
