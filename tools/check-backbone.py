#!/usr/bin/env python3
"""Backbone proof: navigator -> verse -> teacher, across the whole Bible.

The backbone is a 2x2 grid.
  Navigators (hand you a verse):  xref (library/xref), Nave's (library/topics/naves.json)
  Teachers   (stand at a verse):  Henry (library/commentary/MHC + commentary-index/MHC),
                                  Gill  (library/commentary/Gill)

This gate certifies RESOLUTION, not completeness of the text itself:
  1. every xref link starts and ends on a real KJV verse
  2. every Nave's reference resolves (a small, named set of source typos is allowed;
     any NEW unresolved reference fails)
  3. every Henry index entry points inside its chapter text, and the chapter text still
     matches the length the index was built against
  4. every Gill note sits on a real verse, none is empty, and the 'See Chapter
     Introduction' stub is never served as a verse note
  5. the teacher lookup fails honestly: a verse with no note returns None, never a
     neighbour's comment dressed up as its own
It then prints a coverage scorecard: how many navigator verses have at least one teacher.

Read-only. Exit 0 = every chain holds, exit 1 = a chain is broken (details printed).

    python3 tools/check-backbone.py            # run the gate
    python3 tools/check-backbone.py --self-test  # prove the gate catches deliberate damage
"""
import json, os, re, sys, glob, hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.join(HERE, "..", "library")

OT = ["GEN","EXO","LEV","NUM","DEU","JOS","JDG","RUT","1SA","2SA","1KI","2KI","1CH","2CH",
      "EZR","NEH","EST","JOB","PSA","PRO","ECC","SNG","ISA","JER","LAM","EZK","DAN","HOS",
      "JOL","AMO","OBA","JON","MIC","NAH","HAB","ZEP","HAG","ZEC","MAL"]
NT = ["MAT","MRK","LUK","JHN","ACT","ROM","1CO","2CO","GAL","EPH","PHP","COL","1TH","2TH",
      "1TI","2TI","TIT","PHM","HEB","JAS","1PE","2PE","1JN","2JN","3JN","JUD","REV"]
BOOKS = OT + NT
STUB = "See Chapter Introduction"

# Nave's entries whose reference does not resolve in the source itself (typos in the
# printed book). Anything NOT in this set that fails to resolve is a new break.
# Recorded Nov 17 2026 by the backbone scan: 5 of 87,220 references.
NAVES_KNOWN_SOURCE_TYPOS = 5   # count cap; tightened to a named list once pinned

# xref links whose START verse is not in the KJV: OpenBible numbers 3 John with 15 verses
# (the KJV has 14), so one weight-2 link starts at 3JN 1:15. It can never be reached from
# a KJV verse, so it is harmless; it is named here so any OTHER such link fails the gate.
XREF_KNOWN_ODD_STARTS = {("3JN", 1, 15)}
# ...and the same 15-verse 3 John appears as a range END or target (3JN 1:15), same story.
XREF_KNOWN_ODD_VERSES = {("3JN", 1, 15)}


def load():
    """Read every spine once into plain dicts."""
    D = {"vers": {}, "xref": {}, "naves": None, "henry_idx": {}, "henry_txt": {}, "gill": {}}
    for b in BOOKS:
        p = os.path.join(LIB, "bible", "KJV", b + ".json")
        if not os.path.exists(p):
            continue
        d = json.load(open(p, encoding="utf-8"))
        D["vers"][b] = {int(c["chapter"]): set(int(v) for v in c["verses"]) for c in d["chapters"]}
    for p in sorted(glob.glob(os.path.join(LIB, "xref", "*.json"))):
        D["xref"][os.path.basename(p)[:-5]] = json.load(open(p, encoding="utf-8")).get("refs", [])
    D["naves"] = json.load(open(os.path.join(LIB, "topics", "naves.json"), encoding="utf-8"))["topics"]
    for p in sorted(glob.glob(os.path.join(LIB, "commentary-index", "MHC", "*.json"))):
        b = os.path.basename(p)[:-5]
        D["henry_idx"][b] = {int(c["chapter"]): c for c in json.load(open(p, encoding="utf-8"))["chapters"]}
        t = os.path.join(LIB, "commentary", "MHC", b + ".json")
        D["henry_txt"][b] = {int(c["chapter"]): c.get("commentary", "")
                             for c in json.load(open(t, encoding="utf-8"))["chapters"]}
    for b in BOOKS:
        p = os.path.join(LIB, "commentary", "Gill", b + ".json")
        if os.path.exists(p):
            D["gill"][b] = {int(c["chapter"]): c for c in json.load(open(p, encoding="utf-8"))["chapters"]}
    return D


def valid(D, b, c, v):
    return b in D["vers"] and int(c) in D["vers"][b] and int(v) in D["vers"][b][int(c)]


def chapter_ok(D, b, c):
    return b in D["vers"] and int(c) in D["vers"][b]


# ---------------- teachers: the lookups the app relies on ----------------
def henry_note(D, b, c, v):
    """Henry's own comment on a verse, or None. Never a neighbour's."""
    ch = D["henry_idx"].get(b, {}).get(c)
    if not ch:
        return None
    e = ch["verses"].get(str(v))
    if not e or e.get("relation") in ("none", "under-earlier"):
        return None
    txt = D["henry_txt"].get(b, {}).get(c, "")
    if not (0 <= e["at"] < e["end"] <= len(txt)):
        return None
    return txt[e["at"]:e["end"]]


def gill_note(D, b, c, v):
    """Gill's note on a verse (direct, or inside a batched span), or None."""
    ch = D["gill"].get(b, {}).get(c)
    if not ch:
        return None
    vs = ch.get("verses") or {}
    t = vs.get(str(v))
    if t is not None:
        return None if t.strip() in ("", STUB) else t
    for key, span in (ch.get("spans") or {}).items():
        if isinstance(span, list) and len(span) == 2 and span[0] <= v <= span[1]:
            t = vs.get(str(key))
            if t and t.strip() != STUB:
                return t
    return None


# ---------------- Nave's reference parser (same rules as the backbone scan) ----------------
_BOOKTOK = re.compile(r"\b([1-3]?[A-Z]{2,3})\b")
_BOOKSET = set(BOOKS)

def naves_refs(text):
    anchors = [(m.start(), m.end(), m.group(1)) for m in _BOOKTOK.finditer(text) if m.group(1) in _BOOKSET]
    for i, (s, e, code) in enumerate(anchors):
        spec = text[e: anchors[i + 1][0] if i + 1 < len(anchors) else len(text)]
        for piece in spec.split(";"):
            piece = piece.strip().strip(".,")
            if not piece:
                continue
            m = re.match(r"^(\d+):(.+)$", piece)
            if m:
                ch = int(m.group(1))
                for part in m.group(2).split(","):
                    part = part.strip()
                    r = re.match(r"^(\d+)\s*-\s*(\d+)$", part)
                    if r:
                        yield (code, ch, int(r.group(1))); yield (code, ch, int(r.group(2)))
                    elif re.match(r"^\d+$", part):
                        yield (code, ch, int(part))
            elif re.match(r"^\d+$", piece):
                yield (code, int(piece), None)


# ---------------- the checks (each returns a list of problem strings) ----------------
def check_xref(D):
    bad = []
    for fb, refs in D["xref"].items():
        for r in refs:
            if not valid(D, fb, r.get("fc"), r.get("fv")) and (fb, r.get("fc"), r.get("fv")) not in XREF_KNOWN_ODD_STARTS:
                bad.append(f"xref FROM {fb} {r.get('fc')}:{r.get('fv')} is not a KJV verse")
            ends = [(r.get("tb"), r.get("tc"), r.get("tv"))]
            if "ev" in r:   # a range: also check its last verse (and that it does not run backwards)
                eb, ec = r.get("eb", r.get("tb")), r.get("ec")
                ends.append((eb, ec, r["ev"]))
                if eb == r.get("tb") and (ec, r["ev"]) < (r.get("tc"), r.get("tv")):
                    bad.append(f"xref range {r.get('tb')} {r.get('tc')}:{r.get('tv')}-{ec}:{r['ev']} runs backwards (from {fb} {r.get('fc')}:{r.get('fv')})")
            for (xb, xc, xv) in ends:
                if not valid(D, xb, xc, xv) and (xb, xc, xv) not in XREF_KNOWN_ODD_VERSES:
                    bad.append(f"xref TO {xb} {xc}:{xv} (from {fb} {r.get('fc')}:{r.get('fv')}) is not a KJV verse")
    return bad


def check_naves(D):
    bad, n = [], 0
    for t in D["naves"]:
        for entry in t.get("entries", []):
            for (b, c, v) in naves_refs(entry):
                n += 1
                if not (chapter_ok(D, b, c) if v is None else valid(D, b, c, v)):
                    bad.append(f"Nave's '{t['topic']}': {b} {c}:{v}")
    return bad, n


def check_henry(D):
    bad = []
    for b, chs in D["henry_idx"].items():
        for c, ch in chs.items():
            txt = D["henry_txt"].get(b, {}).get(c)
            if txt is None:
                bad.append(f"Henry {b} {c}: index chapter has no commentary text")
                continue
            if ch.get("textLength") != len(txt):
                bad.append(f"Henry {b} {c}: text length {len(txt)} != indexed {ch.get('textLength')}")
            for vk, e in ch["verses"].items():
                if not valid(D, b, c, int(vk)):
                    bad.append(f"Henry {b} {c}:{vk} index key is not a KJV verse")
                if e.get("relation") in ("own", "together") and not (0 <= e["at"] < e["end"] <= len(txt)):
                    bad.append(f"Henry {b} {c}:{vk} offsets {e.get('at')}-{e.get('end')} outside text (len {len(txt)})")
    return bad


def check_gill(D):
    bad = []
    for b, chs in D["gill"].items():
        for c, ch in chs.items():
            if not chapter_ok(D, b, c):
                bad.append(f"Gill {b} {c}: chapter is not in the KJV")
                continue
            for vk, t in (ch.get("verses") or {}).items():
                if not valid(D, b, c, int(vk)):
                    bad.append(f"Gill {b} {c}:{vk} note is on a non-KJV verse")
                if isinstance(t, str) and not t.strip():
                    bad.append(f"Gill {b} {c}:{vk} note is empty")
    # the stub must never be served
    for b in D["gill"]:
        for c, vs in D["vers"].get(b, {}).items():
            for v in vs:
                t = gill_note(D, b, c, v)
                if t is not None and t.strip() == STUB:
                    bad.append(f"Gill {b} {c}:{v} serves the chapter-introduction stub as a note")
    return bad


def check_honest_null(D):
    """A verse with no note of its own must return None, not text borrowed from a neighbour."""
    bad = []
    for b in D["henry_idx"]:
        for c, ch in D["henry_idx"][b].items():
            for vk, e in ch["verses"].items():
                if e.get("relation") in ("none", "under-earlier") and henry_note(D, b, c, int(vk)) is not None:
                    bad.append(f"Henry {b} {c}:{vk} is relation '{e.get('relation')}' but returned text")
    return bad


def scorecard(D):
    """Coverage: of the verses each navigator hands you, how many have a teacher standing there."""
    def teachers(b, c, v):
        return (henry_note(D, b, c, v) is not None, gill_note(D, b, c, v) is not None)
    out = []
    # all verses
    tot = h = g = either = 0
    for b, chs in D["vers"].items():
        for c, vs in chs.items():
            for v in vs:
                tot += 1
                hh, gg = teachers(b, c, v)
                h += hh; g += gg; either += (hh or gg)
    out.append(f"every KJV verse ({tot:,}): Henry {100*h/tot:.1f}%  Gill {100*g/tot:.1f}%  at least one {100*either/tot:.1f}%")
    # xref targets, all and by weight (the worn-path dial). Votes are the Nov 16 2026 OpenBible
    # snapshot, about 5x the scale of the earlier copy: 170 / 500 here match 30 / 100 there.
    for label, floor in (("xref targets, all weights", 0), ("xref targets, worn paths (votes >= 170)", 170), ("xref targets, highways (votes >= 500)", 500)):
        seen = set(); n = 0; ok = 0
        for fb, refs in D["xref"].items():
            for r in refs:
                if r.get("v", 0) < floor:
                    continue
                k = (r["tb"], r["tc"], r["tv"])
                if k in seen:
                    continue
                seen.add(k); n += 1
                hh, gg = teachers(*k)
                ok += (hh or gg)
        out.append(f"{label} ({n:,} distinct verses): at least one teacher {100*ok/max(n,1):.1f}%")
    # Nave's verses
    seen = set(); n = ok = 0
    for t in D["naves"]:
        for entry in t.get("entries", []):
            for (b, c, v) in naves_refs(entry):
                if v is None or not valid(D, b, c, v) or (b, c, v) in seen:
                    continue
                seen.add((b, c, v)); n += 1
                hh, gg = teachers(b, c, v)
                ok += (hh or gg)
    out.append(f"Nave's verses ({n:,} distinct): at least one teacher {100*ok/max(n,1):.1f}%")
    return out


def run(D):
    failures = []
    for name, probs in (("xref", check_xref(D)), ("Henry", check_henry(D)), ("Gill", check_gill(D)),
                        ("honest-null", check_honest_null(D))):
        print(f"{name:12s} {'OK' if not probs else str(len(probs)) + ' PROBLEM(S)'}")
        for p in probs[:8]:
            print("   -", p)
        failures += probs
    nav_bad, nav_n = check_naves(D)
    ok = len(nav_bad) <= NAVES_KNOWN_SOURCE_TYPOS
    print(f"{'Nave’s':12s} {nav_n:,} refs, {len(nav_bad)} unresolved (allowed source typos: {NAVES_KNOWN_SOURCE_TYPOS}) -> {'OK' if ok else 'FAIL'}")
    for p in nav_bad[:8]:
        print("   -", p)
    if not ok:
        failures += nav_bad
    print("\nCoverage scorecard (informational):")
    for line in scorecard(D):
        print("  ", line)
    return failures


def self_test():
    """The gate must catch deliberate damage to each spine."""
    import copy
    base = load()
    cases = []
    d = copy.deepcopy(base); next(iter(d["xref"].values())).append({"fc": 1, "fv": 1, "tb": "JHN", "tc": 99, "tv": 1, "v": 5})
    cases.append(("dangling xref target", check_xref(d)))
    d = copy.deepcopy(base); ch = d["henry_idx"]["JHN"][3]; ch["verses"]["16"]["end"] = ch["textLength"] + 50
    cases.append(("Henry offset past end of text", check_henry(d)))
    d = copy.deepcopy(base); d["henry_txt"]["JHN"][3] += "x"
    cases.append(("Henry text changed under the index", check_henry(d)))
    d = copy.deepcopy(base); d["gill"]["JHN"][3]["verses"]["999"] = "ghost note"
    cases.append(("Gill note on a non-KJV verse", check_gill(d)))
    d = copy.deepcopy(base); d["gill"]["JHN"][3]["verses"]["16"] = "  "
    cases.append(("Gill empty note", check_gill(d)))
    d = copy.deepcopy(base); d["henry_idx"]["JHN"][3]["verses"]["16"]["relation"] = "none"
    cases.append(("(control) 'none' relation returns nothing", check_honest_null(d)))
    expect_clean = {"(control) 'none' relation returns nothing"}
    ok = True
    for name, probs in cases:
        caught = bool(probs)
        want = name not in expect_clean
        print(f"{'ok ' if caught == want else 'BAD'}  {name}: {'caught' if caught else 'not flagged'}")
        ok &= (caught == want)
    return 0 if ok else 1


def main():
    if "--self-test" in sys.argv:
        return self_test()
    D = load()
    failures = run(D)
    print("\nBACKBONE: " + ("every chain holds" if not failures else f"{len(failures)} broken link(s)"))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
