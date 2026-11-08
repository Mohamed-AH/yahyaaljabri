#!/usr/bin/env python3
"""tools/verify_backup.py against a fake rclone (no network, no keys).   Usage: python tests/backup_check.py

Checks: a complete copy passes; a missing file, a wrong size and a wrong sha256 each fail with exit 1; lessons sharing one file count once."""
import hashlib, json, os, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FAKE = r'''#!/usr/bin/env python3
import json, os, sys
d = os.environ["FAKE_STORE"]
if sys.argv[1] == "lsjson":
    print(json.dumps([{"Path": f"audio/{n}", "Size": os.path.getsize(os.path.join(d, n)), "IsDir": False} for n in sorted(os.listdir(d))]))
elif sys.argv[1] == "cat":
    sys.stdout.buffer.write(open(os.path.join(d, os.path.basename(sys.argv[2])), "rb").read())
else:
    sys.exit(2)
'''
fails = 0


def t(name, ok):
    global fails
    print(("ok   " if ok else "FAIL ") + name)
    fails += not ok


with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp); store = tmp / "store"; store.mkdir(); bindir = tmp / "bin"; bindir.mkdir()
    (bindir / "rclone").write_text(FAKE); (bindir / "rclone").chmod(0o755)
    files = {f"{i:016x}.m4a": os.urandom(1000 + i) for i in range(5)}
    manifest = {}
    for i, (n, b) in enumerate(files.items()):
        (store / n).write_bytes(b)
        manifest[f"https://t.me/jabiri/{i}"] = {"url": f"https://media.yaljabri.com/audio/{n}", "key": f"audio/{n}", "sha256": hashlib.sha256(b).hexdigest(), "size": len(b)}
    manifest["https://t.me/jabrih/99"] = dict(manifest["https://t.me/jabiri/0"])      # two posts, one file
    mf = tmp / "media.json"; mf.write_text(json.dumps(manifest))
    env = {**os.environ, "PATH": f"{bindir}{os.pathsep}{os.environ['PATH']}", "FAKE_STORE": str(store)}

    def run(*extra):
        r = subprocess.run([sys.executable, str(ROOT / "tools" / "verify_backup.py"), "--manifest", str(mf), "--remote", "b2:x/media", *extra],
                           capture_output=True, text=True, env=env)
        return r.returncode, r.stdout + r.stderr

    code, out = run("--sample", "10")
    t("complete copy passes", code == 0 and "5 files expected" in out and "0 missing" in out and "5 random files, 0 wrong" in out)

    names = list(files)
    (store / names[1]).write_bytes(files[names[1]][:-1])                               # wrong size
    code, out = run()
    t("wrong size fails", code == 1 and f"wrong size: audio/{names[1]}" in out)
    (store / names[1]).write_bytes(files[names[1]])

    b = bytearray(files[names[2]]); b[0] ^= 1; (store / names[2]).write_bytes(bytes(b))  # same size, different content
    code, out = run()
    t("size check alone misses changed content", code == 0)
    code, out = run("--sample", "10")
    t("wrong sha256 fails", code == 1 and f"wrong sha256: audio/{names[2]}" in out)
    (store / names[2]).write_bytes(files[names[2]])

    (store / names[3]).unlink()                                                         # missing
    code, out = run("--sample", "10")
    t("missing file fails", code == 1 and f"missing: audio/{names[3]}" in out and "4 random files, 0 wrong" in out)

    listing = tmp / "listing.json"; listing.write_text(json.dumps([{"Path": f"audio/{n}", "Size": len(b)} for n, b in files.items()]))
    r = subprocess.run([sys.executable, str(ROOT / "tools" / "verify_backup.py"), "--manifest", str(mf), "--listing", str(listing)], capture_output=True, text=True)
    t("--listing works without rclone", r.returncode == 0 and "0 missing" in r.stdout)

    real = json.loads((ROOT / "site" / "data" / "media.json").read_text(encoding="utf-8"))
    t("real media.json: every entry has key, size and sha256", all(v.get("key", "").startswith("audio/") and v.get("size") and len(v.get("sha256", "")) == 64 for v in real.values()))

sys.exit(1 if fails else 0)
