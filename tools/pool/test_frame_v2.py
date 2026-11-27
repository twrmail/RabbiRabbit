#!/usr/bin/env python3
"""frame_v2 tests: an approval must cover every word on the study page. usage: test_frame_v2.py REPORT_JSON
Uses the live John 3:16-21 studies, narrative ones included. Each test approves a COPY of a record under the name 'TEST'; nothing here approves a real study.
 1. coverage: change any one string in the page content (summaries, headings, Rabbit's text, Scripture, labels, credits, note),
    or any one picked piece's text, and the approved record must refuse to serve. Generated over every field, not hand-picked.
 2. nothing outside the frame: every word visible on the rendered page occurs in the frame.
 3. round trip: rendering is byte-identical twice, and every teacher passage appears exactly.
 4. sentinel: a marker word put into each kind of field shows on the page, and the old approval is refused.
 5. version guard: a frame_v1 record is not servable with a page, and a frame_v2 record is not servable without one.
 6. the 13 tamper tests pass under frame_v2."""
import sys, os, re, html, copy, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fingerprints as F, validator as V, run_validator as RV, run_fingerprints as RF, study_render as SR, studies_jhn as S, build_studies_jhn as B

def leaves(o, path=()):
    if isinstance(o, str): yield path, o
    elif isinstance(o, dict):
        for k, v in o.items(): yield from leaves(v, path + (k,))
    elif isinstance(o, list):
        for i, v in enumerate(o): yield from leaves(v, path + (i,))

def set_at(o, path, val):
    for k in path[:-1]: o = o[k]
    o[path[-1]] = val

def visible_words(page_html):
    t = re.sub(r'<style>.*?</style>', ' ', page_html, flags=re.S); t = re.sub(r'<[^>]+>', ' ', t)
    return set(re.findall(r"[A-Za-z0-9]+", html.unescape(t)))

def main(report):
    rep, pool, cov, req0 = RV.load(report); P = {p['id']: p for p in pool}
    web = json.load(open(os.path.join(B.REPO, 'library', 'bible', 'WEB', 'JHN.json'))); WV = [c for c in web['chapters'] if c['chapter'] == 3][0]['verses']
    fails, counts = [], dict(coverage_fields=0, sentinels=0)
    def check(cond, msg):
        if not cond: fails.append(msg)
    for st in B.live():
        k = st['key']; plan, req = B.plan_and_request(st, req0); gaps = V.make_gaps(pool, req, cov, 'public')
        v = V.validate(plan, pool, req, gaps, 'public', V.DEFAULT_BUDGET); pc = B.page_content(st, P, WV, v['stats'])
        rec, fr = F.make_record(plan, pool, gaps, req, rep, 'public', 'test', page=pc)
        appr = F.approve(rec, 'TEST', '2000-01-01T00:00:00Z', [g['verse'] for g in gaps])
        ok, why = F.is_servable(appr, plan, pool, gaps, req, rep, pc); check(ok, f'{k}: untouched approved copy should serve: {why}')
        # 1. coverage over every page-content string and every picked piece text
        n = 0
        for path, s in leaves(pc):
            pc2 = copy.deepcopy(pc); set_at(pc2, path, s + ' x'); n += 1
            ok, why = F.is_servable(appr, plan, pool, gaps, req, rep, pc2)
            check(not ok and 'frame fingerprint does not match' in why, f'{k}: change at {path} not caught')
        for i in [x['id'] for vv in plan['verses'].values() for x in vv]:
            p2 = copy.deepcopy(pool); [p.__setitem__('text', p['text'] + ' x') for p in p2 if p['id'] == i]; n += 1
            ok, _ = F.is_servable(appr, plan, p2, gaps, req, rep, pc); check(not ok, f'{k}: piece {i} text change not caught')
        check(n > 50, f'{k}: only {n} fields walked'); counts['coverage_fields'] += n
        # 2. nothing outside the frame
        html1 = SR.page(fr); frame_words = set(); [frame_words.update(re.findall(r"[A-Za-z0-9]+", s)) for _, s in leaves(fr)]
        frame_words.update(re.findall(r"[A-Za-z0-9]+", ' '.join(str(x) for x in fr['verses'])))
        for it in (x for vd in fr['verses'].values() for x in vd['items']): frame_words.update(str(c) for c in it['covers_verses'])
        stray = visible_words(html1) - frame_words; check(not stray, f'{k}: words on the page not in the frame: {sorted(stray)[:10]}')
        # 3. round trip
        check(SR.page(fr) == html1, f'{k}: render not deterministic')
        check(all(SR.md(P[x['id']]['text']) in html1 for vv in plan['verses'].values() for x in vv), f'{k}: a teacher passage is not exact on the page')
        # 4. sentinels
        first = plan['verses'][min(plan['verses'], key=int)][0]['id']
        spots = [('credits',), ('note',), ('scripture', str(st['scope'][0]))]
        if st.get('full'):   # full study: every AI field, the destinations' Scripture and teacher text, a label
            spots += [('full', 'opening', 'text'), ('full', 'bridges', str(st['scope'][0]), 'text'), ('summaries', first), ('headings', first),
                      ('full', 'road', 'text'), ('full', 'road', 'prompt'), ('full', 'road', 'scripture'), ('full', 'road', 'quotes', 0, 'text'),
                      ('full', 'hill', 'text'), ('full', 'hill', 'scripture'), ('labels', 'road_heading'), ('study', 'title')]
            if pc['full'].get('corrections'): spots += [('full', 'corrections', 'notes', k) for k in pc['full']['corrections']['notes']] + [('full', 'corrections', 'by')]
        else: spots += [('study', 'take'), ('study', 'closing'), ('study', 'focus')]
        if st.get('full'): pass
        elif st.get('weave'):   # narrative: every bridge, and the bridge label
            segs = pc['weave']['movements'][0]['segments']
            spots += [('weave', 'movements', 0, 'segments', j, 'text') for j, sg in enumerate(segs) if sg['kind'] == 'bridge'] + [('labels', 'ai_bridge'), ('study', 'question')]
        else: spots += [('summaries', first), ('labels', 'ai_summary')]
        if st.get('weave') or st.get('full'): pass
        elif st.get('shape') == 'short': spots += [('headings', first), ('study', 'question')]
        else: spots += [('verse_questions', str(st['sections'][0]['verse']))]
        for spot in spots:
            pc2 = copy.deepcopy(pc); cur = pc2
            for kk in spot[:-1]: cur = cur[kk]
            cur[spot[-1]] = cur[spot[-1]] + ' Zqxsentinel'
            _, fr2 = F.fingerprints(plan, pool, gaps, req, rep, pc2)
            ok, _ = F.is_servable(appr, plan, pool, gaps, req, rep, pc2); counts['sentinels'] += 1
            check('Zqxsentinel' in SR.page(fr2) and not ok, f'{k}: sentinel at {spot} not shown or not refused')
        # 5. version guard
        r1, _ = F.make_record(plan, pool, gaps, req, rep, 'public', 'test'); a1 = F.approve(r1, 'TEST', '2000-01-01T00:00:00Z', [g['verse'] for g in gaps])
        ok, why = F.is_servable(a1, plan, pool, gaps, req, rep, pc); check(not ok and 'frame version differs' in why, f'{k}: v1 record served with a page')
        ok, why = F.is_servable(appr, plan, pool, gaps, req, rep); check(not ok and 'frame version differs' in why, f'{k}: v2 record served without a page')
        # 6. tamper tests under v2
        _, tests = RF.tamper_tests(plan, pool, gaps, req, rep, pc); check(all(c['pass_'] for c in tests), f'{k}: tamper tests failed')
    print(f"frame_v2 tests: {len(B.live())} studies, {counts['coverage_fields']} fields changed one at a time, {counts['sentinels']} sentinels, "
          f"{'all pass' if not fails else str(len(fails)) + ' FAIL'}")
    for f in fails[:20]: print('FAIL', f)
    return len(fails)

if __name__ == '__main__': sys.exit(1 if main(sys.argv[1]) else 0)
