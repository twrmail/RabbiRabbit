#!/usr/bin/env python3
"""Integrity gate for Strong's (Greek and Hebrew dictionaries + verse concordance).

Read-only. Exit 0 = every check holds, exit 1 = something broke (details printed).

    python3 tools/check-strongs.py
    python3 tools/check-strongs.py --self-test     # proves the gate catches deliberate damage

Checks
  1. complete by number: Greek G1-G5624, Hebrew H1-H8674, no gaps, no empty entry, 'count' matches
  2. the 101 Greek numbers Strong's himself left unused (G2717, G3203-G3302) say 'Not Used' and nothing else does
  3. every G/H number an entry cites exists in the dictionary
  4. the two copies (library/lexicon, and data/dict which the live Worker reads) are byte-identical
  5. every concordance key resolves to a dictionary entry, and the numbers with no verse links are
     exactly the ones recorded (Greek: 101 'Not Used' + 108 whose KJV tagging sits on a related number)
  6. the markers the Worker's parser depends on have not been stripped: Greek entries carry Beta-code
     (5,226) and Hebrew entries carry {braces} (6,473). worker's parseStrongsEntry / rankStrongsMatch /
     expandStrongsCompounds read them, so cleaning them is a Worker change, not a data change.
"""
import json, os, re, sys, copy

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
NOT_USED = {2717, *range(3203, 3303)}
NO_VERSE_RECORDED_GREEK = 209            # 101 Not Used + 108 (neuter/inflected forms the KJV tagging puts on the root)
GREEK_BETA_ENTRIES, HEBREW_BRACE_ENTRIES = 5226, 6473
BETA = re.compile(r"[A-Z]{2,}/|\*[A-Z]|/[A-Z]")


def load(folder="library/lexicon"):
    j = lambda f: json.load(open(os.path.join(ROOT, folder, f), encoding="utf-8"))
    return {"g": j("strongs_greek.json"), "h": j("strongs_hebrew.json"), "c": j("strongs_concordance.json")}


def problems(D):
    out = []
    g, h, c = D["g"]["entries"], D["h"]["entries"], D["c"]
    for name, d, n, meta in (("Greek", g, 5624, D["g"]), ("Hebrew", h, 8674, D["h"])):
        missing = [i for i in range(1, n + 1) if str(i) not in d]
        extra = [k for k in d if not (k.isdigit() and 1 <= int(k) <= n)]
        empty = [k for k, t in d.items() if not str(t).strip()]
        if missing: out.append(f"{name}: {len(missing)} numbers missing, e.g. {missing[:5]}")
        if extra: out.append(f"{name}: unexpected keys {extra[:5]}")
        if empty: out.append(f"{name}: {len(empty)} empty entries, e.g. {empty[:5]}")
        if meta.get("count") != n or len(d) != n: out.append(f"{name}: count field {meta.get('count')} / {len(d)} entries, expected {n}")
    nu = {int(k) for k, t in g.items() if t.startswith("Not Used")}
    if nu != NOT_USED: out.append(f"Greek 'Not Used' set changed: {sorted(nu ^ NOT_USED)[:8]}")
    ref = re.compile(r"(?<![A-Za-z])([GH])(\d{1,5})(?!\d)")
    for src, d in (("G", g), ("H", h)):
        for k, t in d.items():
            for m in ref.finditer(t):
                tgt = g if m.group(1) == "G" else h
                if str(int(m.group(2))) not in tgt:
                    out.append(f"{src}{k} cites {m.group(1)}{m.group(2)}, which does not exist")
    nolink_g = [k for k in g if "G" + k not in c]
    if len(nolink_g) != NO_VERSE_RECORDED_GREEK: out.append(f"Greek numbers with no verse links: {len(nolink_g)}, recorded {NO_VERSE_RECORDED_GREEK}")
    if [k for k in h if "H" + k not in c]: out.append("Hebrew numbers with no verse links")
    for k in c:
        tgt = g if k[0] == "G" else h
        if k[1:] not in tgt: out.append(f"concordance key {k} has no dictionary entry")
    nb = sum(bool(BETA.search(t)) for t in g.values()); nh = sum("{" in t for t in h.values())
    if nb != GREEK_BETA_ENTRIES: out.append(f"Greek entries carrying Beta-code: {nb}, recorded {GREEK_BETA_ENTRIES} (the Worker's parser reads these)")
    if nh != HEBREW_BRACE_ENTRIES: out.append(f"Hebrew entries carrying {{braces}}: {nh}, recorded {HEBREW_BRACE_ENTRIES} (the Worker's matcher reads these)")
    return out


def copies_identical():
    out = []
    for f in ("strongs_greek.json", "strongs_hebrew.json", "strongs_concordance.json"):
        a, b = os.path.join(ROOT, "library/lexicon", f), os.path.join(ROOT, "data/dict", f)
        if open(a, "rb").read() != open(b, "rb").read(): out.append(f"library/lexicon/{f} and data/dict/{f} differ")
    return out


def self_test():
    base = load(); ok = True
    cases = []
    d = copy.deepcopy(base); del d["h"]["entries"]["100"]; cases.append(("missing Hebrew entry", problems(d)))
    d = copy.deepcopy(base); d["g"]["entries"]["50"] = "  "; cases.append(("empty Greek entry", problems(d)))
    d = copy.deepcopy(base); d["h"]["entries"]["50"] += " Compare H99999."; cases.append(("citation to a number that does not exist", problems(d)))
    d = copy.deepcopy(base); d["g"]["entries"]["3300"] = "something else"; cases.append(("a 'Not Used' number given text", problems(d)))
    d = copy.deepcopy(base); d["h"]["entries"] = {k: v.replace("{", "").replace("}", "") for k, v in d["h"]["entries"].items()}; cases.append(("braces stripped", problems(d)))
    d = copy.deepcopy(base); k = next(i for i, t in d["g"]["entries"].items() if BETA.search(t)); d["g"]["entries"][k] = BETA.sub("", d["g"]["entries"][k]); cases.append(("Beta-code stripped from one entry", problems(d)))
    d = copy.deepcopy(base); del d["c"]["H100"]; cases.append(("Hebrew number loses its verse links", problems(d)))
    for name, p in cases:
        caught = bool(p); ok &= caught
        print(f"{'ok ' if caught else 'BAD'}  {name}: {'caught' if caught else 'NOT caught'}")
    return 0 if ok else 1


def main():
    if "--self-test" in sys.argv: return self_test()
    p = problems(load()) + copies_identical()
    for x in p[:20]: print(" -", x)
    D = load()
    print(f"Strong's: Greek {len(D['g']['entries']):,} (101 'Not Used'), Hebrew {len(D['h']['entries']):,}, concordance {len(D['c']):,} numbers -> "
          + ("every check holds" if not p else f"{len(p)} problem(s)"))
    return 1 if p else 0


if __name__ == "__main__":
    sys.exit(main())
