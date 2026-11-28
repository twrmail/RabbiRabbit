#!/usr/bin/env python3
"""Themed studies for any study unit (Nov 28). The John 3:16-21 set keeps its own builder (build_studies_jhn.py); every other unit in
pool/units.json gets a study set folder pool/studies/<slug>/ prepared and built here.

  themed_set.py prepare UNIT_ID        no model calls. Builds the unit's teacher pool (run_diagnostic.py; Fathers need HCF_LOCAL, the
                                       pinned Commentaries-Database copy), keeps only tiers A/B (public_pool.py), chooses the Rabbi Road and
                                       Over the Hill destinations from the cross references (destinations.py) and builds their pools too.
  themed_set.py build SLUG             no model calls. For every full/ET*.json in the set: validator (shape 'themed'), themed-study checks,
                                       page content, frame_v2 record, tamper tests, page HTML, review page with the critic's notes. An approved
                                       record stands only while the study is unchanged byte for byte; otherwise it drops to pending, loudly.
  themed_set.py slug UNIT_ID           print the set's folder name

The model call itself is themed_study.py run --set SLUG (through the Run button)."""
import copy, glob, json, os, re, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import validator as V, run_validator as RV, fingerprints as F, run_fingerprints as RF, study_render as SR, full_study as FS
import themed_study as TS, destinations as D, books as B, run_diagnostic as RD, public_pool as PP
import build_studies_jhn as BJ
REPO = os.path.normpath(os.path.join(HERE, '..', '..'))

def slug_of(uid):
    book, ch, rng = uid.split('.'); return f'{book.lower()}{ch}-{rng}'

def _diag(book, ch, lo, hi, out_public):
    """Full pool report in a temp folder; only its public copy (tiers A/B) is written into the repo."""
    cfg = dict(label=B.ref(book, ch, lo, hi), book=book, ch=ch, lo=lo, hi=hi, abbr=B.BOOKNAMES[book][0])
    r = RD.run(os.path.join(REPO, 'library'), 'x', cfg)
    bad = [f for f in r['findings'] if f.get('kind') == 'fatal']
    if bad: raise SystemExit(f'{cfg["label"]}: pool build failed: {bad[:3]}')
    with tempfile.TemporaryDirectory() as t:
        full = os.path.join(t, 'full.json'); json.dump(r, open(full, 'w'), indent=1, ensure_ascii=False); PP.main(full, out_public)
    return r

def prepare(uid):
    if not os.environ.get('HCF_LOCAL'): raise SystemExit('set HCF_LOCAL to the pinned Commentaries-Database copy first')
    un = TS.units()[uid]; slug = slug_of(uid); sd = os.path.join(REPO, 'pool', 'studies', slug); os.makedirs(os.path.join(sd, 'destinations'), exist_ok=True)
    book, ch, lo, hi = un['book'], un['chapter'], un['start'], un['end']; report = f'diagnostic-{slug}-public.json'
    _diag(book, ch, lo, hi, os.path.join(sd, report))
    dst = D.choose(book, ch, lo, hi, lo, hi)
    if not dst or not dst.get('hill'): raise SystemExit(f'{uid}: no destinations in the cross references')
    for part in ('road', 'hill'):
        d = dst[part]; _diag(d['book'], d['chapter'], d['verse'], d['verse'], os.path.join(sd, 'destinations', f'diagnostic-{FS.slug(d)}-public.json'))
    json.dump(dict(unit=uid, report=report), open(os.path.join(sd, 'study-set.json'), 'w'))
    rp = os.path.join(sd, f'approval-records-{slug}.json')
    if not os.path.exists(rp): json.dump({}, open(rp, 'w'))
    M = TS.materials(slug)
    print(f"{slug}: {M['scope']['ref']}, {len(M['passages'])} quotable passages from {len({c['teacher_key'] for c in M['passages']})} teachers; "
          f"Rabbi Road {M['road']['ref']} ({len(M['road']['candidates'])} teacher passages), Over the Hill {M['hill']['ref']}")

def plan_sections(F_, M):
    C = {c['id']: c for c in M['passages']}; by_v = {}
    for s in F_['sections']:
        for it in s['flow']:
            if 'quote' in it and it['quote'] in C:   # under the first verse it covers in its own section (a passage on 11-14 quoted for 12-14 is 12)
                cv = C[it['quote']]['covers']; inside = set(cv) & set(s['verses'])
                by_v.setdefault(min(inside or cv), []).append((it['quote'], 'meaning'))
    return [dict(verse=v, q=None, ids=by_v[v]) for v in sorted(by_v)]

def build(slug):
    M = TS.materials(slug); sd = M['dir']; meta = json.load(open(os.path.join(sd, 'study-set.json'))); un = M['unit']
    rep, pool, cov, req0 = RV.load(os.path.join(sd, meta['report'])); P = {p['id']: p for p in pool}
    WV = FS.wv(M['book'], M['chapter']); lo, hi = M['scope']['lo'], M['scope']['hi']
    rp = os.path.join(sd, f'approval-records-{slug}.json'); prior = json.load(open(rp)) if os.path.exists(rp) else {}
    records, results, dropped, bad = {}, {}, [], 0
    for f in sorted(glob.glob(os.path.join(sd, 'full', 'ET*.json'))):
        key = os.path.basename(f)[:-5]
        if not re.fullmatch(r'ET\d*', key): continue
        d = json.load(open(f)); secs = plan_sections(d['study'], M)
        st = dict(key=key, shape='themed', scope=(lo, hi), title=d['study']['title'], themed=d, sections=secs)
        req = copy.deepcopy(req0); req.update(lo=lo, hi=hi, shape='themed', budget=40000, scope=M['scope']['ref'],
                                              movements=[[m['start'], m['end']] for m in un.get('movements') or []])
        plan = dict(scope=req['scope'], edition='WEB', verses={str(s['verse']): [dict(id=i, role=r) for i, r in s['ids']] for s in secs})
        gaps = V.make_gaps(pool, req, cov, 'public'); v = V.validate(plan, pool, req, gaps, 'public', req['budget'])
        probs, stats = TS.check(d['study'], M); ids = [i for s in secs for i, _ in s['ids']]
        r = dict(title=st['title'], validator=v['ok'], rejections=v['rejections'], checks=[f'{a}: {b}' for a, b in probs], stats=stats)
        if not v['ok'] or probs:
            bad += 1; results[key] = r; print(key, 'NOT BUILT', v['rejections'][:3], probs[:5]); continue
        pc = BJ.themed_content(st, P, WV, ids, M)
        rec, fr = F.make_record(plan, pool, gaps, req, rep, 'public', f"{M['scope']['ref']} study {key}, {st['title']}", page=pc)
        _, tests = RF.tamper_tests(plan, pool, gaps, req, rep, pc)
        tp = sum(1 for c in tests if c['pass_'])
        if tp != len(tests): bad += 1; r['tamper'] = f'{tp}/{len(tests)}'; results[key] = r; print(key, 'TAMPER TESTS FAILED', tp, len(tests)); continue
        old = prior.get(key)
        if old and old.get('status') == 'approved':
            if old.get('fingerprints') == rec['fingerprints'] and old.get('frame_version') == rec['frame_version'] and old.get('build') == rec['build']: rec = old
            else: dropped.append(key); print(f"!! APPROVAL DROPPED for {key}: the study changed since {old.get('approver')} approved it; it is pending again")
        records[key] = rec
        json.dump(plan, open(os.path.join(sd, f'plan-{slug}-study-{key}.json'), 'w'), indent=1, ensure_ascii=False)
        json.dump(pc, open(os.path.join(sd, f'page-{slug}-study-{key}.json'), 'w'), indent=1, ensure_ascii=False)
        page = SR.page(fr); open(os.path.join(sd, f'study-{slug}-{key}.html'), 'w').write(page)
        if d.get('critic'): open(os.path.join(sd, f'review-{slug}-{key}.html'), 'w').write(SR.review_page(fr, d['critic']))
        miss = [i for i in ids if SR.md(P[i]['text']) not in page]
        if miss: bad += 1; r['verbatim_missing'] = miss
        r.update(ai_share=f"{stats['ai_share']}%", tamper=f'{tp}/{len(tests)}', frame=rec['frame_version'], status=rec['status'])
        results[key] = r
        print(key, st['title'], '| quotations', stats['quotations'], 'teachers', stats['teachers'], '| AI', r['ai_share'], '| tamper', r['tamper'], '|', rec['status'])
    json.dump(records, open(rp, 'w'), indent=1)
    json.dump(results, open(os.path.join(sd, 'studies-summary.json'), 'w'), indent=1, default=str)
    if dropped: print('approvals dropped (re-review needed):', ', '.join(dropped))
    return bad == 0

def all_slugs():
    return sorted(os.path.basename(os.path.dirname(p)) for p in glob.glob(os.path.join(REPO, 'pool', 'studies', '*', 'study-set.json'))
                  if os.path.basename(os.path.dirname(p)) != 'jhn3-16-21')

if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: print(__doc__); sys.exit(0)
    if a[0] == 'prepare': prepare(a[1])
    elif a[0] == 'slug': print(slug_of(a[1]))
    elif a[0] == 'build': sys.exit(0 if all(build(s) for s in (all_slugs() if a[1] == 'all' else [a[1]])) else 1)
