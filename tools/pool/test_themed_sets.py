#!/usr/bin/env python3
"""Every prepared study set (tools/pool/themed_set.py) is ready for a real run, with no model call: its materials load, only public
passages are offered, and a plain stand-in study made by code from the set's own passages passes every rail (themed_study.check)
and renders. A set that cannot pass here could not pass with the model either (too few teachers on a section, for example).
usage: test_themed_sets.py [slug ...]   (default: every set but John 3, which test_themed_study.py covers)"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import themed_study as TS, themed_set as TSET, weave as W

def sections_of(M):
    """The unit's movements as sections (split in two if there is only one movement), capped at five."""
    lo, hi = M['scope']['lo'], M['scope']['hi']
    mv = [(max(m['start'], lo), min(m['end'], hi)) for m in M['unit'].get('movements') or [] if m['end'] >= lo and m['start'] <= hi]
    if len(mv) < 2:
        mid = (lo + hi) // 2; mv = [(lo, mid), (mid + 1, hi)] if hi > lo else [(lo, lo)]
    while len(mv) > 5: mv[-2:] = [(mv[-2][0], mv[-1][1])]
    return [list(range(a, b + 1)) for a, b in mv]

def standin(M):
    """Quote the first sentence of two passages per section, each from a different teacher where possible (no teacher more than
    twice in the study), so at least four teachers are heard. Narrative is a short plain line naming the teacher."""
    tok = lambda v: f"{M['book']}.{M['chapter']}.{v}"
    used, per = set(), {}
    secs = []
    for n, vs in enumerate(sections_of(M)):
        flow = []; here = set()
        for c in sorted(M['passages'], key=lambda c: (per.get(c['teacher_key'], 0), -len(c['sentences'][0]))):
            if len(here) >= 2: break
            if c['id'] in used or c['teacher_key'] in here or per.get(c['teacher_key'], 0) >= 2 or not set(c['covers']) & set(vs): continue
            if len(c['sentences'][0]) > 1300: continue
            used.add(c['id']); here.add(c['teacher_key']); per[c['teacher_key']] = per.get(c['teacher_key'], 0) + 1
            flow += [dict(text=f"Listen to {c['teacher']} here.", evidence=[c['id']]), {'quote': c['id'], 'from': 0, 'to': 0}]
        secs.append(dict(heading=('First', 'Second', 'Third', 'Fourth', 'Fifth')[n] + ' part', verses=vs, flow=flow))
    road = M['road']; rc = max(road['candidates'], key=lambda c: len(c['text']))
    return dict(title='A stand-in study', opening=dict(text='Read these verses slowly.', evidence=[tok(M['scope']['lo'])]), sections=secs,
                rabbi_road=dict(text=f"The road goes to {road['ref']}, and {rc['teacher']} walks it with us.", evidence=[road['token'], rc['id']],
                                quote=[rc['id']], prompt='What will you do with this?'),
                over_the_hill=dict(text=f"Over the hill is {M['hill']['ref']}.", evidence=[M['hill']['token']]))

def main(slugs):
    fails = []
    for slug in slugs:
        M = TS.materials(slug); F = standin(M)
        if not M['passages']: fails.append(f'{slug}: no passages'); continue
        if any(c['rights'] not in 'AB' for c in M['passages'] + M['road']['candidates']): fails.append(f'{slug}: a withheld passage is offered')
        if not M['road']['candidates']: fails.append(f'{slug}: the Rabbi Road has no teacher passage')
        p, _ = TS.check(F, M)
        if p: fails.append(f'{slug}: stand-in fails {p}')
        teachers = len({c['teacher_key'] for c in M['passages']})
        print(f"{slug}: {M['scope']['ref']}, {len(M['passages'])} passages, {teachers} teachers, road {M['road']['ref']} "
              f"({len(M['road']['candidates'])} passages), hill {M['hill']['ref']}: stand-in", 'passes' if not p else 'FAILS')
    print(f'themed-set tests: {len(slugs)} sets,', 'all pass' if not fails else f'{len(fails)} FAIL')
    for x in fails: print('FAIL', x)
    return not fails

if __name__ == '__main__': sys.exit(0 if main(sys.argv[1:] or TSET.all_slugs()) else 1)
