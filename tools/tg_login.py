#!/usr/bin/env python3
"""One-time: log in to Telegram and print the login as one line (a Telethon StringSession) for the GitHub secret TG_SESSION.

    TG_API_ID=... TG_API_HASH=... python tools/tg_login.py

Use the reading-only account made for the daily job (docs/telegram-sync.md). It asks for the phone number, the code Telegram
sends to that account, and its cloud password if it has one. The printed line IS the login: paste it only into
GitHub > Settings > Secrets and variables > Actions > TG_SESSION, never anywhere else. To cancel it later: Telegram on
that account > Settings > Devices > end the session.
"""
import os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tg_client import load_env  # noqa: E402


def main():
    load_env()
    need = [k for k in ("TG_API_ID", "TG_API_HASH") if not os.environ.get(k)]
    if need: sys.exit("set " + " and ".join(need) + " first (https://my.telegram.org -> API development tools)")
    from telethon.sync import TelegramClient
    from telethon.sessions import StringSession
    with TelegramClient(StringSession(), int(os.environ["TG_API_ID"]), os.environ["TG_API_HASH"]) as c:
        me = c.get_me()
        print(f"\nLogged in as {me.first_name or ''} (id {me.id}). The line below is the TG_SESSION secret:\n", file=sys.stderr)
        print(c.session.save())


if __name__ == "__main__":
    main()
