#!/usr/bin/env python3
"""Add the channels' new posts to data/telegram/<channel>.jsonl (what tools/telegram_lessons.py reads). Daily job step 1.

    python tools/tg_sync.py                 # read new posts of jabiri, jabrih and aljabri013, append them
    python tools/tg_sync.py --dry-run       # only print what is new

Read-only on Telegram: one history request per 100 posts, a pause between channels, and a FloodWait longer than
--flood-max seconds stops the run (exit 3) instead of waiting. Posts are appended once and never rewritten, so a lesson's
date, title and id never change after it is imported. Writes the ids it added to --out (JSON) for the daily report.
"""
import argparse, json, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tg_client import ROOT, CHANNEL_IDS, load_env, client, to_export  # noqa: E402

DATA = ROOT / "data" / "telegram"
CHANNELS = ["jabiri", "jabrih", "aljabri013"]


def read_jsonl(ch):
    f = DATA / f"{ch}.jsonl"
    if not f.exists(): sys.exit(f"{f} is missing")
    with open(f, encoding="utf-8") as fh:
        rows = [json.loads(ln) for ln in fh if ln.strip()]
    return rows[0], rows[1:]


def append(ch, msgs):
    with open(DATA / f"{ch}.jsonl", "a", encoding="utf-8") as fh:
        for m in msgs: fh.write(json.dumps(m, ensure_ascii=False, separators=(",", ":")) + "\n")


def forward_name(c, msg, cache):
    """The name Telegram Desktop shows for a forwarded post's origin (the importer flags posts not from the Sheikh's channels)."""
    f = msg.fwd_from
    if f.from_name: return f.from_name
    peer = f.from_id
    if peer is None: return None
    key = repr(peer)
    if key not in cache:
        try:
            e = c.get_entity(peer)
            cache[key] = getattr(e, "title", None) or " ".join(filter(None, [getattr(e, "first_name", ""), getattr(e, "last_name", "")])) or None
        except Exception:
            cache[key] = None           # private origin: no name, like Desktop's null
    return cache[key]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--max-posts", type=int, default=500, help="per channel and run (a bigger jump means something is wrong)")
    ap.add_argument("--flood-max", type=int, default=120, help="sit out a Telegram FloodWait up to this many seconds, else stop")
    ap.add_argument("--pause", type=float, default=3.0, help="seconds between channels")
    ap.add_argument("--out", help="write {channel: [new post ids]} here")
    a = ap.parse_args(argv)
    load_env()
    from telethon.errors import FloodWaitError
    c = client(flood_max=a.flood_max, interactive=False)
    added, cache = {}, {}
    try:
        for i, ch in enumerate(CHANNELS):
            if i: time.sleep(a.pause)
            head, msgs = read_jsonl(ch)
            last = max((m["id"] for m in msgs), default=0)
            entity = c.get_entity(ch)
            new = []
            for msg in c.iter_messages(entity, min_id=last, reverse=True, limit=a.max_posts + 1):
                new.append(to_export(msg, head.get("name") or entity.title, CHANNEL_IDS.get(ch, entity.id),
                                     forward_name(c, msg, cache) if msg.fwd_from else None))
            if len(new) > a.max_posts:
                sys.exit(f"{ch}: more than {a.max_posts} new posts since {last}; not adding them (raise --max-posts if this is real)")
            new = [m for m in new if m["id"] > last]
            added[ch] = [m["id"] for m in new]
            print(f"{ch}: {len(new)} new posts after {last}", file=sys.stderr)
            if new and not a.dry_run: append(ch, new)
    except FloodWaitError as e:
        print(f"Telegram asked to wait {e.seconds} s: stopping (nothing is lost; the next run continues)", file=sys.stderr)
        if a.out: Path(a.out).write_text(json.dumps({"added": added, "stopped": f"flood wait {e.seconds} s"}), encoding="utf-8")
        return 3
    finally:
        c.disconnect()
    if a.out: Path(a.out).write_text(json.dumps({"added": added}), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
