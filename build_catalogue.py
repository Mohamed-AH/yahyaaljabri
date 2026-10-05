#!/usr/bin/env python3
"""Build site/catalogue.json from videos.db (the Sheikh's YouTube channel).

Series come from the title, with the same patterns as the Telegram audio (tools/telegram_lessons.py SERIES), so a video
of «شرح كتاب التوحيد» lands in the video series «شرح كتاب التوحيد» (id "v-tawhid", section «الدروس المرئية»).
Values set manually in videos.db (series, subject, lesson_number, title_ar) always win.

Included: CONFIRMED / MANUAL_APPROVED, plus REVIEW videos whose title or description names the Sheikh.
Never included: MANUAL_REJECTED / REJECTED / REMOVED, and videos whose title names another scholar but not the Sheikh.
"""
import json, os, re, sqlite3, sys
from datetime import date, datetime, timedelta
from pathlib import Path

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE / "tools"))
from telegram_lessons import SERIES as AUDIO_SERIES, OTHER_SCHOLARS, clean as tg_clean, lesson_no  # noqa: E402

OUT = Path(os.environ.get("CATALOGUE_OUT") or BASE / "site" / "catalogue.json")
PLAYLISTS = Path(os.environ.get("PLAYLISTS_JSON") or BASE / "data" / "playlists.json")   # written by ingest.py
CHANNEL = "https://www.youtube.com/channel/UCxuTw0MBmEtEBFcsaPexdfg"

AR_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
NAME = re.compile(r"يح[يى]ى?\s*(?:بن\s*[أا]حمد\s*)?(?:بن\s*سلمان\s*)?الجابري")
OTHERS = [o for o in OTHER_SCHOLARS if o not in ("البخاري حفظه",)] + ["عبيد الجابري"]

# (series id, title, subject, description, matcher on the title) - the audio library's series, as video series
SUBJECT = {"tafsir": "التفسير", "hadith": "الحديث", "aqeedah": "العقيدة", "fiqh": "الفقه", "khutab": "الخطب",
           "lectures": "المحاضرات", "tilawa": "التلاوات"}
SERIES = [("v-" + sid, title, SUBJECT.get(sec, "عام"), "", re.compile(rx)) for sid, title, sec, rx in AUDIO_SERIES]
SECTION_OF = {}            # every video series lives in «الدروس المرئية» ("duroos")
MISC = ("v-misc", "محاضرات وكلمات مرئية", "المحاضرات", "")


def norm(s):
    s = re.sub(r"[ً-ٰٟـ]", "", s or "")
    return s.translate(str.maketrans("أإآىةی", "ااايهي"))


def num(s):
    return int(s.translate(AR_DIGITS))


def number_of(t):
    m = re.search(r"(?:المجلس|الدرس|الحلقة)\s*(?:رقم)?\s*[(\[]?\s*([0-9٠-٩]+)", t)
    return num(m.group(1)) if m else lesson_no(t)


def section_of(sid, t):
    return None


def clean(t):
    t = re.sub(r"\s*(?:[-–|]\s*)?(?:ل?فضيلة|للشيخ|لشيخنا|بتحقيق|الشيخ\b|للعلامة|للدكتور|أ\.\s*د\b).*$", "", t).strip(" -–|/")
    t = re.sub(r"\s+", " ", t)
    return t or None


def riyadh_date(ts):
    """YouTube gives UTC; the Sheikh teaches in Saudi Arabia (UTC+3), and the Hijri day follows local time."""
    if not ts: return ""
    return (datetime.strptime(ts[:19], "%Y-%m-%dT%H:%M:%S") + timedelta(hours=3)).date().isoformat()


def duration(iso):
    m = re.fullmatch(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso or "")
    if not m: return 0
    h, mi, s = (int(x or 0) for x in m.groups())
    return h * 3600 + mi * 60 + s


def playlist_series():
    """video id -> built-in series id, from the playlists that config.json maps to series (empty if not available)."""
    try:
        mapping = json.loads((BASE / "config.json").read_text(encoding="utf-8")).get("playlist_series") or {}
        members = json.loads(PLAYLISTS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    known = {s[0] for s in SERIES}
    out = {}
    for pid, sid in mapping.items():
        sid = sid if sid.startswith("v-") else "v-" + sid       # config may name the audio series id
        if sid in known:
            for vid in members.get(pid, []): out.setdefault(vid, sid)
    return out


def reviewed_conflicts():
    """Video ids whose title/playlist disagreement a person already looked at (config.json playlist_conflicts_reviewed): not reported again."""
    try:
        return set(json.loads((BASE / "config.json").read_text(encoding="utf-8")).get("playlist_conflicts_reviewed") or {})
    except (OSError, ValueError):
        return set()


def main():
    db = sqlite3.connect(os.environ.get("VIDEOS_DB") or BASE / "videos.db")
    db.row_factory = sqlite3.Row
    rows = db.execute("SELECT * FROM videos WHERE speaker_status NOT IN ('MANUAL_REJECTED', 'REJECTED', 'REMOVED') ORDER BY published_at DESC, youtube_id").fetchall()

    series_info = {s[0]: {"id": s[0], "title": s[1], "subject": s[2], "description": s[3]} for s in SERIES}
    series_info[MISC[0]] = {"id": MISC[0], "title": MISC[1], "subject": MISC[2], "description": MISC[3]}
    custom = {}
    lessons = []
    by_playlist, conflicts, reviewed = playlist_series(), [], reviewed_conflicts()
    for r in rows:
        if duration(r["duration_iso"]) == 0:   # live now / premiere not started: it appears on the next run, once it has a length
            continue
        title = (r["title_ar"] or "").strip() or r["title_original"]
        t = tg_clean(title)
        manual_ok = r["speaker_status"] == "MANUAL_APPROVED"
        named = NAME.search(tg_clean(r["title_original"])) or NAME.search(tg_clean(r["description_original"] or ""))
        other = any(o in r["title_original"] for o in OTHERS) and not NAME.search(tg_clean(r["title_original"]))
        if not manual_ok and (other or not (r["speaker_status"] == "CONFIRMED" or named)):
            continue
        sid = None
        manual = (r["series"] or "").strip()
        if manual:  # manual curation wins. A built-in series id or title joins that series; any other text makes a custom series.
            builtin = next((x[0] for x in SERIES if manual in (x[0], x[1])), None)
            if builtin: sid = builtin
            else:
                sid = custom.setdefault(manual, "c-%d" % (len(custom) + 1))
                series_info.setdefault(sid, {"id": sid, "title": manual, "subject": r["subject"] or "عام", "description": ""})
        else:
            for s in SERIES:
                if s[4].search(t) or s[4].search(t.replace(" ", "")):
                    sid = s[0]; break
        # Precedence: manual > title pattern > playlist > general lectures. A playlist only fills gaps; when it disagrees with
        # a title pattern nothing changes and the case is reported (set CATALOGUE_REPORT to a file to receive the list).
        pl = by_playlist.get(r["youtube_id"])
        if pl and not sid: sid = pl
        elif pl and sid != pl and not manual and r["youtube_id"] not in reviewed: conflicts.append({"id": r["youtube_id"], "title": title, "title_series": sid, "playlist_series": pl})
        sid = sid or MISC[0]
        n = r["lesson_number"] if r["lesson_number"] is not None else (number_of(title) if sid != MISC[0] else None)
        item = {
            "id": r["youtube_id"], "title": clean(title) or title,
            "series": sid, "subject": r["subject"] or series_info[sid]["subject"],
            "date": riyadh_date(r["published_at"]), "duration": duration(r["duration_iso"]),
        }
        if n is not None: item["n"] = n
        sec = section_of(sid, title)
        if sec: item["section"] = sec
        lessons.append(item)

    lessons.sort(key=lambda l: l["date"], reverse=True)
    used = {l["series"] for l in lessons}
    series = []
    for sid, info in series_info.items():
        if sid not in used: continue
        ls = [l for l in lessons if l["series"] == sid]
        info.update(sec=SECTION_OF.get(sid, "duroos"), count=len(ls), seconds=sum(l["duration"] for l in ls),
                    first=min(l["date"] for l in ls), last=max(l["date"] for l in ls))
        series.append(info)
    series.sort(key=lambda s: (s["id"] == MISC[0], -s["count"]))

    updated = date.today().isoformat()
    try:   # keep the old date when nothing changed, so the daily sync does not commit a no-op every day
        old = json.loads(OUT.read_text(encoding="utf-8"))
        if old.get("lessons") == lessons and old.get("series") == series: updated = old.get("updated", updated)
    except (OSError, ValueError): pass
    out = {"updated": updated, "channel": CHANNEL,
           "subjects": sorted({s["subject"] for s in series}), "series": series, "lessons": lessons}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(lessons)} lessons in {len(series)} series -> {OUT}")
    if os.environ.get("CATALOGUE_REPORT"):
        Path(os.environ["CATALOGUE_REPORT"]).write_text(json.dumps(conflicts, ensure_ascii=False), encoding="utf-8")
    if conflicts: print(f"  {len(conflicts)} videos where the title and the playlist name different series (nothing changed; see the sync report)")
    for s in series: print(f"  {s['count']:4}  {s['title']}")


if __name__ == "__main__":
    main()
