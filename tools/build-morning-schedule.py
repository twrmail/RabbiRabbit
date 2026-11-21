#!/usr/bin/env python3
"""Builds the Morning Trail schedule: which verse is shown on which date.
   Inputs : library/xref (cross-reference votes), tools/morning-seasonal.json (church-calendar verses)
   Outputs: morning/list.json (the ordinary rotation, in order), morning/schedule/<year>.json (date -> verse)
   Rules  : ordinary list = verses with a link of 170+ votes ("worn path"); the 39 with 500+ ("highways") appear twice, half a cycle apart.
            Verses used by the church calendar are taken out of the ordinary list. On a seasonal day the ordinary rotation pauses.
            Deterministic: a fixed seed, so rerunning gives the same files.   Usage: python3 tools/build-morning-schedule.py [--check]
"""
import json, os, sys, random, datetime as dt, glob
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
START = dt.date(2026, 11, 21); END = dt.date(2029, 12, 31)
WORN, HIGHWAY, SEED = 170, 500, 20261121
BOOKS = "GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAH HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV".split()
NT = set(BOOKS[39:])
def vid(*a): return "-".join(str(x) for x in a)
def parse(s):
    b, cv = s.split(); c, v = cv.split(":")
    if "-" in v: v1, v2 = v.split("-"); return (b, int(c), int(v1), int(v2))
    return (b, int(c), int(v))

def easter(y):                                  # Western Easter (anonymous Gregorian algorithm)
    a = y % 19; b, c = divmod(y, 100); d, e = divmod(b, 4); f = (b + 8) // 25; g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30; i, k = divmod(c, 4); l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451; mo = (h + l - 7 * m + 114) // 31; da = (h + l - 7 * m + 114) % 31 + 1
    return dt.date(y, mo, da)
def advent_start(y):                            # first Sunday of Advent = fourth Sunday before Christmas
    xmas = dt.date(y, 12, 25); fourth = xmas - dt.timedelta(days=(xmas.weekday() + 1) % 7 or 7)
    return fourth - dt.timedelta(days=21)

def load_votes():
    best = {}
    for p in glob.glob(os.path.join(ROOT, "library/xref/*.json")):
        for r in json.load(open(p, encoding="utf-8")).get("refs", []):
            k = (r["tb"], r["tc"], r["tv"]); best[k] = max(best.get(k, 0), r["v"])
    return best

def seasonal_calendar(S, years):
    """date -> (verse tuple, kind, label)"""
    cal = {}
    for y in years:
        e = easter(y); adv = advent_start(y); a_end = dt.date(y, 12, 24)
        n = (a_end - adv).days + 1; slots = S["advent"][28 - n:]
        for i, ref in enumerate(slots): cal[adv + dt.timedelta(days=i)] = (parse(ref), "advent", f"Advent, day {i+1} of {n}")
        for i, ref in enumerate(S["christmas"]): cal[dt.date(y, 12, 25) + dt.timedelta(days=i)] = (parse(ref), "christmas", f"Christmas, day {i+1} of 13")
        ash = e - dt.timedelta(days=46)
        for i, ref in enumerate(S["lent"]): cal[ash + dt.timedelta(days=i)] = (parse(ref), "lent", f"Lent, day {i+1} of 46")
        for i, ref in enumerate(S["easter"]): cal[e + dt.timedelta(days=i)] = (parse(ref), "easter", f"Easter week, day {i+1} of 7")
        cal[e + dt.timedelta(days=39)] = (parse(S["ascension"]), "ascension", "Ascension")
        cal[e + dt.timedelta(days=49)] = (parse(S["pentecost"]), "pentecost", "Pentecost")
    return cal

def spaced(items, rng, gap=4):
    """order items so the same book is not repeated within `gap` days and no testament runs longer than 3"""
    pool = items[:]; rng.shuffle(pool); out = []
    while pool:
        pick = None
        for i, it in enumerate(pool):
            recent = out[-gap:]
            if any(r[0] == it[0] for r in recent): continue
            tail = out[-3:]
            if len(tail) == 3 and all((r[0] in NT) == (it[0] in NT) for r in tail): continue
            pick = i; break
        if pick is None: pick = 0
        out.append(pool.pop(pick))
    return out

def build():
    S = json.load(open(os.path.join(ROOT, "tools/morning-seasonal.json")))
    best = load_votes(); best_global.update(best); rng = random.Random(SEED)
    worn = sorted(k for k, v in best.items() if v >= WORN); high = {k for k, v in best.items() if v >= HIGHWAY}
    pinned = {parse(r) for key in ("advent", "christmas", "lent", "easter") for r in S[key]} | {parse(S["ascension"]), parse(S["pentecost"])}
    distinct = [k for k in worn if k not in pinned]
    order = spaced(distinct, rng)
    # highways come round a second time, about half a cycle after the first, nudged so a book does not repeat within 3 days
    L = len(order); second = []
    for i, k in enumerate(order):
        if k in high: second.append(((i + L // 2) % L, k))
    final = order[:]
    for pos, k in sorted(second, reverse=True):
        j = min(pos, len(final))
        for off in range(0, 12):
            for cand in (j + off, j - off):
                if 0 < cand <= len(final) and all(final[x][0] != k[0] for x in range(max(0, cand - 3), min(len(final), cand + 3))):
                    j = cand; break
            else: continue
            break
        final.insert(j, k)
    # curated story verses: spaced evenly through the rotation, never beside the same book
    story = [parse(r) for r in S.get("story", [])]; N = len(story)
    if N:
        base = len(final); step = base / N
        for n_, k in enumerate(story):
            j = int(n_ * step + step / 2) + n_
            for off in range(0, 15):
                ok = None
                for cand in (j + off, j - off):
                    if 0 < cand < len(final) and final[cand-1][0] != k[0] and final[cand][0] != k[0]: ok = cand; break
                if ok: j = ok; break
            final.insert(j, k)
    years = range(START.year - 1, END.year + 2)
    cal = seasonal_calendar(S, years)
    story_set = {parse(r) for r in S.get('story', [])}
    days = {}; i = 0; d = START
    while d <= END:
        if d in cal: v, kind, label = cal[d]; days[d] = {"verse": vid(*v), "kind": kind, "label": label}
        else:
            v = final[i % len(final)]; is_story = v in story_set; days[d] = {"verse": vid(*v), "kind": "story" if is_story else "ordinary", "label": ("Curated story selection, " if is_story else "Rotation, ") + f"entry {i % len(final) + 1} of {len(final)}"}; i += 1
        d += dt.timedelta(days=1)
    return S, final, high, pinned, days

best_global = {}
def write(S, final, high, pinned, days):
    os.makedirs(os.path.join(ROOT, "morning/schedule"), exist_ok=True)
    meta = {"about": "Morning Trail ordinary rotation, in order. Built by tools/build-morning-schedule.py. Do not edit by hand; edit tools/morning-seasonal.json or rerun the script.",
            "start": START.isoformat(), "worn_floor_votes": WORN, "highway_floor_votes": HIGHWAY, "seed": SEED, "length": len(final),
            "distinct": len({k for k in final}), "story": [vid(*parse(r)) for r in S.get("story", [])], "highways_twice": sorted(vid(*k) for k in high if k in set(final)), "removed_for_calendar": sorted(vid(*k) for k in pinned if best_global.get(k,0) >= WORN)}
    json.dump({**meta, "list": [vid(*k) for k in final]}, open(os.path.join(ROOT, "morning/list.json"), "w"), indent=1)
    for y in sorted({d.year for d in days}):
        ydays = {d.isoformat(): v for d, v in days.items() if d.year == y}
        json.dump({"year": y, "note": "date -> verse. Built by tools/build-morning-schedule.py.", "days": ydays}, open(os.path.join(ROOT, f"morning/schedule/{y}.json"), "w"), indent=0)

if __name__ == "__main__":
    S, final, high, pinned, days = build()
    kinds = {}
    for v in days.values(): kinds[v["kind"]] = kinds.get(v["kind"], 0) + 1
    print(f"ordinary list: {len(final)} entries ({len({k for k in final})} distinct); highways twice: {sum(1 for k in high if k in set(final))}; calendar verses that were also on the worn path (moved to the calendar): {sum(1 for k in pinned if best_global.get(k,0) >= WORN)}")
    print("days scheduled", len(days), kinds)
    if "--check" not in sys.argv: write(S, final, high, pinned, days); print("written to morning/")
