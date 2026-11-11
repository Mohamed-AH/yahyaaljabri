#!/usr/bin/env python3
"""Safety check and summary of the daily Telegram job (.github/workflows/telegram-sync.yml).

    python tools/tg_report.py check   BEFORE_LIBRARY.json [--max-new 30]
        after the import: stop (exit 1, reason in --reason-file) if an existing lesson changed or disappeared, or if more than
        --max-new lessons are new. Old lessons only change when a person changes data/ or the importer, and that goes
        through a commit someone reviews, never through the daily job.
    python tools/tg_report.py summary BEFORE_LIBRARY.json SYNC.json [--out FILE]
        after the audio step: what went live, what waits for its audio, and which new posts were held for review
        (no title, maybe another speaker: tools/import_telegram.py leaves those out until data/telegram_overrides.json says).
"""
import argparse, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIBRARY = ROOT / "site" / "data" / "library.json"
MEDIA = ROOT / "site" / "data" / "media.json"
LESSONS = ROOT / "data" / "telegram" / "lessons.json"
SITE = "https://yaljabri.com"


def load(p, default=None):
    p = Path(p)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default


def by_id(lib):
    return {l["id"]: l for l in lib["lessons"]}


def check(before, after, max_new):
    b, a = by_id(before), by_id(after)
    changed = [k for k in b if k in a and a[k] != b[k]]
    gone = [k for k in b if k not in a]
    new = [k for k in a if k not in b]
    problems = []
    if changed: problems.append(f"{len(changed)} existing lessons would change (e.g. {', '.join(changed[:5])})")
    if gone: problems.append(f"{len(gone)} existing lessons would disappear (e.g. {', '.join(gone[:5])})")
    if len(new) > max_new: problems.append(f"{len(new)} new lessons in one run (more than {max_new})")
    return new, problems


def held_posts(sync, lessons, lib_ids):
    """New audio posts that became a lesson the importer left out (flags), with the reason."""
    new_posts = {f"https://t.me/{ch}/{i}" for ch, ids in (sync.get("added") or {}).items() for i in ids}
    out = []
    for l in lessons or []:
        if l["id"] in lib_ids or not any(p in new_posts for p in l.get("posts", [])): continue
        out.append((l["id"], l.get("title") or "(no title)", ", ".join(l.get("flags") or []) or "left out", l["posts"][0]))
    return out


def summary(before, after, media, sync, lessons):
    b, a = by_id(before), by_id(after)
    new = [a[k] for k in a if k not in b]
    live = [l for l in new if l.get("tg") in media]
    wait = [l for l in new if l.get("tg") not in media]
    held = held_posts(sync, lessons, set(a))
    n_posts = sum(len(v) for v in (sync.get("added") or {}).values())
    lines = [f"Telegram sync: {n_posts} new posts, {len(live)} lessons live, {len(wait)} waiting for audio, {len(held)} held"]
    if sync.get("stopped"): lines.append(f"Stopped early: {sync['stopped']} (the next run continues)")
    for l in live: lines.append(f"+ {l['title']}  {SITE}/lesson/{l['id']}/")
    for l in wait: lines.append(f"… audio not hosted yet: {l['title']}  {l['tg']}")
    for i, t, why, post in held: lines.append(f"? held ({why}): {t}  {post}")
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("mode", choices=["check", "summary"])
    ap.add_argument("before")
    ap.add_argument("sync", nargs="?")
    ap.add_argument("--max-new", type=int, default=30)
    ap.add_argument("--reason-file")
    ap.add_argument("--out")
    a = ap.parse_args(argv)
    before, after = load(a.before), load(LIBRARY)
    if a.mode == "check":
        new, problems = check(before, after, a.max_new)
        if problems:
            msg = "Telegram sync stopped, nothing published: " + "; ".join(problems)
            print(msg, file=sys.stderr)
            if a.reason_file: Path(a.reason_file).write_text(msg, encoding="utf-8")
            return 1
        print(f"check ok: {len(new)} new lessons", file=sys.stderr)
        return 0
    text = summary(before, after, load(MEDIA, {}), load(a.sync, {}) if a.sync else {}, load(LESSONS, []))
    print(text)
    if a.out: Path(a.out).write_text(text + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
