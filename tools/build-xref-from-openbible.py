#!/usr/bin/env python3
"""Rebuild data/xref and library/xref from OpenBible's cross_references.txt.

    curl -O https://a.openbible.info/data/cross-references.zip && unzip cross-references.zip
    python3 tools/build-xref-from-openbible.py path/to/cross_references.txt

Source: openbible.info Bible Cross References, CC BY. The file's header line carries the
snapshot date. Rules (so the build is reproducible and nothing is guessed):
  * a row is kept when its vote count is >= 1 (zero and negative votes are OpenBible's own
    'disputed / unvoted' links and were never in our copy)
  * a single-verse target becomes {fc,fv,tb,tc,tv,v}
  * a RANGE target (e.g. John.11.25-John.11.26) becomes {fc,fv,tb,tc,tv,v,ec,ev} where tb/tc/tv
    is the first verse and ec/ev the last (plus eb only if the range crosses books). Readers
    that ignore ec/ev still land on the first verse of the range.
  * rows are stored in the FROM verse's book file, sorted by (chapter, verse, -votes, target)
  * every verse is checked against library/bible/KJV; rows touching a verse the KJV lacks are
    reported and kept as printed (OpenBible numbers 3 John with 15 verses, the KJV has 14;
    tools/check-backbone.py names these exceptions so any new one fails the gate)
"""
import json, os, sys, re, collections

REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
BK = {"Gen":"GEN","Exod":"EXO","Lev":"LEV","Num":"NUM","Deut":"DEU","Josh":"JOS","Judg":"JDG","Ruth":"RUT","1Sam":"1SA","2Sam":"2SA","1Kgs":"1KI","2Kgs":"2KI","1Chr":"1CH","2Chr":"2CH","Ezra":"EZR","Neh":"NEH","Esth":"EST","Job":"JOB","Ps":"PSA","Prov":"PRO","Eccl":"ECC","Song":"SNG","Isa":"ISA","Jer":"JER","Lam":"LAM","Ezek":"EZK","Dan":"DAN","Hos":"HOS","Joel":"JOL","Amos":"AMO","Obad":"OBA","Jonah":"JON","Mic":"MIC","Nah":"NAH","Hab":"HAB","Zeph":"ZEP","Hag":"HAG","Zech":"ZEC","Mal":"MAL","Matt":"MAT","Mark":"MRK","Luke":"LUK","John":"JHN","Acts":"ACT","Rom":"ROM","1Cor":"1CO","2Cor":"2CO","Gal":"GAL","Eph":"EPH","Phil":"PHP","Col":"COL","1Thess":"1TH","2Thess":"2TH","1Tim":"1TI","2Tim":"2TI","Titus":"TIT","Phlm":"PHM","Heb":"HEB","Jas":"JAS","1Pet":"1PE","2Pet":"2PE","1John":"1JN","2John":"2JN","3John":"3JN","Jude":"JUD","Rev":"REV"}

def kjv():
    out = {}
    for b in BK.values():
        d = json.load(open(os.path.join(REPO, "library/bible/KJV", b + ".json"), encoding="utf-8"))
        out[b] = {int(c["chapter"]): set(int(v) for v in c["verses"]) for c in d["chapters"]}
    return out

def ref(s):
    b, c, v = s.split(".")
    return BK[b], int(c), int(v)

def main(path):
    V = kjv()
    ok = lambda b, c, v: b in V and c in V[b] and v in V[b][c]
    lines = open(path, encoding="utf-8").read().splitlines()
    m = re.search(r"CC-BY (\d{4}-\d{2}-\d{2})", lines[0])
    snap = m.group(1) if m else "unknown"
    per = collections.defaultdict(list); dropped_votes = 0; off = []; n_rng = 0
    for ln in lines[1:]:
        a, t, v = ln.split("\t"); v = int(v)
        if v < 1:
            dropped_votes += 1; continue
        fb, fc, fv = ref(a)
        row = {"fc": fc, "fv": fv}
        if "-" in t:
            s, e = t.split("-"); tb, tc, tv = ref(s); eb, ec, ev = ref(e); n_rng += 1
            row.update(tb=tb, tc=tc, tv=tv, v=v, ec=ec, ev=ev)
            if eb != tb: row["eb"] = eb
            ends = [(tb, tc, tv), (eb, ec, ev)]
        else:
            tb, tc, tv = ref(t); row.update(tb=tb, tc=tc, tv=tv, v=v); ends = [(tb, tc, tv)]
        if not (ok(fb, fc, fv) and all(ok(*x) for x in ends)):
            off.append((fb, fc, fv, ends))
        per[fb].append(row)
    return snap, per, off, dropped_votes, n_rng

def write(per, snap):
    total = 0
    for b in BK.values():
        refs = sorted(per.get(b, []), key=lambda r: (r["fc"], r["fv"], -r["v"], r["tb"], r["tc"], r["tv"]))
        total += len(refs)
        base = {"book": b, "count": len(refs), "source": "OpenBible.info CC-BY", "snapshot": snap, "refs": refs}
        for folder, extra in (("data/xref", {}), ("library/xref", {"sourceId": "xref"})):
            d = {"book": b, **extra, **{k: v for k, v in base.items() if k != "book"}}
            with open(os.path.join(REPO, folder, b + ".json"), "w", encoding="utf-8") as f:
                f.write(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
    return total

if __name__ == "__main__":
    snap, per, off, dropped, n_rng = main(sys.argv[1])
    print(f"snapshot {snap}; kept {sum(len(v) for v in per.values()):,} rows ({n_rng:,} ranges); dropped {dropped:,} rows with votes < 1")
    print(f"rows touching a verse not in the KJV: {len(off)}")
    for x in off[:15]: print("   ", x)
    if "--dry-run" not in sys.argv:
        print("wrote", f"{write(per, snap):,}", "rows to data/xref and library/xref")
