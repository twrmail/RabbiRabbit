#!/usr/bin/env python3
"""Validate, fingerprint (frame_v2) and render the John 3:16-21 studies. Plans, summaries, headings and Rabbit's own text live in
studies_jhn.py. usage: build_studies_jhn.py REPORT_JSON OUT_DIR
REPORT_JSON may be the full diagnostic or its public copy (public_pool.py); a public build gives the same results from either.
For each study: page content -> frame_v2 -> PENDING approval record over that frame -> page rendered from the frame alone.
Writes plan-jhn3-study-<K>.json, study-jhn3-<K>.html (the page an approval covers), page-jhn3-study-<K>.json (the page content, so a
record can be checked later), approval-records-jhn3.json, studies-summary.json, and studies-jhn3-16-21.html (a review bundle of the
four study pages; not itself served). No model calls."""
import json, html, re, sys, os, copy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import validator as V, run_validator as RV, fingerprints as F, studies_jhn as S, run_fingerprints as RF, study_render as SR
REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')

ALLOW = set('Matthew Henry John Calvin Gill Jamieson Fausset Brown Augustine Chrysostom Cyril God Christ Jesus Son Lord Savior Rabbit Gentiles Gentile Jews Jew Messiah'.split())
def check_say(P, pid, t):
    """Mechanical screen only: quotation marks, numbers not in the passage, some unexpected capitalized words (sentence-initial words
    and the ALLOW list are skipped). Not a check of meaning."""
    bad = []; piece = P[pid]['text']
    if re.search(r'["“”]', t): bad.append('quotation mark')
    for d in re.findall(r'\d+', t):
        if d not in piece: bad.append('number ' + d)
    for m in re.finditer(r'(?<![.!?]\s)(?<!^)\b([A-Z][a-z]+)\b', t):
        w = m.group(1)
        if w in ALLOW or w in piece or w.lower() in piece.lower().split(): continue
        bad.append('name ' + w)
    return bad

LABELS = dict(
    page_title='Rabbit study {key}: {title} ({scope})', study_heading='Study {key}: {title}', verse_heading='{place}:{verse}',
    focus="Rabbit's own focus:", take="Rabbit's own take:", verse_question="Rabbit's question:", study_question="Rabbit's question for this study:",
    closing="Rabbit's take-away:", closing_short="Rabbit's closing reflection:", ai_heading='Heading by AI', ai_summary='Modern language, by AI',
    own_words='{teacher} in his own words', covers='(this note covers {first}-{last})', gill_footnote="Gill's footnote for this quotation:",
    ibid='{raw} (the same work: {work})', jewish_source="A later Jewish writing that Gill cites; not a statement of what people believed in Jesus's day.",
    roles={'overview': 'Overview', 'meaning': 'What it means', 'word': 'The word', 'doctrine': 'The teaching', 'tension': 'Where teachers differ',
           'context': 'Background', 'application': 'Living it', 'warning': 'A warning'},
    teacher_names=S.TEACH)
NOTE = ("Private pipeline test. Built only from the John 3:16-21 teacher pieces and validated against its own scope. For every teacher "
        "passage, the modern-language summary was written by the AI stand-in (Claude; no model call) from that one passage and names the "
        "teacher. A mechanical screen rejects quotation marks, numbers not in the passage and some unexpected capitalized words; it is not a "
        "complete check for added names or for faithful meaning. The teacher's own words sit underneath, word for word. Focus, take, "
        "questions and closing are Rabbit's own and labeled so. Scripture text: WEB. Everything on this page is covered by its approval record (frame_v2).")

def credits(P, ids):
    seen = {}
    for i in ids: p = P[i]; seen.setdefault((p['teacher_key'], p['work_title']), p['rights'])
    parts = [f'{S.TEACH[k]}, {w} (rights tier {t}' + ('; public domain by age' if t in 'AB' else '') +
             ('; NPNF translation, checked against the CCEL text (pool/fathers-source-checks.json)' if k in ('augustine', 'chrysostom', 'cyril') else '') + ')'
             for (k, w), t in sorted(seen.items())]
    return ('Credits. ' + '; '.join(parts) + ". Teacher text is shown as stored. The modern-language summaries" +
            (" and headings" if any(i in S.HEAD for i in ids) else '') + " are the AI's, labeled on the page; questions and reflections are Rabbit's own.")

def page_content(st, P, WV, stats):
    ids = [i for sec in st['sections'] for i, _ in sec['ids']]; lo, hi = st['scope']
    teachers = sorted({P[i]['teacher_key'] for i in ids})
    return dict(renderer=SR.RENDERER,
                study=dict(key=st['key'], title=st['title'], shape=st.get('shape', 'full'), place='John 3', focus=st['focus'], take=st['take'],
                           question=st.get('question'), closing=st['closing'].split(': ', 1)[1]),
                scripture={str(v): WV[str(v)] for v in range(lo, hi + 1)},
                verse_questions={str(sec['verse']): sec['q'] for sec in st['sections'] if sec.get('q')},
                summaries={i: S.SAY[i] for i in ids}, headings={i: S.HEAD[i] for i in ids} if st.get('shape') == 'short' else {},
                labels=LABELS, note=NOTE, credits=credits(P, ids),
                stats_line=f"Teachers in this study: {', '.join(S.TEACH[t] for t in teachers)}. {len(ids)} passages, "
                           f"{stats['chars']:,} characters of the 12,000 allowed; validator passed.")

def plan_and_request(st, req0):
    lo, hi = st['scope']; req = copy.deepcopy(req0); req['lo'] = lo; req['hi'] = hi
    req['scope'] = f"John 3:{lo}-{hi}" if lo != hi else f"John 3:{lo}"
    plan = {"scope": req['scope'], "edition": "WEB", "verses": {str(sec['verse']): [{"id": i, "role": r} for i, r in sec['ids']] for sec in st['sections']}}
    return plan, req

def main(report, out):
    rep, pool, cov, req0 = RV.load(report); os.makedirs(out, exist_ok=True); P = {p['id']: p for p in pool}
    web = json.load(open(os.path.join(REPO, 'library', 'bible', 'WEB', 'JHN.json'))); WV = [c for c in web['chapters'] if c['chapter'] == 3][0]['verses']
    results, records, bodies, bad = {}, {}, [], 0
    for st in S.STUDIES:
        plan, req = plan_and_request(st, req0)
        gaps = V.make_gaps(pool, req, cov, 'public'); v = V.validate(plan, pool, req, gaps, 'public', V.DEFAULT_BUDGET)
        ids = [i for sec in st['sections'] for i, _ in sec['ids']]
        sb = [(i, check_say(P, i, S.SAY[i])) for i in ids]
        if st.get('shape') == 'short': sb += [(i + ' heading', check_say(P, i, S.HEAD[i])) for i in ids]
        sb = [x for x in sb if x[1]]
        json.dump(plan, open(f"{out}/plan-jhn3-study-{st['key']}.json", 'w'), indent=1)
        r = dict(title=st['title'], ok=v['ok'], stats=v['stats'], rejections=v['rejections'],
                 warnings=[(w['kind'], w.get('verse'), w['msg'][:120]) for w in v['warnings']], summary_check_failures=sb, frame_version=None, tamper_tests=None)
        if v['ok']:
            pc = page_content(st, P, WV, v['stats'])
            rec, fr = F.make_record(plan, pool, gaps, req, rep, 'public', f"John 3:{req['lo']}-{req['hi']} study {st['key']}, {st['title']}", page=pc)
            _, tests = RF.tamper_tests(plan, pool, gaps, req, rep, pc)
            records[st['key']] = rec; r.update(frame_version=rec['frame_version'], tamper_tests=f"{sum(1 for c in tests if c['pass_'])}/{len(tests)}")
            json.dump(pc, open(f"{out}/page-jhn3-study-{st['key']}.json", 'w'), indent=1, ensure_ascii=False)
            open(f"{out}/study-jhn3-{st['key']}.html", 'w').write(SR.page(fr)); bodies.append((st, SR.body(fr)))
            miss = [i for i in ids if SR.md(P[i]['text']) not in SR.page(fr)]
            if miss: bad += 1; r['verbatim_missing'] = miss
        else: bad += 1
        results[st['key']] = r
        print(st['key'], st['title'], 'validator', v['ok'], v['stats'].get('picked'), v['stats'].get('chars'), '| summary check', sb or 'ok', '| frame', r['frame_version'], '| tamper', r['tamper_tests'])
    json.dump(results, open(f'{out}/studies-summary.json', 'w'), indent=1, default=str)
    json.dump(records, open(f'{out}/approval-records-jhn3.json', 'w'), indent=1)
    nav = ' '.join(f'<a href="#s{st["key"]}">{st["key"]}. {html.escape(st["title"])}</a>' for st, _ in bodies)
    open(f'{out}/studies-jhn3-16-21.html', 'w').write(
        f'<!doctype html><meta charset=utf-8><title>John 3:16-21: review bundle</title><style>{SR.CSS}nav a{{font:15px system-ui;margin-right:1rem}}</style>'
        f'<h1>John 3:16-21: four studies (review bundle)</h1><p class=own>Each study below is its own page (study-jhn3-A.html and so on), rendered from its '
        f'frame alone; an approval covers that page. This bundle only puts them side by side.</p><nav>{nav}</nav>\n' + '\n'.join(b for _, b in bodies))
    return bad

if __name__ == '__main__': sys.exit(1 if main(*sys.argv[1:3]) else 0)
