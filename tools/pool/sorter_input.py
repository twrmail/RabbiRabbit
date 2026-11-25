#!/usr/bin/env python3
"""Prints the public-build pool for one passage in the form a sorter reads. usage: sorter_input.py REPORTS PASSAGE [preview_chars]  (0 = full text)"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import validator as V, run_validator as RV
rep, pool, cov, req = RV.load(f'{sys.argv[1]}/diagnostic-{sys.argv[2]}.json'); n = int(sys.argv[3]) if len(sys.argv) > 3 else 0
print(f"{req['scope']}  budget {V.DEFAULT_BUDGET} chars  roles {list(V.ROLES)}  teacher cap {V.TEACHER_CAP}/verse, {V.MIN_PER_VERSE}-{V.MAX_PER_VERSE} pieces/verse")
for v in range(req['lo'], req['hi'] + 1):
    here = [p for p in pool if v in V.covers(p) and V.usable(p, 'public')]
    print(f"\n=== verse {v}: {len(here)} usable pieces")
    for p in here:
        dep = f" NEEDS {','.join(p['predecessor_ids'])}" if p['predecessor_ids'] else ''
        t = p['text'].replace('\n', ' '); t = t if not n or len(t) <= n else t[:n] + '…'
        print(f"[{p['id']}] {p['teacher_key']} {len(p['text'])}c{dep}{' covers '+str(p['covers_verses']) if len(p['covers_verses'])>1 else ''}: {t}")
