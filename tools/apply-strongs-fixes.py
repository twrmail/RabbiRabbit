#!/usr/bin/env python3
"""Apply (or check) the recorded corrections in tools/strongs-fixes.json.

    python3 tools/apply-strongs-fixes.py            # report only
    python3 tools/apply-strongs-fixes.py --write    # change library/lexicon and data/dict
    python3 tools/apply-strongs-fixes.py --check    # CI: exit 1 unless every fix is already applied

Each fix replaces ONE cross-reference number inside ONE entry. The change is made on the raw
file text (not by re-saving the JSON), so nothing else in the file moves by a single byte.
A fix is refused unless its 'find' occurs exactly expectedCount times in that entry.
The two copies (library/lexicon = the library, data/dict = what the live Worker reads) are
kept byte-identical.
"""
import json, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
TARGETS = ["library/lexicon", "data/dict"]
FILES = {"greek": "strongs_greek.json", "hebrew": "strongs_hebrew.json"}


def entry_span(raw, number):
    """(start, end) of the raw JSON string value for entry `number`, quotes excluded."""
    m = re.search(r'[{,]"' + re.escape(number) + r'":"((?:[^"\\]|\\.)*)"', raw)
    if not m:
        raise SystemExit(f"entry {number} not found")
    return m.start(1), m.end(1)


def token(find):
    return re.compile(r"(?<![0-9A-Za-z])" + re.escape(find) + r"(?!\d)")


def main():
    mode = "write" if "--write" in sys.argv else "check" if "--check" in sys.argv else "report"
    fixes = json.load(open(os.path.join(ROOT, "tools", "strongs-fixes.json"), encoding="utf-8"))["fixes"]
    pending = 0
    for folder in TARGETS:
        for lex, fname in FILES.items():
            p = os.path.join(ROOT, folder, fname)
            raw = open(p, encoding="utf-8").read()
            changed = 0
            for f in (x for x in fixes if x["lexicon"] == lex):
                s, e = entry_span(raw, f["number"])
                seg = raw[s:e]
                n_old = len(token(f["find"]).findall(seg))
                n_new = len(token(f["replace"]).findall(seg))
                if n_old == 0 and n_new >= 1:
                    continue                                    # already applied
                if n_old != f["expectedCount"]:
                    raise SystemExit(f"{folder}/{fname} #{f['number']}: expected {f['expectedCount']} x {f['find']}, found {n_old}")
                pending += 1
                if mode == "write":
                    raw = raw[:s] + token(f["find"]).sub(f["replace"], seg) + raw[e:]
                    changed += 1
            if changed:
                open(p, "w", encoding="utf-8").write(raw)
                print(f"{folder}/{fname}: {changed} fix(es) written")
    if mode == "check":
        print("CHECK OK: every recorded Strong's fix is applied." if not pending else f"CHECK FAILED: {pending} fix(es) not applied.")
        return 1 if pending else 0
    print(f"{'applied' if mode == 'write' else 'would apply'}: {pending} change(s) across {len(TARGETS)} copies")
    return 0


if __name__ == "__main__":
    sys.exit(main())
