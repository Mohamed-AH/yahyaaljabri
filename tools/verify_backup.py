#!/usr/bin/env python3
"""Check that every hosted audio file in site/data/media.json is in a storage copy (the live R2 bucket or the B2 backup).

    python tools/verify_backup.py --remote b2:my-bucket/media                # list the copy with rclone, compare keys + sizes
    python tools/verify_backup.py --remote b2:my-bucket/media --sample 20    # also download 20 random files and check their sha256
    python tools/verify_backup.py --listing listing.json                     # compare against a saved `rclone lsjson -R` output (tests)

Run by .github/workflows/backup.yml after each copy; any missing file, wrong size or wrong sha256 makes it exit 1, so the run fails
and GitHub emails the owner. Needs rclone on PATH for --remote (remotes are configured through RCLONE_CONFIG_* variables).
Prints only file keys and counts, never credentials."""
import argparse, hashlib, json, random, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "site" / "data" / "media.json"


def expected(manifest):
    """media.json -> {key: (size, sha256)}; several lessons can share one file."""
    out = {}
    for v in manifest.values():
        if isinstance(v, dict) and v.get("key"):
            out[v["key"]] = (int(v.get("size") or 0), v.get("sha256") or "")
    return out


def compare(want, listing):
    """want {key: (size, sha)}, listing = rclone lsjson -R entries -> (missing keys, [(key, want size, got size)])."""
    got = {e["Path"]: int(e.get("Size", -1)) for e in listing if not e.get("IsDir")}
    missing = sorted(k for k in want if k not in got)
    wrong = sorted((k, s, got[k]) for k, (s, _) in want.items() if k in got and s and got[k] != s)
    return missing, wrong


def rclone(*args, binary=False):
    r = subprocess.run(["rclone", *args], capture_output=True, check=False)
    if r.returncode:
        sys.exit(f"rclone {args[0]} failed: {r.stderr.decode(errors='replace')[-500:]}")
    return r.stdout if binary else r.stdout.decode()


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--remote", help="rclone path of the copy's root, e.g. b2:bucket/media (keys like audio/<hex>.m4a are under it)")
    src.add_argument("--listing", help="saved `rclone lsjson -R --files-only` output instead of listing a remote")
    ap.add_argument("--sample", type=int, default=0, help="download this many random files and check their sha256 (needs --remote)")
    ap.add_argument("--manifest", default=str(MANIFEST))
    a = ap.parse_args()

    want = expected(json.loads(Path(a.manifest).read_text(encoding="utf-8")))
    listing = json.loads(Path(a.listing).read_text(encoding="utf-8") if a.listing else rclone("lsjson", "-R", "--files-only", "--fast-list", a.remote))
    missing, wrong = compare(want, listing)
    where = a.remote or a.listing
    print(f"{where}: {len(want)} files expected, {len(listing)} listed, {len(missing)} missing, {len(wrong)} wrong size")
    for k in missing[:50]: print(f"  missing: {k}")
    for k, s, g in wrong[:50]: print(f"  wrong size: {k} (expected {s}, found {g})")

    bad = 0
    if a.sample and a.remote:
        present = sorted(k for k in want if k not in missing and want[k][1])
        for k in random.sample(present, min(a.sample, len(present))):
            h = hashlib.sha256(rclone("cat", f"{a.remote.rstrip('/')}/{k}", binary=True)).hexdigest()
            if h != want[k][1]:
                bad += 1; print(f"  wrong sha256: {k}")
        print(f"sha256 checked on {min(a.sample, len(present))} random files, {bad} wrong")

    if missing or wrong or bad:
        sys.exit(1)


if __name__ == "__main__":
    main()
