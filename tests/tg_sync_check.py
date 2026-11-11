#!/usr/bin/env python3
"""Offline checks of the daily Telegram sync (no network, no login): pip install telethon, then
    python tests/tg_sync_check.py
1. Telethon posts become the same JSON as Telegram Desktop's export (text with links, audio, voice, AMR, video, photo, service).
2. Every real post's text in data/telegram/*.jsonl survives the round trip through Telegram's entity offsets.
3. tools/tg_sync.py appends only posts after the last one, records their ids, and refuses a suspiciously large jump.
4. tools/tg_report.py stops on a changed or vanished lesson and on too many new ones, and writes the summary.
5. Importing the channels as they were a few days ago and then with the newer posts leaves every older lesson unchanged.
"""
import copy, json, os, subprocess, sys, tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from telethon.tl import types as T  # noqa: E402
import tg_client, tg_sync, tg_report  # noqa: E402

ok = bad = 0
def check(name, cond, info=""):
    global ok, bad
    if cond: ok += 1
    else: bad += 1; print("  FAIL:", name, info)

def utf16len(s): return len(s.encode("utf-16-le")) // 2

def entities_from_export(text):
    """Desktop "text" list -> (plain text, Telethon entities) with UTF-16 offsets."""
    if isinstance(text, str): return text, []
    cls = {v: k for k, v in tg_client.ENTITY_TYPES.items()}
    out, ents, pos = [], [], 0
    for p in text:
        s = p if isinstance(p, str) else p["text"]
        if not isinstance(p, str):
            name = cls.get(p["type"])
            if name == "MessageEntityTextUrl": ents.append(T.MessageEntityTextUrl(pos, utf16len(s), p.get("href", "")))
            elif name == "MessageEntityMentionName": ents.append(T.MessageEntityMentionName(pos, utf16len(s), 1))
            elif name == "MessageEntityPre": ents.append(T.MessageEntityPre(pos, utf16len(s), ""))
            elif name == "MessageEntityCustomEmoji": ents.append(T.MessageEntityCustomEmoji(pos, utf16len(s), 1))
            elif name: ents.append(getattr(T, name)(pos, utf16len(s)))
        out.append(s); pos += utf16len(s)
    return "".join(out), ents

D = datetime(2026, 11, 8, 16, 44, 36, tzinfo=timezone.utc)
def doc(size, mime, attrs): return T.Document(id=1, access_hash=1, file_reference=b"", date=D, mime_type=mime, size=size, dc_id=1, attributes=attrs)
def msg(i, text="", ents=None, media=None, **kw): return T.Message(id=i, peer_id=T.PeerChannel(1), date=D, message=text, entities=ents, media=media, **kw)

# 1. message shapes
m = tg_client.to_export(msg(4856, media=T.MessageMediaDocument(document=doc(24143146, "audio/m4a", [
        T.DocumentAttributeAudio(duration=977, voice=False), T.DocumentAttributeFilename("درس_رقم_١٢_الداء_والدواء.m4a")]))),
    "قناة", "1003885025")
check("audio post", m == {"id": 4856, "type": "message", "date": "2026-11-08T22:14:36", "date_unixtime": str(int(D.timestamp())), "from": "قناة",
      "from_id": "channel1003885025", "file": tg_client.NOT_INCLUDED, "file_name": "درس_رقم_١٢_الداء_والدواء.m4a", "file_size": 24143146,
      "media_type": "audio_file", "mime_type": "audio/m4a", "duration_seconds": 977, "text": ""}, m)
m = tg_client.to_export(msg(5, media=T.MessageMediaDocument(document=doc(9000, "audio/ogg", [T.DocumentAttributeAudio(duration=61, voice=True)]))))
check("voice note", m.get("media_type") == "voice_message" and m.get("duration_seconds") == 61 and "file_name" not in m, m)
m = tg_client.to_export(msg(6, media=T.MessageMediaDocument(document=doc(9000, "audio/amr", [T.DocumentAttributeFilename("a.amr")]))))
check("AMR file: no media_type, like Desktop", "media_type" not in m and m["mime_type"] == "audio/amr" and m["file"], m)
m = tg_client.to_export(msg(7, "السعادة", media=T.MessageMediaDocument(document=doc(9000, "video/mp4", [T.DocumentAttributeVideo(duration=245, w=640, h=360)]))))
check("video post", m.get("media_type") == "video_file" and m.get("duration_seconds") == 245 and m["text"] == "السعادة", m)
m = tg_client.to_export(msg(8, "إعلان", media=T.MessageMediaPhoto(photo=T.Photo(id=1, access_hash=1, file_reference=b"", date=D, sizes=[], dc_id=1))))
check("photo post: no 'file'", m.get("photo") and "file" not in m, m)
m = tg_client.to_export(msg(11, media=T.MessageMediaDocument(document=doc(9, "image/webp", [T.DocumentAttributeSticker(alt="🎙", stickerset=T.InputStickerSetEmpty())]))))
check("sticker is not audio", m.get("media_type") == "sticker", m)
m = tg_client.to_export(msg(12, media=T.MessageMediaDocument(document=doc(9, "audio/ogg", [T.DocumentAttributeAudio(duration=8590, title="شرح كتاب التوحيد")]))))
check("audio title without performer", m.get("title") == "شرح كتاب التوحيد" and m.get("performer") == "<unknown>", m)
m = tg_client.to_export(T.MessageService(id=9, peer_id=T.PeerChannel(1), date=D, action=T.MessageActionPinMessage()))
check("service post", m["type"] == "service", m)
m = tg_client.to_export(msg(10, "x", fwd_from=T.MessageFwdHeader(date=D, from_name="يحي بن أحمد الجابري"), reply_to=T.MessageReplyHeader(reply_to_msg_id=4)),
                        fwd_name="يحي بن أحمد الجابري")
check("forward + reply", m.get("forwarded_from") == "يحي بن أحمد الجابري" and m.get("reply_to_message_id") == 4, m)
t, e = "رابط 🎤 https://top4top.net/a.mp3 نهاية", None
off = utf16len("رابط 🎤 ")
e = [T.MessageEntityBold(0, utf16len(t)), T.MessageEntityUrl(off, utf16len("https://top4top.net/a.mp3"))]
x = tg_client.export_text(t, e)
check("a link inside bold stays a link", {"type": "link", "text": "https://top4top.net/a.mp3"} in x and "".join(p if isinstance(p, str) else p["text"] for p in x) == t, x)

# 2. real posts round-trip
n = 0
for ch in tg_sync.CHANNELS:
    head, msgs = tg_sync.read_jsonl(ch)
    for r in msgs:
        if r.get("type") != "message": continue
        text, ents = entities_from_export(r.get("text", ""))
        got, want = tg_client.export_text(text, ents), r.get("text", "")
        # what the importer reads: the text and each part's type/text/href (Desktop's trailing "" is not always there)
        norm = lambda v: [p if isinstance(p, str) else {k: p[k] for k in ("type", "text", "href") if k in p} for p in (v[:-1] if len(v) > 1 and v[-1] == "" else v)] if isinstance(v, list) else v
        if norm(got) != norm(want): check(f"{ch}/{r['id']} text round trip", False, (r.get("text"), got)); break
        n += 1
check("real posts round-trip", n > 9000, n)

# 3. tg_sync with a fake Telegram
class Fake:
    def __init__(self, posts): self.posts = posts
    def get_entity(self, ch): return T.Channel(id=1, title=ch, photo=T.ChatPhotoEmpty(), date=D, access_hash=1)
    def iter_messages(self, entity, min_id=0, reverse=True, limit=None):
        return [p for p in self.posts.get(entity.title, []) if p.id > min_id][:limit]
    def disconnect(self): pass
with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    for ch in tg_sync.CHANNELS:
        (tmp / f"{ch}.jsonl").write_text(json.dumps({"channel": ch, "name": ch}) + "\n" + json.dumps({"id": 100, "type": "message", "date": "x", "date_unixtime": "1", "text": ""}) + "\n", encoding="utf-8")
    tg_sync.DATA = tmp
    fake = Fake({"jabiri": [msg(99, "old"), msg(101, "new one"), msg(102, "", media=T.MessageMediaDocument(document=doc(5, "audio/m4a", [T.DocumentAttributeAudio(duration=3)])))]})
    tg_sync.client = lambda **kw: fake
    rc = tg_sync.main(["--out", str(tmp / "s.json"), "--pause", "0"])
    added = json.loads((tmp / "s.json").read_text())["added"]
    lines = (tmp / "jabiri.jsonl").read_text(encoding="utf-8").splitlines()
    check("sync appends only newer posts", rc == 0 and added == {"jabiri": [101, 102], "jabrih": [], "aljabri013": []} and len(lines) == 4, (rc, added, len(lines)))
    rc = tg_sync.main(["--out", str(tmp / "s.json"), "--pause", "0"])
    check("second run adds nothing", json.loads((tmp / "s.json").read_text())["added"]["jabiri"] == [], rc)
    fake.posts["jabrih"] = [msg(200 + i, "x") for i in range(10)]
    try: tg_sync.main(["--max-posts", "5", "--pause", "0"]); check("big jump refused", False)
    except SystemExit as ex: check("big jump refused", "more than 5" in str(ex) and len((tmp / "jabrih.jsonl").read_text().splitlines()) == 2, ex)

# 4. tg_report
lib = {"lessons": [{"id": "a", "title": "A", "tg": "https://t.me/jabiri/1"}, {"id": "b", "title": "B", "tg": "https://t.me/jabiri/2"}]}
new = copy.deepcopy(lib); new["lessons"].append({"id": "c", "title": "C", "tg": "https://t.me/jabiri/3"})
check("report: one new lesson ok", tg_report.check(lib, new, 30) == (["c"], []))
ch = copy.deepcopy(new); ch["lessons"][0]["title"] = "A2"
check("report: changed lesson stops", "would change" in " ".join(tg_report.check(lib, ch, 30)[1]))
check("report: vanished lesson stops", "disappear" in " ".join(tg_report.check(lib, {"lessons": new["lessons"][1:]}, 30)[1]))
check("report: too many new stops", "more than 0" in " ".join(tg_report.check(lib, new, 0)[1]))
s = tg_report.summary(lib, new, {"https://t.me/jabiri/3": {}}, {"added": {"jabiri": [3, 4]}},
                      [{"id": "jabiri-4", "title": "", "flags": ["no title"], "posts": ["https://t.me/jabiri/4"]}])
check("summary lists live and held", "1 lessons live" in s and "yaljabri.com/lesson/c/" in s and "held (no title)" in s and "t.me/jabiri/4" in s, s)

# 5. incremental import keeps old lessons as they were
with tempfile.TemporaryDirectory() as tmp:
    cut = {"jabiri": 4806, "jabrih": 6126}
    for ch in tg_sync.CHANNELS:
        rows = (ROOT / "data" / "telegram" / f"{ch}.jsonl").read_text(encoding="utf-8").splitlines()
        keep = [r for r in rows if "channel" in json.loads(r) or json.loads(r)["id"] < cut.get(ch, 10 ** 9)]
        Path(tmp, f"{ch}.jsonl").write_text("\n".join(keep) + "\n", encoding="utf-8")
    lib_file = ROOT / "site" / "data" / "library.json"
    saved = lib_file.read_bytes()
    try:
        env = {**os.environ, "TELEGRAM_EXPORTS": tmp}
        run = lambda e: [subprocess.run([sys.executable, str(ROOT / "tools" / f), *a], env=e, check=True, capture_output=True) for f, a in (("telegram_lessons.py", []), ("import_telegram.py", []))]
        run(env); old = json.loads(lib_file.read_text(encoding="utf-8"))
        run({k: v for k, v in os.environ.items() if k != "TELEGRAM_EXPORTS"}); full = json.loads(lib_file.read_text(encoding="utf-8"))
        new_ids, problems = tg_report.check(old, full, 30)
        check("older lessons unchanged when newer posts arrive", not problems and len(new_ids) == 16, (problems, len(new_ids)))
    finally:
        lib_file.write_bytes(saved)

print(f"{ok} passed, {bad} failed")
sys.exit(1 if bad else 0)
