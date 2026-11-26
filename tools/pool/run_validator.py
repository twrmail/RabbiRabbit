#!/usr/bin/env python3
"""Stand-in plan, bad-plan suite and synthetic self-tests for validator.py. No model calls.
Usage: python3 run_validator.py REPORTS_DIR OUT_DIR
Per passage: build pool from the diagnostic JSON, make gap records, run a deterministic stand-in plan (public build),
run every bad plan from brief section 10 and check each is rejected by the rule it is meant to trip."""
import json, os, sys, copy, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import validator as V

EDITION = 'WEB'
def budget_for(lo, hi): return V.DEFAULT_BUDGET   # D4: flat 12,000 for every passage (Tom, Nov 22)

def load(path):
    r = json.load(open(path)); lo, hi = r['scope']
    pool = [p for e in r['sources'].values() for p in e['pieces']]
    cov = {s: e['coverage'] for s, e in r['sources'].items()}
    cov = {s: {v: c['state'] for v, c in m.items()} for s, m in cov.items()}
    return r, pool, cov, dict(scope=r['passage'], edition=EDITION, lo=lo, hi=hi)

def standin(pool, request, build, per_verse=4):
    """Deterministic stand-in for the sorter (not a sorter): pass 1 gives every verse two pieces from different teacher_keys
    (standalone and shortest first); pass 2 adds more, round-robin across teachers, while the passage budget allows.
    A dependent piece is only picked with its whole predecessor chain, placed under the same verse."""
    lo, hi = request['lo'], request['hi']; budget = budget_for(lo, hi); by_id = {p['id']: p for p in pool}
    taken, where, verses, used = set(), {}, {str(v): [] for v in range(lo, hi + 1)}, 0
    def bundle(p, v):
        chain, q = [], p
        while q['predecessor_ids']:
            pr = by_id.get(q['predecessor_ids'][0])
            if pr is None or not V.usable(pr, build): return None
            if pr['id'] in taken:
                if where[pr['id']] > v: return None
                break
            chain.insert(0, pr); q = pr
        return chain + [p]
    def take(b, v):
        nonlocal used
        for x in b: taken.add(x['id']); where[x['id']] = v; verses[str(v)].append(x); used += len(x['text'])
    def options(v, exclude_t=()):
        out = []
        for p in pool:
            if v in V.covers(p) and V.usable(p, build) and p['id'] not in taken and p['teacher_key'] not in exclude_t:
                b = bundle(p, v)
                if b: out.append((len(b) > 1, sum(len(x['text']) for x in b), p['id'], b))
        return sorted(out, key=lambda o: o[:3])
    for v in range(lo, hi + 1):                              # pass 1: two per verse, different teachers where possible
        for _ in range(V.MIN_PER_VERSE):
            have = {x['teacher_key'] for x in verses[str(v)]}
            o = options(v, have) or options(v)
            if o: take(o[0][3], v)
    for _ in range(per_verse - V.MIN_PER_VERSE):             # pass 2: extras, one round across verses at a time
        for v in range(lo, hi + 1):
            have = {x['teacher_key'] for x in verses[str(v)]}
            o = [x for x in (options(v, have) or options(v)) if used + x[1] <= budget and sum(1 for y in verses[str(v)] if y['teacher_key'] == x[3][-1]['teacher_key']) < V.TEACHER_CAP]
            if o and len(verses[str(v)]) + len(o[0][3]) <= V.MAX_PER_VERSE: take(o[0][3], v)
    plan = {}
    for k, l in verses.items():
        l = sorted(l, key=lambda p: (p['note_id'], p['start']))
        plan[k] = [dict(id=p['id'], role='overview' if i == 0 else 'meaning') for i, p in enumerate(l)]
    return dict(scope=request['scope'], edition=EDITION, verses=plan)

def rules(res): return set(res['stats'].get('rules_failed', [])) | {r['rule'] for r in res['rejections']}

def bad_plans(pool, request, good, build):
    """Returns list of (name, plan, pool_override or None, expected_rule or None for 'must pass', note)."""
    lo, hi = request['lo'], request['hi']; out = []
    def clone(): return copy.deepcopy(good)
    first = lambda pl: next(iter(pl['verses'].values()))
    vk = str(lo)
    pl = clone(); pl['verses'][vk].append(dict(id='ZZZ.999.99', role='meaning')); out.append(('invented ID', pl, None, 'V1', ''))
    # wrong verse: needs a multi-verse passage and a piece that covers only one verse
    one = next((p for p in pool if len(V.covers(p)) == 1 and V.usable(p, build)), None) if hi > lo else None
    if one:
        other = str(next(v for v in range(lo, hi + 1) if v != V.covers(one)[0])); pl = clone()
        for l in pl['verses'].values(): l[:] = [i for i in l if i['id'] != one['id']]
        pl['verses'][other].append(dict(id=one['id'], role='meaning')); out.append(('wrong verse', pl, None, 'V2', ''))
    else: out.append(('wrong verse', None, None, None, 'SKIPPED: single-verse passage; covered by the synthetic test'))
    pl = clone(); d = first(pl)[0]; first(pl).append(dict(d)); out.append(('duplicate', pl, None, 'V4', ''))
    pl = clone(); first(pl)[0]['text'] = 'free commentary written by the sorter'; out.append(('free text', pl, None, 'V0', ''))
    pl = clone(); pl['notes'] = 'extra field'; out.append(('extra top-level field', pl, None, 'V0', ''))
    pl = clone(); pl['edition'] = 'KJV'; out.append(('wrong edition', pl, None, 'V0', ''))
    pl = clone(); pl['verses'] = {k: v[:1] for k, v in pl['verses'].items()}
    ok_v = [v for v in range(lo, hi + 1) if sum(1 for p in pool if v in V.covers(p) and V.usable(p, build)) >= 2]
    out.append(('one piece per verse', pl, None, 'V6' if ok_v else None, '' if ok_v else 'SKIPPED: no verse has two usable pieces'))
    # outside-scope subject span: mutate a copy of a picked piece
    pid = first(good)[0]['id']; mp = copy.deepcopy(pool)
    for p in mp:
        if p['id'] == pid: p['subject_span'] = [lo - 1, hi]
    out.append(('outside-scope piece (mutated copy)', clone(), mp, 'V3', 'subject_span set to start one verse before the request'))
    withheld = next((p for p in pool if not V.rights_ok(p, build)), None)
    mp = copy.deepcopy(pool); real = withheld is not None
    if not real:
        for p in mp:
            if p['id'] == pid: p['rights'] = 'W'
        wid = pid; pl = clone()
    else: wid = withheld['id']; pl = clone(); pl['verses'][str(V.covers(withheld)[0] if lo <= V.covers(withheld)[0] <= hi else lo)].append(dict(id=wid, role='meaning')); mp = None
    out.append(('withheld piece' + ('' if real else ' (mutated copy)'), pl, mp, 'V10', 'real withheld piece' if real else 'a picked piece set to rights W'))
    susp = next((p for p in pool if p.get('boundary_suspect') and V.rights_ok(p, build)), None)
    if susp:
        pl = clone(); pl['verses'][str(V.covers(susp)[0])].append(dict(id=susp['id'], role='meaning')); mp = None; note = 'real boundary_suspect piece'
    else:
        mp = copy.deepcopy(pool); pl = clone()
        for p in mp:
            if p['id'] == pid: p['boundary_suspect'] = True
        note = 'a picked piece set boundary_suspect (mutated copy)'
    out.append(('boundary-suspect piece', pl, mp, 'V9', note))
    dep = next((p for p in pool if p['predecessor_ids'] and V.usable(p, build)), None)
    if dep:
        pl = clone()
        for l in pl['verses'].values(): l[:] = [i for i in l if i['id'] not in ([dep['id']] + dep['predecessor_ids'])]
        pl['verses'][str(V.covers(dep)[0])].append(dict(id=dep['id'], role='meaning')); out.append(('missing predecessor', pl, None, 'V12', ''))
    else: out.append(('missing predecessor', None, None, None, 'SKIPPED: no dependent piece in pool'))
    pl = clone(); pl['verses'].pop(str(lo)); out.append(('missing verse', pl, None, 'V6' if any(V.usable(p, build) and lo in V.covers(p) for p in pool) else 'V11', ''))
    # cross-reference piece that merely cites another verse must be ACCEPTED
    xr = next((p for p in pool if p['contains_cross_refs'] and V.usable(p, build) and not p['boundary_suspect'] and all(lo <= s <= hi for s in p['subject_span'])), None)
    if xr:
        pl = clone()
        for l in pl['verses'].values(): l[:] = [i for i in l if i['id'] not in [xr['id']] + xr['predecessor_ids']]
        for q in xr['predecessor_ids']:
            pl['verses'][str(V.covers(xr)[0])].append(dict(id=q, role='meaning'))
        pl['verses'][str(V.covers(xr)[0])].append(dict(id=xr['id'], role='meaning'))
        out.append(('cross-reference piece accepted', pl, None, None, f'{xr["id"]} cites {xr["contains_cross_refs"][:2]}'))
    else: out.append(('cross-reference piece accepted', None, None, None, 'SKIPPED: no cross-referencing piece in pool'))
    # Catena attribution: Augustine direct + Augustine via Catena share one teacher_key; 5 of them trip V7
    for v in range(lo, hi + 1):
        aug = [p for p in pool if p['teacher_key'] == 'augustine' and v in V.covers(p) and V.usable(p, build) and p['standalone']]
        if len(aug) >= 5 and any(p.get('compiler') for p in aug):
            pl = clone(); ids5 = {p['id'] for p in aug[:5]}
            for l in pl['verses'].values(): l[:] = [i for i in l if i['id'] not in ids5]
            pl['verses'][str(v)] = [dict(id=p['id'], role='meaning') for p in aug[:5]]
            out.append(('Catena Augustine counted with direct Augustine (cap 4)', pl, None, 'V7', f'verse {v}: {len([p for p in aug[:5] if p.get("compiler")])} via Catena, rest direct')); break
    else: out.append(('Catena Augustine counted with direct Augustine (cap 4)', None, None, None, 'SKIPPED: fewer than 5 standalone Augustine pieces on one verse'))
    return out

def synthetic():
    """Self-test of every rule on a tiny invented pool, so rules the real passages cannot exercise are still proven."""
    def P(i, t, v, **k):
        d = dict(id=i, teacher_key=t, anchor_verse=v, covers_verses=[v], subject_span=[v, v], note_span=[v, v], text='x' * 100, rights='A', markup_valid=True,
                 boundary_suspect=False, predecessor_ids=[], standalone=True, contains_cross_refs=[], flags=[]); d.update(k); return d
    pool = [P('a1', 'a', 1), P('b1', 'b', 1), P('c1', 'c', 1), P('a2', 'a', 2), P('b2', 'b', 2), P('d2', 'd', 2, predecessor_ids=['a2'], standalone=False),
            P('w2', 'e', 2, rights='W'), P('s2', 'f', 2, boundary_suspect=True), P('m2', 'g', 2, markup_valid=False),
            P('o1', 'h', 1, subject_span=[1, 3]), P('x1', 'i', 1, contains_cross_refs=['Mt 5:3']),
            P('t1', 'z', 1), P('t2', 'z', 1), P('t3', 'z', 1), P('t4', 'z', 1), P('t5', 'z', 1),
            P('g2', 'g', 2, gap_inside='x@1'), P('ga1', 'j', 1, gap_after='t@5'), P('gb1', 'k', 1, gap_before='t@5')]
    req = dict(scope='Test 1:1-2', edition='WEB', lo=1, hi=2)
    base = lambda v1, v2: dict(scope='Test 1:1-2', edition='WEB', verses={'1': [dict(id=i, role='meaning') for i in v1], '2': [dict(id=i, role='meaning') for i in v2]})
    good = base(['a1', 'b1'], ['a2', 'b2'])
    cases = [('good plan passes', good, None), ('V0 extra field', {**good, 'x': 1}, 'V0'), ('V0 scope', {**good, 'scope': 'Test 1:1'}, 'V0'),
             ('V0 free text', {**good, 'verses': {'1': [dict(id='a1', role='meaning', text='hi')], '2': good['verses']['2']}}, 'V0'),
             ('V0 unknown verse key', {**good, 'verses': {**good['verses'], '9': []}}, 'V0'),
             ('V1 invented id', base(['a1', 'nope'], ['a2', 'b2']), 'V1'), ('V2 wrong verse', base(['a1', 'b2'], ['a2', 'b1']), 'V2'),
             ('V3 outside scope', base(['a1', 'o1'], ['a2', 'b2']), 'V3'), ('V4 duplicate', base(['a1', 'a1'], ['a2', 'b2']), 'V4'),
             ('V5 bad role', {**good, 'verses': {'1': [dict(id='a1', role='joke'), dict(id='b1', role='meaning')], '2': good['verses']['2']}}, 'V5'),
             ('V6 verse short with usable material', base(['a1'], ['a2', 'b2']), 'V6'),
             ('V7 teacher cap', base(['t1', 't2', 't3', 't4', 't5'], ['a2', 'b2']), 'V7'),
             ('V9 boundary suspect', base(['a1', 'b1'], ['a2', 's2']), 'V9'), ('V9 invalid markup', base(['a1', 'b1'], ['a2', 'm2']), 'V9'),
             ('V10 withheld (public)', base(['a1', 'b1'], ['a2', 'w2']), 'V10'),
             ('V11 too many', base(['a1', 'b1', 'c1', 'o1', 'x1', 't1', 't2', 't3', 't4', 't5'][:0] or ['a1'], ['a2']), None),
             ('V12 predecessor missing', base(['a1', 'b1'], ['b2', 'd2']), 'V12'), ('V12 predecessor out of order', base(['a1', 'b1'], ['d2', 'a2']), 'V12'),
             ('V14 gap inside the piece', base(['a1', 'b1'], ['a2', 'g2']), 'V14'), ('gap between pieces accepted (warning)', base(['ga1', 'gb1'], ['a2', 'b2']), None),
             ('cross-ref accepted', base(['a1', 'x1'], ['a2', 'b2']), None), ('dependent pair accepted (warning)', base(['a1', 'b1'], ['a2', 'd2']), None)]
    res = []
    for name, plan, exp in cases:
        if name.startswith('V11 too many'): continue
        r = V.validate(plan, pool, req, build='public'); got = V.__dict__ and sorted({x['rule'] for x in r['rejections']})
        ok = (exp is None and r['ok']) or (exp is not None and exp in got); res.append(dict(case=name, expected=exp or 'accept', got=got or 'accepted', pass_=ok))
    w = V.validate(base(['ga1', 'gb1'], ['a2', 'b2']), pool, req, build='public')
    res.append(dict(case='gap between pieces gives a warning', expected='warning', got=sorted({x['kind'] for x in w['warnings']}), pass_=any(x['kind'] == 'gap between pieces' for x in w['warnings'])))
    # V8 budget and V11 max via options
    r = V.validate(good, pool, req, build='public', budget=300); res.append(dict(case='V8 budget', expected='V8', got=sorted({x['rule'] for x in r['rejections']}), pass_='V8' in {x['rule'] for x in r['rejections']}))
    big = [P(f'p{i}', f'k{i}', 1) for i in range(10)] + [P('q', 'q', 2), P('r', 'r', 2)]; rq = dict(req)
    r = V.validate(dict(scope=req['scope'], edition='WEB', verses={'1': [dict(id=f'p{i}', role='meaning') for i in range(10)], '2': [dict(id='q', role='meaning'), dict(id='r', role='meaning')]}), big, rq, budget=99999)
    res.append(dict(case='V11 more than 9', expected='V11', got=sorted({x['rule'] for x in r['rejections']}), pass_='V11' in {x['rule'] for x in r['rejections']}))
    gaps = V.make_gaps([P('a1', 'a', 1), P('a2', 'a', 2), P('b2', 'b', 2)], req, {'jfb': {'1': 'source absence'}}, 'public')
    r = V.validate(dict(scope=req['scope'], edition='WEB', verses={'1': [dict(id='a1', role='overview')], '2': [dict(id='a2', role='overview'), dict(id='b2', role='meaning')]}),
                   [P('a1', 'a', 1), P('a2', 'a', 2), P('b2', 'b', 2)], req, gaps=gaps, build='public')
    res.append(dict(case='thin verse with gap record accepted', expected='accept', got=[x['rule'] for x in r['rejections']] or 'accepted', pass_=r['ok'] and gaps and gaps[0]['reason'] == 'thin'))
    # V15-V18 study shapes (Nov 26): a 3-verse scope, one movement 1-3 split as [1,2],[3,3] for V17
    sp = [P('h1', 'h', 1), P('c1', 'c', 1), P('ab', 'a', 2, covers_verses=[2, 3], subject_span=[2, 3], note_span=[2, 3]), P('h3', 'h', 3), P('k1', 'k', 1), P('m1', 'm', 1),
          P('n2', 'n', 2), P('big', 'b', 1, text='x' * 2900)]
    rq3 = dict(scope='Test 1:1-3', edition='WEB', lo=1, hi=3)
    pl = lambda d: dict(scope='Test 1:1-3', edition='WEB', verses={k: [dict(id=i, role=r) for i, r in v] for k, v in d.items()})
    four = {'1': [('h1', 'meaning'), ('c1', 'doctrine')], '2': [('ab', 'meaning')], '3': [('h3', 'doctrine')]}
    shaped = [('short: 4 pieces, verse 3 covered by a 2-3 note, passes', four, 'short', None, None),
              ('short: no role repeats needed (V18)', {**four, '1': [('h1', 'meaning'), ('c1', 'meaning')]}, 'short', None, 'V18'),
              ('short: too many pieces (V15)', {**four, '1': four['1'] + [('k1', 'overview'), ('m1', 'word')], '2': [('ab', 'meaning'), ('n2', 'word')]}, 'short', None, 'V15'),
              ('short: too many characters (V15)', {**four, '1': [('big', 'meaning'), ('c1', 'doctrine')]}, 'short', None, 'V15'),
              ('short: a verse not covered (V16)', {'1': [('h1', 'meaning'), ('c1', 'doctrine'), ('k1', 'overview')], '2': [('n2', 'word')]}, 'short', None, 'V16'),
              ('short: one teacher in a movement (V17)', four, 'short', [[1, 2], [3, 3]], 'V17'),
              ('disagreement: role repeats allowed', {**four, '1': [('h1', 'meaning'), ('c1', 'meaning')]}, 'disagreement', None, None),
              ('unknown shape (V15)', four, 'long', None, 'V15')]
    for name, d, shape, moves, exp in shaped:
        r = V.validate(pl(d), sp, dict(rq3, shape=shape, movements=moves), build='public'); got = sorted({x['rule'] for x in r['rejections']})
        res.append(dict(case=name, expected=exp or 'accept', got=got or 'accepted', pass_=(exp is None and r['ok']) or (exp is not None and exp in got)))
    return res

def md(name, request, good, vres, results, gaps, bud):
    L = [f'# Validator run: {name}', '', f'Request: {request["scope"]} ({request["edition"]}), public build, budget {bud} characters (D4, approved flat 12,000).', '']
    L += ['## Gap records generated from the data', '']
    L += [f'- verse {g["verse"]}: {g["reason"]}. {g["explanation"]} (accepted_by: {g["accepted_by"] or "nobody yet"})' for g in gaps] or ['- none: every verse has the minimum usable pieces']
    L += ['', '## Stand-in plan', '', f'{vres["stats"]["picked"]} pieces, {vres["stats"]["chars"]} characters. Result: **{"PASS" if vres["ok"] else "REJECTED"}**.']
    L += [f'- REJECT {r["rule"]}: {r["msg"]}' for r in vres['rejections']]
    L += [f'- warning ({w["kind"]}): {w["msg"]}' for w in vres['warnings']]
    L += ['', '## Bad-plan suite', '', '| Case | Expected | Result | Note |', '|---|---|---|---|']
    for c in results: L.append(f'| {c["case"]} | {c["expected"]} | {c["got"]} | {c["note"]} |')
    return '\n'.join(L) + '\n'

def main(rep, out):
    os.makedirs(out, exist_ok=True); allres = {}; fails = 0
    syn = synthetic(); sf = [c for c in syn if not c['pass_']]
    for path in sorted(glob.glob(f'{rep}/diagnostic-*.json')):
        name = os.path.basename(path)[11:-5]; r, pool, cov, req = load(path); build = 'public'
        gaps = V.make_gaps(pool, req, cov, build); bud = budget_for(req['lo'], req['hi'])
        good = standin(pool, req, build); vres = V.validate(good, pool, req, gaps, build, bud)
        results = []
        for case, plan, pool2, exp, note in bad_plans(pool, req, good, build):
            if plan is None: results.append(dict(case=case, expected='-', got='skipped', note=note, pass_=True, skipped=True)); continue
            rr = V.validate(plan, pool2 or pool, req, gaps, build, bud); got = sorted({x['rule'] for x in rr['rejections']})
            okk = (exp is None and rr['ok']) or (exp is not None and exp in got)
            results.append(dict(case=case, expected=exp or 'accept', got=','.join(got) or 'accepted', note=note, pass_=okk))
        bad = [c for c in results if not c['pass_']]; fails += len(bad)
        allres[name] = dict(request=req, gaps=gaps, standin=dict(ok=vres['ok'], rejections=vres['rejections'], warnings=vres['warnings'], stats=vres['stats']), suite=results, plan=good)
        open(f'{out}/validator-{name}.md', 'w').write(md(name, req, good, vres, results, gaps, bud))
        json.dump(allres[name], open(f'{out}/validator-{name}.json', 'w'), indent=1)
        print(f'{name}: pool {len(pool)}, stand-in {"PASS" if vres["ok"] else "REJECTED " + str(vres["stats"]["rules_failed"])} ({vres["stats"]["picked"]} pcs, {vres["stats"]["chars"]}/{bud}), suite {sum(1 for c in results if c["pass_"] and not c.get("skipped"))} pass, {sum(1 for c in results if c.get("skipped"))} skipped, {len(bad)} FAIL, gaps {[ (g["verse"], g["reason"]) for g in gaps]}')
        for c in bad: print('   FAIL', c)
    print(f'synthetic: {sum(1 for c in syn if c["pass_"])}/{len(syn)} pass'); [print('   FAIL', c) for c in sf]
    json.dump(syn, open(f'{out}/validator-synthetic.json', 'w'), indent=1)
    return fails + len(sf)

if __name__ == '__main__': sys.exit(1 if main(sys.argv[1], sys.argv[2]) else 0)
