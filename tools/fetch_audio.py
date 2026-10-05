#!/usr/bin/env python3
r"""Download the lesson audio from Telegram, shrink it, and host it in our own Cloudflare R2 bucket. Run on YOUR machine.

    pip install -r tools/requirements-mirror.txt          (boto3 + telethon; ffmpeg must be installed too)
    .env (git-ignored) or environment variables:
        TG_API_ID, TG_API_HASH        from https://my.telegram.org -> API development tools (one-time)
        R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, MEDIA_BASE   (see docs/audio-hosting.md)

    python tools/fetch_audio.py --dry-run                 # what is still missing
    python tools/fetch_audio.py --max-gb 2                # a batch: stop after ~2 GB downloaded
    python tools/fetch_audio.py --max-gb 5 --commit-every 25   # also commit + push site/data/media.json as it goes
    python tools/fetch_audio.py --export ~/Downloads/Telegram\ Desktop/ChatExport_jabiri   # use files already exported by Telegram Desktop

For each lesson in site/data/library.json that has no audio of ours yet, newest first:
  1. get the file of its Telegram post (t.me/<channel>/<id>) - through your own Telegram account (Telethon, read-only, slow
     on purpose), or from a Telegram Desktop export folder with --export;
  2. convert it with ffmpeg to mono 48 kbps (HE-AAC if ffmpeg has libfdk_aac, else AAC), loudness-normalised (-16 LUFS);
  3. upload it to R2 under a content-addressed key (audio/<sha16>.m4a, cached forever);
  4. record  Telegram post -> our URL (+ size, duration) in site/data/media.json.
The build reads media.json: that lesson then plays on the site instead of linking to Telegram.
Resumable: media.json is saved after every file, so stop it any time (Ctrl+C) and run it again later.
Your Telegram login is kept in a local session file (.telegram.session, git-ignored). Credentials never go into the repo.
"""
import argparse, hashlib, json, os, re, shutil, subprocess, sys, tempfile, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIBRARY = ROOT / "site" / "data" / "library.json"
MANIFEST = ROOT / "site" / "data" / "media.json"
SESSION = ROOT / ".telegram"          # Telethon adds ".session"
POST = re.compile(r"^https://t\.me/([A-Za-z0-9_]{4,32})/(\d+)$")


def load_env():
    f = ROOT / ".env"
    if f.exists():
        for ln in f.read_text(encoding="utf-8").splitlines():
            if "=" in ln and not ln.lstrip().startswith("#"):
                k, v = ln.split("=", 1); os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def load_manifest():
    return json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}


def save(manifest):
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    tmp = MANIFEST.with_suffix(".tmp")
    tmp.write_text(json.dumps(dict(sorted(manifest.items())), ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(MANIFEST)


def todo_list(lib, manifest, series=None):
    out = [l for l in lib["lessons"] if l.get("kind") == "audio" and not l.get("src") and POST.match(l.get("tg", "")) and l["tg"] not in manifest]
    if series: out = [l for l in out if l["series"] in series]
    return sorted(out, key=lambda l: l.get("date", ""), reverse=True)     # newest first: what visitors open most


_FDK = None


def encoder_args():
    """HE-AAC (libfdk_aac, 22.05 kHz) when this ffmpeg has it - better speech at 48 kbps; otherwise ffmpeg's own AAC."""
    global _FDK
    if _FDK is None:
        enc = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True).stdout
        _FDK = "libfdk_aac" in enc
        print("encoder:", "libfdk_aac HE-AAC" if _FDK else "aac (LC)", file=sys.stderr)
    return ["-c:a", "libfdk_aac", "-profile:a", "aac_he", "-ar", "22050"] if _FDK else ["-c:a", "aac", "-ar", "44100"]


def convert(src, dst):
    """-> duration in seconds. Mono 48 kbps, silence at the start trimmed, -16 LUFS, moov atom first so playback starts
    before the download ends."""
    subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", src, "-vn", "-ac", "1",
                    "-af", "silenceremove=start_periods=1:start_duration=0:start_threshold=-50dB,loudnorm=I=-16:TP=-1.5:LRA=11",
                    *encoder_args(), "-b:a", "48k", "-movflags", "+faststart", dst], check=True)
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", dst],
                         check=True, capture_output=True, text=True).stdout.strip()
    return int(round(float(out)))


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1 << 20): h.update(chunk)
    return h.hexdigest()


class ExportSource:
    """Files from Telegram Desktop export folders (each has result.json + the exported files, i.e. exported WITHOUT the size limit)."""
    def __init__(self, folders):
        self.files = {}                                   # (channel numeric id, message id) -> file
        for d in folders:
            d = Path(d).expanduser()
            data = json.loads((d / "result.json").read_text(encoding="utf-8"))
            cid = str(data.get("id", ""))
            for m in data.get("messages", []):
                f = m.get("file")
                if f and not f.startswith("(") and (d / f).is_file():
                    self.files[(cid, m["id"])] = d / f
        print(f"export folder(s): {len(self.files)} files", file=sys.stderr)

    def fetch(self, channel, msg_id, dst):
        cid = CHANNEL_IDS.get(channel)
        p = self.files.get((cid, msg_id)) if cid else None
        if not p: raise LookupError("not in the export folder(s)")
        shutil.copyfile(p, dst)
        return os.path.getsize(dst)


CHANNEL_IDS = {"jabiri": "1003885025", "jabrih": "1241666669", "aljabri013": "1106476361"}   # @name -> the numeric id Telegram Desktop writes in result.json


class TelegramSource:
    """Your own Telegram account through Telethon. Read-only; pauses between files and obeys Telegram's flood waits."""
    def __init__(self, pause):
        need = [k for k in ("TG_API_ID", "TG_API_HASH") if not os.environ.get(k)]
        if need: sys.exit("missing " + ", ".join(need) + " (create them once at https://my.telegram.org -> API development tools)")
        from telethon.sync import TelegramClient
        self.client = TelegramClient(str(SESSION), int(os.environ["TG_API_ID"]), os.environ["TG_API_HASH"],
                                     flood_sleep_threshold=24 * 3600)   # always wait out FloodWait instead of failing
        self.client.start()            # first run: asks for your phone number and the login code Telegram sends you
        self.pause, self.last = pause, 0.0

    def fetch(self, channel, msg_id, dst):
        wait = self.pause - (time.monotonic() - self.last)
        if wait > 0: time.sleep(wait)
        msg = self.client.get_messages(channel, ids=msg_id)
        self.last = time.monotonic()
        if not msg or not msg.media: raise LookupError("post not found or has no file")
        got = self.client.download_media(msg, file=dst)   # Telethon may add an extension to the name
        self.last = time.monotonic()
        if not got: raise LookupError("download failed")
        if got != dst: shutil.move(got, dst)
        return os.path.getsize(dst)


def r2_client():
    need = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "MEDIA_BASE"]
    miss = [k for k in need if not os.environ.get(k)]
    if miss: sys.exit("missing environment variables: " + ", ".join(miss) + " (see docs/audio-hosting.md)")
    if not os.environ.get("R2_ENDPOINT") and not re.fullmatch(r"[0-9a-f]{32}", os.environ["R2_ACCOUNT_ID"]):
        sys.exit("R2_ACCOUNT_ID must be the 32-character Cloudflare account ID, not a token.")
    import boto3
    return boto3.client("s3", region_name="auto", aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"], aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
                        endpoint_url=os.environ.get("R2_ENDPOINT") or f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com")


def git_publish(n):
    subprocess.run(["git", "-C", str(ROOT), "add", str(MANIFEST)], check=True)
    if subprocess.run(["git", "-C", str(ROOT), "diff", "--cached", "--quiet"]).returncode == 0: return
    subprocess.run(["git", "-C", str(ROOT), "commit", "-q", "-m", f"Audio: {n} more lessons hosted"], check=True)
    subprocess.run(["git", "-C", str(ROOT), "pull", "-q", "--rebase", "--autostash"], check=True)
    subprocess.run(["git", "-C", str(ROOT), "push", "-q"], check=True)
    print(f"  pushed site/data/media.json ({n} new)", file=sys.stderr)


def main(argv=None, source=None, s3=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--max-gb", type=float, default=0, help="stop once this much has been downloaded (0 = no limit)")
    ap.add_argument("--limit", type=int, default=0, help="stop after N lessons")
    ap.add_argument("--series", nargs="*", help="only these series ids (e.g. riyad bukhari)")
    ap.add_argument("--export", nargs="*", help="Telegram Desktop export folder(s) to take files from instead of downloading")
    ap.add_argument("--pause", type=float, default=4.0, help="seconds between Telegram requests (default 4)")
    ap.add_argument("--commit-every", type=int, default=0, help="git commit + push media.json every N lessons")
    ap.add_argument("--keep-dir", help="also keep the converted files here (a local backup)")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    load_env()

    lib, manifest = json.loads(LIBRARY.read_text(encoding="utf-8")), load_manifest()
    todo = todo_list(lib, manifest, a.series)
    print(f"{len(todo)} lessons without our own audio; {len(manifest)} already hosted", file=sys.stderr)
    if a.dry_run:
        for l in todo[: a.limit or None]: print(f"  {l.get('date', ''):10}  {l['tg']:32}  {l['title'][:70]}")
        return 0
    if not todo: return 0
    if not shutil.which("ffmpeg"): sys.exit("ffmpeg is not installed (https://ffmpeg.org/download.html)")
    s3 = s3 or r2_client()
    source = source or (ExportSource(a.export) if a.export else TelegramSource(a.pause))
    bucket, base = os.environ.get("R2_BUCKET", ""), os.environ.get("MEDIA_BASE", "").rstrip("/")

    done, got, failed, since_commit = 0, 0, [], 0
    work = Path(tempfile.mkdtemp(prefix="fetch_audio_"))
    try:
        for i, l in enumerate(todo, 1):
            if a.limit and done >= a.limit: break
            if a.max_gb and got >= a.max_gb * 1e9: print(f"reached --max-gb {a.max_gb}", file=sys.stderr); break
            channel, msg_id = POST.match(l["tg"]).groups()
            raw, out = work / "in", work / "out.m4a"
            try:
                got += source.fetch(channel, int(msg_id), str(raw))
                secs = convert(str(raw), str(out))
                sha, size = sha256(out), out.stat().st_size
                key = f"audio/{sha[:16]}.m4a"
                s3.upload_file(str(out), bucket, key, ExtraArgs={"ContentType": "audio/mp4", "CacheControl": "public, max-age=31536000, immutable",
                                                                 "Metadata": {"source": l["tg"], "sha256": sha}})
                if a.keep_dir:
                    Path(a.keep_dir).mkdir(parents=True, exist_ok=True); shutil.copyfile(out, Path(a.keep_dir) / f"{l['id']}.m4a")
                manifest[l["tg"]] = {"url": f"{base}/{key}", "key": key, "sha256": sha, "size": size, "duration": secs}
                save(manifest); done += 1; since_commit += 1
                print(f"  [{i}/{len(todo)}] {raw.stat().st_size / 1e6:6.1f} -> {size / 1e6:5.1f} MB  {secs // 60:3d} min  {l['tg']}  {l['title'][:50]}", file=sys.stderr)
                if a.commit_every and since_commit >= a.commit_every: git_publish(since_commit); since_commit = 0
            except Exception as e:
                failed.append((l["tg"], f"{type(e).__name__}: {e}")); print(f"  FAILED {l['tg']}: {e}", file=sys.stderr)
            finally:
                for p in (raw, out):
                    if p.exists(): p.unlink()
    finally:
        shutil.rmtree(work, ignore_errors=True)
        if a.commit_every and since_commit: git_publish(since_commit)
    print(f"\nhosted {done} lessons ({got / 1e9:.2f} GB downloaded), failed {len(failed)}, total hosted {len(manifest)}"
          + ("" if a.commit_every else "  -> commit site/data/media.json"))
    for u, w in failed: print(f"   {u}  {w}")
    return 1 if failed else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:   # media.json is saved after every file: run again to continue
        sys.exit("\ninterrupted - everything hosted so far is in site/data/media.json; run again to continue")
