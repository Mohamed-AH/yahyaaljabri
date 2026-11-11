"""Shared by tools/tg_sync.py, tools/tg_login.py and tools/fetch_audio.py: the Telegram login, and Telethon posts written in
the same shape as a Telegram Desktop JSON export (what tools/telegram_lessons.py reads).

Login, in this order:
  TG_SESSION    a Telethon StringSession (GitHub secret of the daily job; made once with tools/tg_login.py)
  .telegram.session   the file a local run of fetch_audio.py keeps in the repo folder (git-ignored)
plus TG_API_ID / TG_API_HASH (https://my.telegram.org -> API development tools). Nothing here is ever written to the repo.
"""
import os, sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SESSION_FILE = ROOT / ".telegram"          # Telethon adds ".session"
# The first exports (2026-10-04) were made on a PC set to UTC+5:30 and lesson dates come from that clock, so new posts
# are written on the same clock and old lesson dates never move (see CLAUDE.md, catch-up).
EXPORT_TZ = timezone(timedelta(hours=5, minutes=30))
NOT_INCLUDED = "(File not included. Change data exporting settings to download.)"
CHANNEL_IDS = {"jabiri": "1003885025", "jabrih": "1241666669", "aljabri013": "1106476361"}   # as Telegram Desktop writes them


def load_env():
    f = ROOT / ".env"
    if f.exists():
        for ln in f.read_text(encoding="utf-8").splitlines():
            if "=" in ln and not ln.lstrip().startswith("#"):
                k, v = ln.split("=", 1); os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def client(flood_max=None, interactive=True):
    """A connected, logged-in TelegramClient. flood_max: the longest FloodWait (s) to sit out silently; a longer one raises
    FloodWaitError (the daily job stops instead of waiting for hours). interactive=False: never ask for a phone number."""
    need = [k for k in ("TG_API_ID", "TG_API_HASH") if not os.environ.get(k)]
    if need: sys.exit("missing " + ", ".join(need) + " (create them once at https://my.telegram.org -> API development tools)")
    from telethon.sync import TelegramClient
    from telethon.sessions import StringSession
    s = os.environ.get("TG_SESSION", "").strip()
    c = TelegramClient(StringSession(s) if s else str(SESSION_FILE), int(os.environ["TG_API_ID"]), os.environ["TG_API_HASH"],
                       flood_sleep_threshold=24 * 3600 if flood_max is None else flood_max)
    if s or not interactive:
        c.connect()
        if not c.is_user_authorized():
            c.disconnect(); sys.exit("the Telegram login (TG_SESSION) is not valid any more: make a new one with tools/tg_login.py")
    else:
        c.start()                      # first run: asks for the phone number and the login code Telegram sends
    return c


def _local(dt):
    return dt.astimezone(EXPORT_TZ).replace(tzinfo=None).isoformat()


# Telethon entity class -> the "type" Telegram Desktop writes
ENTITY_TYPES = {"MessageEntityUrl": "link", "MessageEntityTextUrl": "text_link", "MessageEntityHashtag": "hashtag",
                "MessageEntityMention": "mention", "MessageEntityMentionName": "mention_name", "MessageEntityBold": "bold",
                "MessageEntityItalic": "italic", "MessageEntityUnderline": "underline", "MessageEntityStrike": "strikethrough",
                "MessageEntityCode": "code", "MessageEntityPre": "pre", "MessageEntityEmail": "email", "MessageEntityPhone": "phone",
                "MessageEntityBotCommand": "bot_command", "MessageEntityCashtag": "cashtag", "MessageEntityBlockquote": "blockquote",
                "MessageEntitySpoiler": "spoiler", "MessageEntityCustomEmoji": "custom_emoji", "MessageEntityBankCard": "bank_card"}


def export_text(text, entities):
    """Desktop export "text": a plain string, or a list of plain strings and {"type", "text"[, "href"]} parts that join back to
    exactly the post's text. Links win over formatting when entities overlap (a bold link stays a link)."""
    text = text or ""
    if not entities: return text
    u = text.encode("utf-16-le")
    part = lambda a, b: u[2 * a:2 * b].decode("utf-16-le", errors="replace")   # Telegram offsets count UTF-16 code units
    n = len(u) // 2
    ranked = sorted(entities, key=lambda e: (type(e).__name__ not in ("MessageEntityUrl", "MessageEntityTextUrl"), e.offset))
    chosen = []
    for e in ranked:
        a, b = max(0, e.offset), min(n, e.offset + e.length)
        if a < b and all(b <= x or a >= y for x, y, _ in chosen): chosen.append((a, b, e))
    out, pos = [], 0
    for a, b, e in sorted(chosen, key=lambda t: t[0]):
        if a > pos: out.append(part(pos, a))
        d = {"type": ENTITY_TYPES.get(type(e).__name__, "unknown"), "text": part(a, b)}
        if getattr(e, "url", None) and d["type"] == "text_link": d["href"] = e.url
        if d["type"] == "custom_emoji": d["document_id"] = str(getattr(e, "document_id", "") or "")
        if d["type"] == "blockquote": d["collapsed"] = bool(getattr(e, "collapsed", False))
        out.append(d); pos = b
    if pos < n: out.append(part(pos, n))
    elif len(out) > 1: out.append("")          # Desktop ends a list that ends with a link with "" (not a lone link)
    return out


def to_export(msg, channel_title="", channel_id="", fwd_name=None):
    """One Telethon message -> one Telegram Desktop export message (only the fields the importer reads, plus a few for people)."""
    from telethon.tl.types import (DocumentAttributeAudio, DocumentAttributeVideo, DocumentAttributeFilename, DocumentAttributeSticker,
                                   DocumentAttributeAnimated, MessageService, PeerChannel, PeerUser)
    x = {"id": msg.id, "type": "service" if isinstance(msg, MessageService) else "message",
         "date": _local(msg.date), "date_unixtime": str(int(msg.date.timestamp()))}
    if x["type"] == "service":
        x["action"] = type(msg.action).__name__
        return x
    if channel_title: x["from"] = channel_title
    if channel_id: x["from_id"] = "channel" + str(channel_id)
    if msg.edit_date: x["edited"], x["edited_unixtime"] = _local(msg.edit_date), str(int(msg.edit_date.timestamp()))
    if msg.fwd_from:
        x["forwarded_from"] = fwd_name
        p = msg.fwd_from.from_id
        if isinstance(p, PeerChannel): x["forwarded_from_id"] = f"channel{p.channel_id}"
        elif isinstance(p, PeerUser): x["forwarded_from_id"] = f"user{p.user_id}"
    if msg.reply_to and getattr(msg.reply_to, "reply_to_msg_id", None): x["reply_to_message_id"] = msg.reply_to.reply_to_msg_id
    if msg.photo:
        x["photo"] = NOT_INCLUDED
    doc = msg.document
    if doc is not None:
        x["file"] = NOT_INCLUDED
        attrs = doc.attributes or []
        fn = next((a.file_name for a in attrs if isinstance(a, DocumentAttributeFilename)), None)
        if fn: x["file_name"] = fn
        x["file_size"] = doc.size
        aud = next((a for a in attrs if isinstance(a, DocumentAttributeAudio)), None)
        vid = next((a for a in attrs if isinstance(a, DocumentAttributeVideo)), None)
        stk = next((a for a in attrs if isinstance(a, DocumentAttributeSticker)), None)
        if stk is not None:
            x["media_type"] = "sticker"
            if stk.alt: x["sticker_emoji"] = stk.alt
        elif any(isinstance(a, DocumentAttributeAnimated) for a in attrs):
            x["media_type"] = "animation"
        elif aud is not None:
            x["media_type"] = "voice_message" if aud.voice else "audio_file"
            if aud.title: x["performer"], x["title"] = aud.performer or "<unknown>", aud.title
            elif aud.performer: x["performer"] = aud.performer
        elif vid is not None:
            x["media_type"] = "video_message" if vid.round_message else "video_file"
        x["mime_type"] = doc.mime_type
        dur = (aud or vid).duration if (aud or vid) is not None else None
        if dur: x["duration_seconds"] = int(dur)
    x["text"] = export_text(msg.message, msg.entities)
    return x
