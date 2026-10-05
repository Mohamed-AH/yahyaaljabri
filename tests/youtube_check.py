#!/usr/bin/env python3
"""ingest.py + build_catalogue.py against a fake YouTube Data API (no network, no key).   Usage: python tests/youtube_check.py

Checks: the channel is found by its id; a lesson naming the Sheikh lands in the matching video series with its number;
a video naming him only in the description is kept; another scholar's video, an unnamed one and a live stream are left out."""
import json, os, subprocess, sys, tempfile, threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent.parent
CID, UPLOADS = "UCxuTw0MBmEtEBFcsaPexdfg", "UUxuTw0MBmEtEBFcsaPexdfg"
V = lambda vid, title, desc="", dur="PT45M10S": {"id": vid, "snippet": {"title": title, "description": desc, "publishedAt": "2026-10-01T18:00:00Z", "thumbnails": {}},
                                                 "contentDetails": {"duration": dur}}
VIDEOS = [
    V("aaaaaaaaaa1", "شرح كتاب التوحيد الدرس 12 لفضيلة الشيخ يحيى بن أحمد الجابري"),
    V("aaaaaaaaaa2", "خطبة الجمعة: وجوب أداء الأمانة", "لفضيلة الشيخ الوالد يحيى بن أحمد الجابري حفظه الله"),
    V("aaaaaaaaaa3", "شرح الأصول الثلاثة للشيخ عبيد الجابري رحمه الله"),
    V("aaaaaaaaaa4", "مقطع قصير"),
    V("aaaaaaaaaa5", "بث مباشر: درس الشيخ يحيى الجابري", dur="P0D"),
]
asked = []


class API(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def do_GET(self):
        u = urlparse(self.path); q = {k: v[0] for k, v in parse_qs(u.query).items()}; ep = u.path.rsplit("/", 1)[-1]
        asked.append((ep, q))
        if ep == "channels":
            body = {"items": [{"id": CID, "snippet": {"title": "قناة الشيخ"}, "contentDetails": {"relatedPlaylists": {"uploads": UPLOADS}}}]} if q.get("id") == CID else {"items": []}
        elif ep == "playlistItems":
            body = {"items": [{"contentDetails": {"videoId": v["id"]}} for v in VIDEOS]}
        elif ep == "videos":
            ids = q["id"].split(","); body = {"items": [v for v in VIDEOS if v["id"] in ids]}
        else:
            self.send_response(404); self.end_headers(); return
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(200); self.send_header("content-type", "application/json"); self.end_headers(); self.wfile.write(data)


def main():
    srv = HTTPServer(("127.0.0.1", 0), API); threading.Thread(target=srv.serve_forever, daemon=True).start()
    tmp = Path(tempfile.mkdtemp())
    env = {**os.environ, "YOUTUBE_API_KEY": "test", "YOUTUBE_API_BASE": f"http://127.0.0.1:{srv.server_port}", "VIDEOS_DB": str(tmp / "v.db"),
           "PLAYLISTS_JSON": str(tmp / "pl.json"), "CATALOGUE_OUT": str(tmp / "catalogue.json"), "YOUTUBE_CHANNEL_HANDLE": ""}
    for cmd in (["ingest.py"], ["build_catalogue.py"]):
        r = subprocess.run([sys.executable, *cmd], cwd=ROOT, env=env, capture_output=True, text=True)
        if r.returncode: print(r.stdout, r.stderr); return 1
    cat = json.loads((tmp / "catalogue.json").read_text(encoding="utf-8"))
    L = {l["id"]: l for l in cat["lessons"]}
    ok = bad = 0
    def t(name, cond, info=""):
        nonlocal ok, bad
        if cond: ok += 1
        else: bad += 1; print("  FAIL:", name, info)
    t("channel looked up by id", any(ep == "channels" and q.get("id") == CID for ep, q in asked), asked[:1])
    t("Sheikh's lesson in the video series with its number", L.get("aaaaaaaaaa1", {}).get("series") == "v-tawhid" and L["aaaaaaaaaa1"].get("n") == 12, L.get("aaaaaaaaaa1"))
    t("named in the description only: kept, as a khutbah", L.get("aaaaaaaaaa2", {}).get("series") == "v-khutab", L.get("aaaaaaaaaa2"))
    t("another scholar left out", "aaaaaaaaaa3" not in L)
    t("unnamed video left out", "aaaaaaaaaa4" not in L)
    t("live stream left out", "aaaaaaaaaa5" not in L)
    t("series are in the video section", all(s["sec"] == "duroos" for s in cat["series"]), cat["series"])
    t("title without the speaker suffix", L.get("aaaaaaaaaa1", {}).get("title") == "شرح كتاب التوحيد الدرس 12", L.get("aaaaaaaaaa1"))
    srv.shutdown()
    print(f"{ok} passed, {bad} failed")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
