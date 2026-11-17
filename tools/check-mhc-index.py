#!/usr/bin/env python3
"""Drift gate for the Matthew Henry verse index.

Rebuilds the index from the committed commentary with the committed builder and
fails if any book differs from what is checked in. This catches three kinds of
silent rot that the runtime textSha256 guard cannot see at build time:
  * the index was hand-edited away from what the builder produces,
  * the MHC commentary text changed without the index being rebuilt,
  * the builder changed without the index being regenerated.

Read-only: it builds in memory and compares, writing nothing. Exit 0 = in sync,
exit 1 = drift (the offending books and a few differing verses are printed).

    python3 tools/check-mhc-index.py
"""
import json, os, sys, glob, importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
IDX  = os.path.join(HERE, "..", "library", "commentary-index", "MHC")

# load the builder module (hyphenated filename -> importlib)
spec = importlib.util.spec_from_file_location("mhcbuild", os.path.join(HERE, "build-mhc-index.py"))
mhc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mhc)

def main():
    books = [os.path.basename(f)[:-5] for f in sorted(glob.glob(f"{IDX}/*.json"))]
    if not books:
        print("no committed MHC index found", file=sys.stderr); return 1
    drift = []
    for b in books:
        committed = json.load(open(f"{IDX}/{b}.json", encoding="utf-8"))
        rebuilt   = mhc.build_book(b)
        if committed == rebuilt:
            continue
        # pinpoint a few differing verses for the message
        diffs = []
        cc = {c["chapter"]: c for c in committed["chapters"]}
        rc = {c["chapter"]: c for c in rebuilt["chapters"]}
        for ch in sorted(set(cc) | set(rc)):
            cv = cc.get(ch, {}).get("verses", {})
            rv = rc.get(ch, {}).get("verses", {})
            if cc.get(ch, {}).get("textSha256") != rc.get(ch, {}).get("textSha256"):
                diffs.append(f"ch {ch}: commentary text changed (sha mismatch)")
            for v in sorted(set(cv) | set(rv), key=lambda x: int(x)):
                if cv.get(v) != rv.get(v):
                    diffs.append(f"ch {ch}:{v} committed={cv.get(v)} rebuilt={rv.get(v)}")
                if len(diffs) >= 5:
                    break
            if len(diffs) >= 5:
                break
        drift.append((b, diffs))
    if drift:
        print(f"MHC index DRIFT in {len(drift)}/{len(books)} book(s):")
        for b, diffs in drift:
            print(f"  {b}:")
            for d in diffs:
                print(f"    {d}")
        print("\nRebuild with:  python3 tools/build-mhc-index.py")
        return 1
    print(f"MHC index in sync: {len(books)} books reproduce exactly from the builder.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
