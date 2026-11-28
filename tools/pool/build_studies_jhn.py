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
import validator as V, run_validator as RV, fingerprints as F, studies_jhn as S, run_fingerprints as RF, study_render as SR, weave as WE, full_study as FS, themed_study as TS
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
LABELS_FULL = dict(LABELS, page_title='Rabbit study {key}: {title} ({scope})', study_heading='Study {key}: {title}', ai_text='Written by AI',
    opening='Opening', road_heading='🕍 Rabbi Road', road_line='Returning by way of {ref}:', hill_heading="🐇 What's Over the Hill", prompt='💬',
    rabbit_note="Rabbit's note:",
    road_votes='(chosen by code: the top cross-reference for this passage at OpenBible.info, {votes} votes)', hill_votes='(chosen by code: one hop on from {road}, {votes} votes)')
NOTE_FULL = "Scripture and public-domain commentary, with a narrative written by AI."
LABELS_THEMED = dict(LABELS_FULL, sources_heading='Sources consulted', ellipsis='…', whole_passage='Read the whole passage from {teacher}',
    scripture_ref='{place}:{verse}')
CREDITS_THEMED = 'RabbiRabbit weaves these sources together. Check every quotation against your own Bible and commentaries before teaching.'

def themed_content(st, P, WV, ids):
    d = st['themed']; Fs = d['study']; M = TS.materials(); C = {c['id']: c for c in M['passages']}
    q = [c for c in M['road']['candidates'] if c['id'] in Fs['rabbi_road']['quote']]; q.sort(key=lambda c: Fs['rabbi_road']['quote'].index(c['id']))
    secs = []
    for s in Fs['sections']:
        flow = []
        for it in s['flow']:
            if 'quote' in it:
                c = C[it['quote']]; t, lead, tail = TS.excerpt(c, it['from'], it['to'])
                flow.append(dict(kind='quote', id=c['id'], teacher=c['teacher'], work=c['work'], text=t, lead='yes' if lead else 'no', tail='yes' if tail else 'no'))
            else: flow.append(dict(kind='text', text=it['text'], evidence=it['evidence']))
        secs.append(dict(heading=s['heading'], verses=[str(v) for v in s.get('verses') or []], flow=flow))
    seen = {}
    for i in ids: seen.setdefault((P[i]['teacher_key'], P[i]['work_title']), P[i]['rights'])
    for c in q: seen.setdefault((c['teacher_key'], c['work']), c['rights'])
    src = [f'{S.TEACH[k]}, {w}' + (' (public domain)' if t in 'AB' else '') +
           ('; NPNF translation, checked against the CCEL text' if k in ('augustine', 'chrysostom', 'cyril') else '') for (k, w), t in sorted(seen.items(), key=lambda x: (S.TEACH[x[0][0]], x[0][1] or ''))]
    src += ['Scripture: World English Bible (public domain)', 'Cross references: OpenBible.info (CC BY)']
    return dict(renderer=SR.THEMED, full=dict(model=d['model'], built=d['built'], title=Fs['title'], opening=Fs['opening'], sections=secs,
                road=dict(ref=M['road']['ref'], votes=str(M['road']['votes']), scripture=M['road']['scripture'], text=Fs['rabbi_road']['text'],
                          evidence=Fs['rabbi_road']['evidence'], prompt=Fs['rabbi_road']['prompt'],
                          quotes=[dict(id=c['id'], teacher=c['teacher'], work=c['work'], text=c['text']) for c in q]),
                hill=dict(ref=M['hill']['ref'], votes=str(M['hill']['votes']), scripture=M['hill']['scripture'], text=Fs['over_the_hill']['text'], evidence=Fs['over_the_hill']['evidence']),
                sources=src),
                study=dict(key=st['key'], title=Fs['title'], shape='themed', place='John 3'),
                scripture={str(v): WV[str(v)] for v in range(st['scope'][0], st['scope'][1] + 1)}, verse_questions={}, summaries={}, headings={},
                labels=LABELS_THEMED, note=NOTE_FULL, credits=CREDITS_THEMED,
                stats_line=f"{len(ids)} quotations from {len({P[i]['teacher_key'] for i in ids})} teachers; validator and themed-study checks passed.")

LABELS_NARRATIVE = dict(LABELS, ai_bridge='Bridge by AI', ellipsis='…', whole_passage='Read the whole passage from {teacher}')
NOTE = ("Private pipeline test. Built only from the John 3:16-21 teacher pieces and validated against its own scope. For every teacher "
        "passage, the modern-language summary was written by the AI stand-in (Claude; no model call) from that one passage and names the "
        "teacher. A mechanical screen rejects quotation marks, numbers not in the passage and some unexpected capitalized words; it is not a "
        "complete check for added names or for faithful meaning. The teacher's own words sit underneath, word for word. Focus, take, "
        "questions and closing are Rabbit's own and labeled so. Scripture text: WEB. Everything on this page is covered by its approval record (frame_v2).")

NOTE_NARRATIVE = ("Private pipeline test: a narrative trial of Study E's plan. Scripture (WEB) and the teachers' words are printed by code, "
    "exactly as stored; where only some sentences are shown, a visible ellipsis marks what is left out and the whole passage is one tap "
    "away. The short bridges between them were written by the AI stand-in (Claude; no model call) and are labeled. A mechanical check "
    "requires each bridge's words to come from the passages it cites or the Scripture, and rejects quotation marks and claims about what "
    "teachers hold in general; it is not a check of faithful meaning. Focus, take, question and closing are Rabbit's own.")

def credits(P, ids, narrative=False):
    seen = {}
    for i in ids: p = P[i]; seen.setdefault((p['teacher_key'], p['work_title']), p['rights'])
    parts = [f'{S.TEACH[k]}, {w} (rights tier {t}' + ('; public domain by age' if t in 'AB' else '') +
             ('; NPNF translation, checked against the CCEL text (pool/fathers-source-checks.json)' if k in ('augustine', 'chrysostom', 'cyril') else '') + ')'
             for (k, w), t in sorted(seen.items())]
    if narrative: return 'Credits. ' + '; '.join(parts) + ". Teacher text is shown as stored. The bridges are the AI's, labeled on the page; the question and closing are Rabbit's own."
    return ('Credits. ' + '; '.join(parts) + ". Teacher text is shown as stored. The modern-language summaries" +
            (" and headings" if any(i in S.HEAD for i in ids) else '') + " are the AI's, labeled on the page; questions and reflections are Rabbit's own.")

def full_content(st, P, WV, ids, teachers):
    d = st['full']; Fs = d['study']; M = FS.materials(profile=d.get('profile', 'strict')); lo, hi = st['scope']
    q = [c for c in M['road']['candidates'] if c['id'] in Fs['rabbi_road']['quote']]; q.sort(key=lambda c: Fs['rabbi_road']['quote'].index(c['id']))
    seen = {}
    for i in ids: seen.setdefault((P[i]['teacher_key'], P[i]['work_title']), P[i]['rights'])
    for c in q: seen.setdefault((c['teacher_key'], c['work']), c['rights'])
    cred = ('Credits. ' + '; '.join(f'{S.TEACH[k]}, {w} (rights tier {t}' + ('; public domain by age' if t in 'AB' else '') +
            ('; NPNF translation, checked against the CCEL text (pool/fathers-source-checks.json)' if k in ('augustine', 'chrysostom', 'cyril') else '') + ')'
            for (k, w), t in sorted(seen.items())) +
            '. Scripture: World English Bible (public domain). Cross references: OpenBible.info (CC BY). Scripture and teacher text are shown exactly as stored; the narrative around them is written by AI.')
    nm = sorted({S.TEACH[t] for t in teachers} | {c['teacher'] for c in q})
    cor = d.get('corrections')
    return dict(renderer=SR.FULL, full=dict(model=d['model'], built=d['built'], title=Fs['title'], opening=Fs['opening'],
                **(dict(corrections=dict(by=cor['by'], date=cor['date'], fields=cor['fields'], notes={str(n['after_verse']): n['text'] for n in cor['notes']})) if cor else {}),
                bridges={str(b['verse']): b['bridge'] for b in Fs['body'] if b.get('bridge')},
                road=dict(ref=M['road']['ref'], votes=str(M['road']['votes']), scripture=M['road']['scripture'], text=Fs['rabbi_road']['text'],
                          evidence=Fs['rabbi_road']['evidence'], prompt=Fs['rabbi_road']['prompt'],
                          quotes=[dict(id=c['id'], teacher=c['teacher'], work=c['work'], text=c['text']) for c in q]),
                hill=dict(ref=M['hill']['ref'], votes=str(M['hill']['votes']), scripture=M['hill']['scripture'], text=Fs['over_the_hill']['text'], evidence=Fs['over_the_hill']['evidence'])),
                study=dict(key=st['key'], title=Fs['title'], shape='full', place='John 3'),
                scripture={str(v): WV[str(v)] for v in range(lo, hi + 1)}, verse_questions={},
                summaries={p['piece']: p['summary'] for b in Fs['body'] for p in b['pieces']}, headings={p['piece']: p['heading'] for b in Fs['body'] for p in b['pieces']},
                labels=LABELS_FULL, note=NOTE_FULL, credits=cred,
                stats_line=f"Teachers in this study: {', '.join(nm)}. {len(ids)} passages on John 3:{lo}-{hi}, {len(q)} on {M['road']['ref']}; validator and full-study checks passed.")

def page_content(st, P, WV, stats):
    ids = [i for sec in st['sections'] for i, _ in sec['ids']]; lo, hi = st['scope']
    teachers = sorted({P[i]['teacher_key'] for i in ids})
    if st.get('full'): return full_content(st, P, WV, ids, teachers)
    if st.get('themed'): return themed_content(st, P, WV, ids)
    if st.get('weave'):
        return dict(renderer=SR.NARRATIVE, weave=st['weave'],
                    study=dict(key=st['key'], title=st['title'], shape=st.get('shape', 'full'), place='John 3', focus=st['focus'], take=st['take'],
                               question=st.get('question'), closing=st['closing'].split(': ', 1)[1]),
                    scripture={str(v): WV[str(v)] for v in range(lo, hi + 1)}, verse_questions={}, summaries={}, headings={},
                    labels=LABELS_NARRATIVE, note=NOTE_NARRATIVE, credits=credits(P, ids, narrative=True),
                    stats_line=f"Teachers in this study: {', '.join(S.TEACH[t] for t in teachers)}. {len(ids)} passages; validator and weave checks passed.")
    return dict(renderer=SR.RENDERER,
                study=dict(key=st['key'], title=st['title'], shape=st.get('shape', 'full'), place='John 3', focus=st['focus'], take=st['take'],
                           question=st.get('question'), closing=st['closing'].split(': ', 1)[1]),
                scripture={str(v): WV[str(v)] for v in range(lo, hi + 1)},
                verse_questions={str(sec['verse']): sec['q'] for sec in st['sections'] if sec.get('q')},
                summaries={i: S.SAY[i] for i in ids}, headings={i: S.HEAD[i] for i in ids} if st.get('shape') == 'short' else {},
                labels=LABELS, note=NOTE, credits=credits(P, ids),
                stats_line=f"Teachers in this study: {', '.join(S.TEACH[t] for t in teachers)}. {len(ids)} passages, "
                           f"{stats['chars']:,} characters of the 12,000 allowed; validator passed.")

def movements():
    u = json.load(open(os.path.join(REPO, 'pool', 'units.json'))); us = u['units'] if isinstance(u, dict) and 'units' in u else u
    return [[m['start'], m['end']] for m in next(x for x in us if x['id'] == 'JHN.3.16-21')['movements']]

def live(): return [st for st in S.STUDIES if not st.get('retired')]

# W11 (weave design revisions, Nov 26): AI and Rabbit text claims only what the cited passages say, never what teachers or a tradition
# hold in general. This catches the checkable phrasing; the rest is human review.
W11 = re.compile(r"\bagree|\ball (?:the |these )?(?:teachers|commentators|fathers)\b|\bthe church (?:has )?always\b|\btradition (?:holds|teaches)\b", re.I)
def summary_cap(P, pid): return max(150, len(P[pid]['text']) // 2)

def plan_and_request(st, req0):
    lo, hi = st['scope']; req = copy.deepcopy(req0); req['lo'] = lo; req['hi'] = hi
    if st.get('shape'): req['shape'] = st['shape']; req['movements'] = movements()
    if st.get('themed'): req['budget'] = 40000   # whole-passage characters; the printed excerpts are limited by themed_study.py (T5)
    req['scope'] = f"John 3:{lo}-{hi}" if lo != hi else f"John 3:{lo}"
    plan = {"scope": req['scope'], "edition": "WEB", "verses": {str(sec['verse']): [{"id": i, "role": r} for i, r in sec['ids']] for sec in st['sections']}}
    return plan, req

def main(report, out):
    rep, pool, cov, req0 = RV.load(report); os.makedirs(out, exist_ok=True); P = {p['id']: p for p in pool}
    web = json.load(open(os.path.join(REPO, 'library', 'bible', 'WEB', 'JHN.json'))); WV = [c for c in web['chapters'] if c['chapter'] == 3][0]['verses']
    results, records, bodies, bad = {}, {}, [], 0
    rp = f'{out}/approval-records-jhn3.json'; prior = json.load(open(rp)) if os.path.exists(rp) else {}; dropped = []
    for st in live():
        plan, req = plan_and_request(st, req0)
        gaps = V.make_gaps(pool, req, cov, 'public'); v = V.validate(plan, pool, req, gaps, 'public', req.get('budget', V.DEFAULT_BUDGET))
        ids = [i for sec in st['sections'] for i, _ in sec['ids']]
        sb = [] if st.get('weave') or st.get('full') or st.get('themed') else [(i, check_say(P, i, S.SAY[i])) for i in ids]
        if st.get('themed'):
            tp, fstats = TS.check(st['themed']['study'], TS.materials()); sb += [(rule, [msg]) for rule, msg in tp]
        elif st.get('full'):
            pf = st['full'].get('profile', 'strict'); fp, fstats = FS.check(st['full']['study'], FS.materials(profile=pf), profile=pf); sb += [(rule, [msg]) for rule, msg in fp]
        elif st.get('weave'):
            wf = WE.validate(st['weave'], plan, pool, req, WV, S.TEACH, F.pieces_fp(plan, pool))
            sb += [(rule, [msg]) for rule, msg in wf]
        elif st.get('shape') == 'short': sb += [(i + ' heading', check_say(P, i, S.HEAD[i])) for i in ids]
        if not (st.get('weave') or st.get('full') or st.get('themed')): sb += [(i, [f'summary {len(S.SAY[i])} characters; cap {summary_cap(P, i)} (half the passage, floor 150)']) for i in ids if len(S.SAY[i]) > summary_cap(P, i)]
        own = ([n['text'] for n in st['full']['corrections']['notes']] if st.get('full', {}).get('corrections') else []) if st.get('full') else [] if st.get('themed') else [st['focus'], st['take'], st['closing'], st.get('question') or ''] + [sec['q'] or '' for sec in st['sections']]
        sb += [('W11', [f'claims beyond the cited passages: {m.group(0)!r} in {t[:60]!r}']) for t in own + ([] if st.get('weave') or st.get('full') or st.get('themed') else [S.SAY[i] for i in ids] + [S.HEAD.get(i, '') for i in ids]) for m in [W11.search(t)] if m]
        sb = [x for x in sb if x[1]]
        json.dump(plan, open(f"{out}/plan-jhn3-study-{st['key']}.json", 'w'), indent=1)
        r = dict(title=st['title'], ok=v['ok'], stats=v['stats'], rejections=v['rejections'],
                 warnings=[(w['kind'], w.get('verse'), w['msg'][:120]) for w in v['warnings']], summary_check_failures=sb, frame_version=None, tamper_tests=None)
        if sb: bad += 1
        if v['ok']:
            if st.get('full') or st.get('themed'): r['ai_share'] = f"{fstats['ai_share']}%"; r['teacher_chars_printed'] = fstats['teacher_chars']
            elif st.get('weave'):
                rw = WE.resolve(st['weave'], P, WV); segs = [x for m in rw['movements'] for x in m['segments']]
                ai = sum(len(x['text']) for x in segs if x['kind'] == 'bridge'); tch = sum(len(p['text']) for x in segs if x['kind'] == 'quote' for p in x['parts'])
                r['ai_share'] = f"{100 * ai // (ai + tch + sum(len(t) for t in own))}%"; r['teacher_chars_printed'] = tch
            else:
                ai = sum(len(S.SAY[i]) for i in ids) + (sum(len(S.HEAD[i]) for i in ids) if st.get('shape') == 'short' else 0)
                r['ai_share'] = f"{100 * ai // (ai + v['stats']['chars'] + sum(len(t) for t in own))}%"
            pc = page_content(st, P, WV, v['stats'])
            rec, fr = F.make_record(plan, pool, gaps, req, rep, 'public', f"John 3:{req['lo']}-{req['hi']} study {st['key']}, {st['title']}", page=pc)
            _, tests = RF.tamper_tests(plan, pool, gaps, req, rep, pc)
            old = prior.get(st['key'])
            if old and old.get('status') == 'approved':
                if old.get('fingerprints') == rec['fingerprints'] and old.get('frame_version') == rec['frame_version'] and old.get('build') == rec['build']:
                    rec = old                       # unchanged byte for byte: Rabbit's approval stands
                else:
                    dropped.append(st['key']); print(f"!! APPROVAL DROPPED for {st['key']}: the study changed since {old.get('approver')} approved it; it is pending again")
            records[st['key']] = rec; r.update(frame_version=rec['frame_version'], tamper_tests=f"{sum(1 for c in tests if c['pass_'])}/{len(tests)}")
            json.dump(pc, open(f"{out}/page-jhn3-study-{st['key']}.json", 'w'), indent=1, ensure_ascii=False)
            open(f"{out}/study-jhn3-{st['key']}.html", 'w').write(SR.page(fr)); bodies.append((st, SR.body(fr)))
            if (st.get('full') or st.get('themed') or {}).get('critic'):   # review copy for Tom: the page plus the critic's notes. Not covered by the approval, never served.
                open(f"{out}/review-jhn3-{st['key']}.html", 'w').write(SR.review_page(fr, (st.get('full') or st.get('themed'))['critic']))
            miss = [i for i in ids if SR.md(P[i]['text']) not in SR.page(fr)]
            if miss: bad += 1; r['verbatim_missing'] = miss
        else: bad += 1
        results[st['key']] = r
        print(st['key'], st.get('shape', 'full'), st['title'], 'validator', v['ok'], v['rejections'][:2] if not v['ok'] else '', v['stats'].get('picked'), v['stats'].get('chars'), '| AI', r.get('ai_share'), '| checks', sb or 'ok', '| frame', r['frame_version'], '| tamper', r['tamper_tests'])
    json.dump(results, open(f'{out}/studies-summary.json', 'w'), indent=1, default=str)
    json.dump(records, open(f'{out}/approval-records-jhn3.json', 'w'), indent=1)
    if dropped: print('approvals dropped (re-review needed):', ', '.join(dropped))
    nav = ' '.join(f'<a href="#s{st["key"]}">{st["key"]}. {html.escape(st["title"])}</a>' for st, _ in bodies)
    open(f'{out}/studies-jhn3-16-21.html', 'w').write(
        f'<!doctype html><meta charset=utf-8><title>John 3:16-21: review bundle</title><style>{SR.NCSS}nav a{{font:15px system-ui;margin-right:1rem}}</style>'
        f'<h1>John 3:16-21: studies (review bundle)</h1><p class=own>Each study below is its own page (study-jhn3-A.html and so on), rendered from its '
        f'frame alone; an approval covers that page. This bundle only puts them side by side.</p><nav>{nav}</nav>\n' + '\n'.join(b for _, b in bodies))
    return bad

if __name__ == '__main__': sys.exit(1 if main(*sys.argv[1:3]) else 0)
