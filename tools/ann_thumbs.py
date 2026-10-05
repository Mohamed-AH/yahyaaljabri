#!/usr/bin/env python3
"""Small WebP previews of the announcement posters (site/ann/<name> -> site/ann/thumb/<stem>.webp, 480 px wide) so the
home page does not download full posters. Runs after tools/announce_bot.mjs in the bot workflow; deletes previews of
removed posters. Needs Pillow (pip install pillow)."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ANN = ROOT / "site" / "ann"
THUMB = ANN / "thumb"


def main():
    THUMB.mkdir(parents=True, exist_ok=True)
    posters = {p.stem: p for p in ANN.iterdir() if p.is_file() and p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp")} if ANN.exists() else {}
    made = 0
    for stem, p in posters.items():
        out = THUMB / f"{stem}.webp"
        if out.exists():
            continue
        with Image.open(p) as im:
            im = im.convert("RGB")
            im.thumbnail((480, 10000))
            im.save(out, "WEBP", quality=80, method=6)
        made += 1
    for t in THUMB.glob("*.webp"):
        if t.stem not in posters:
            t.unlink()
    print(f"{made} preview(s) made, {len(posters)} poster(s)")


if __name__ == "__main__":
    main()
