#!/usr/bin/env python3
"""Bad-weave tests: each narrative rule must catch a weave built to break it, and the two trial weaves (EW whole passages,
EX selected sentences) must pass. usage: test_weave.py REPORT_JSON. Also checks the renderer duties: E2 (a visible ellipsis wherever
text is left out) and E3 (the whole passage one tap away for every excerpt). No model calls."""
import sys, os, copy, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import weave as W, run_validator as RV, build_studies_jhn as B, fingerprints as F, validator as V, study_render as SR, studies_jhn as S

def main(report):
    rep, pool, cov, req0 = RV.load(report); P = {p['id']: p for p in pool}
    web = json.load(open(os.path.join(B.REPO, 'library', 'bible', 'WEB', 'JHN.json'))); WV = [c for c in web['chapters'] if c['chapter'] == 3][0]['verses']
    st = {s['key']: s for s in B.live()}; plan, req = B.plan_and_request(st['EX'], req0); fp = F.pieces_fp(plan, pool)
    run = lambda w: W.validate(w, plan, pool, req, WV, S.TEACH, fp)
    fails = []
    for k in ('EW', 'EX'):
        r = run(st[k]['weave'])
        if r: fails.append(f'{k} should pass: {r}')
    base = st['EX']['weave']
    def segs(w): return w['movements'][0]['segments']
    def bridge(w, n): return [s for s in segs(w) if s['kind'] == 'bridge'][n]
    def quote(w, pid): return next(s for s in segs(w) if s.get('piece') == pid)
    cases = []
    def case(rule, why, fn):
        w = copy.deepcopy(base); fn(w); cases.append((rule, why, w))
    case('W1', 'plan_fp from another plan', lambda w: w.__setitem__('plan_fp', '0' * 64))
    case('W2', 'bridge cites a piece outside the plan', lambda w: bridge(w, 0).__setitem__('evidence', ['CAL3.16.01']))
    case('W2', 'quotes a piece outside the plan', lambda w: quote(w, 'MHC3.18.01').__setitem__('piece', 'CAL3.18.01'))
    case('W3', 'Scripture of verse 17 left out', lambda w: segs(w).remove(next(s for s in segs(w) if s.get('verse') == 17)))
    case('W3', 'movement span changed', lambda w: w['movements'][0].__setitem__('span', [16, 17]))
    def early(w):
        q = quote(w, 'AUG3.17-18.1.01'); segs(w).remove(q); segs(w).insert(1, q)
    case('W4', 'Augustine on 17 quoted before the Scripture of 17', early)
    case('W5', 'bridge names Calvin, who is not in its evidence', lambda w: bridge(w, 0).__setitem__('text', 'Calvin begins with wonder: the holy God loves a wicked world.'))
    case('W6', 'bridge adds a reference', lambda w: bridge(w, 0).__setitem__('text', 'Matthew Henry begins with wonder, as in 3:36: the holy God loves a wicked world.'))
    case('W7', 'bridge adds a number', lambda w: bridge(w, 1).__setitem__('text', 'Chrysostom measures that love by what the Father gave: his Son, for 12 ungrateful slaves.'))
    case('W7', 'bridge adds a name mid-sentence', lambda w: bridge(w, 1).__setitem__('text', 'Chrysostom measures that love as Moses would: his Son, for ungrateful slaves.'))
    case('W8', 'quotation marks in a bridge', lambda w: bridge(w, 0).__setitem__('text', 'Matthew Henry begins with "wonder": the holy God loves a wicked world.'))
    case('W9', 'a passage quoted twice', lambda w: segs(w).append(copy.deepcopy(quote(w, 'MHC3.18.01'))))
    case('W9', 'a plan passage never quoted', lambda w: segs(w).remove(quote(w, 'CHR3.16.1.01')))
    case('W10', 'one bridge over 600 characters', lambda w: bridge(w, 0).__setitem__('text', ' '.join(['the holy God loves a wicked world'] * 20)))
    case('W10', 'AI over 35% of the printed text', lambda w: [bridge(w, n).__setitem__('text', ' '.join([bridge(w, n)['text']] * 5)) for n in range(4)])
    case('W11', 'claim about teachers in general', lambda w: bridge(w, 3).__setitem__('text', 'Matthew Henry, like all the teachers, turns to the one who believes: he is not condemned.'))
    case('W12', 'bridge brings in an idea from outside its passage', lambda w: bridge(w, 2).__setitem__('text', 'The next verse says why the Son was sent. Augustine pictures a physician whose medicine is grace for every sinner.'))
    case('E1', 'sentence number past the end', lambda w: quote(w, 'MHC3.16.05').__setitem__('sentences', [0, 9]))
    case('E1', 'sentences out of order', lambda w: quote(w, 'MHC3.18.01').__setitem__('sentences', [2, 0]))
    case('E5', 'a "Yet" sentence without the one before', lambda w: quote(w, 'CHR3.16.1.01').__setitem__('sentences', [1]))
    case('E5', 'a "So" sentence without the one before', lambda w: quote(w, 'AUG3.17-18.1.01').__setitem__('sentences', [1, 3]))
    for rule, why, w in cases:
        got = {r for r, _ in run(w)}
        if rule not in got: fails.append(f'{rule} not caught ({why}); got {sorted(got) or "nothing"}')
    # E4: a printed excerpt that no longer equals the pool text at its offsets
    rw = W.resolve(base, P, WV); q = next(s for s in rw['movements'][0]['segments'] if s.get('piece') == 'MHC3.18.01'); q['parts'][0]['text'] += ' amen'
    if 'E4' not in {r for r, _ in W.check_resolved(rw, P)}: fails.append('E4 not caught (excerpt text changed after resolving)')
    n = len(cases) + 1
    # E2, E3: renderer duties, on the EX page
    gaps = V.make_gaps(pool, req, cov, 'public'); v = V.validate(plan, pool, req, gaps, 'public', V.DEFAULT_BUDGET)
    pc = B.page_content(st['EX'], P, WV, v['stats']); _, fr = F.fingerprints(plan, pool, gaps, req, rep, pc); page = SR.page(fr)
    for s in fr['weave']['movements'][0]['segments']:
        if s['kind'] != 'quote' or s['whole']: continue
        name = S.TEACH[P[s['piece']]['teacher_key']]
        need = int(s['cut_before']) + int(s['cut_after']) + sum(p['gap_before'] for p in s['parts'])
        blk = page.split(f'<div class=qt><div class=who>{name}')[1:]
        blk = next((b for b in blk if SR.md(s['parts'][0]['text']) in b), '')
        shown = blk.split('<details>')[0]
        if shown.count('…') != need: fails.append(f"E2: {s['piece']} shows {shown.count('…')} ellipses, needs {need}")
        if SR.md(P[s['piece']]['text']) not in blk.split('</details>')[0]: fails.append(f"E3: {s['piece']} whole passage not one tap away")
        n += 2
    print(f'weave tests: EW and EX checked, {n} bad weaves and renderer checks, ' + ('all pass' if not fails else f'{len(fails)} FAIL'))
    for f in fails: print('FAIL', f)
    return len(fails)

if __name__ == '__main__': sys.exit(1 if main(sys.argv[1]) else 0)
