#!/usr/bin/env python3
"""Validate, fingerprint and render the John 3:16-21 studies (plans, summaries and Rabbit's own text live in studies_jhn.py).
usage: build_studies_jhn.py REPORT_JSON OUT_DIR
REPORT_JSON may be the full diagnostic or its public copy (public_pool.py); a public build gives the same results from either.
Writes: plan-jhn3-study-<K>.json, studies-summary.json (validator, summary/heading checks, tamper tests), approval-records-jhn3.json
(PENDING; only a named human approves) and studies-jhn3-16-21.html. No model calls."""
import json,html,re,sys,os,copy
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import validator as V, run_validator as RV, fingerprints as F, studies_jhn as S, run_fingerprints as RF
REPO=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..')
rep,pool,cov,req0=RV.load(sys.argv[1]); out=sys.argv[2]; os.makedirs(out,exist_ok=True); P={p['id']:p for p in pool}
ALLOW=set('Matthew Henry John Calvin Gill Jamieson Fausset Brown Augustine Chrysostom Cyril God Christ Jesus Son Lord Savior Rabbit Gentiles Gentile Jews Jew Messiah'.split())
def check_say(pid,t):
    bad=[]; piece=P[pid]['text']
    if re.search(r'["“”]',t): bad.append('quotation mark')
    for d in re.findall(r'\d+',t):
        if d not in piece: bad.append('number '+d)
    for m in re.finditer(r'(?<![.!?]\s)(?<!^)\b([A-Z][a-z]+)\b',t):
        w=m.group(1)
        if w in ALLOW or w in piece or w.lower()+'' in piece.lower().split(): continue
        bad.append('name '+w)
    return bad
def md(t): return re.sub(r'\*([^*]+)\*',r'<em>\1</em>',html.escape(t)).replace('\n','<br>')
results={}; pages=[]; records={}
for st in S.STUDIES:
    lo,hi=st['scope']; req=copy.deepcopy(req0); req['lo']=lo; req['hi']=hi
    req['scope']=f"John 3:{lo}-{hi}" if lo!=hi else f"John 3:{lo}"
    plan={"scope":req['scope'],"edition":"WEB","verses":{str(sec['verse']):[{"id":i,"role":r} for i,r in sec['ids']] for sec in st['sections']}}
    gaps=V.make_gaps(pool,req,cov,'public'); v=V.validate(plan,pool,req,gaps,'public',V.DEFAULT_BUDGET)
    sb=[(i,check_say(i,S.SAY[i])) for sec in st['sections'] for i,_ in sec['ids']]
    if st.get('shape')=='short': sb+=[(i+' heading',check_say(i,S.HEAD[i])) for sec in st['sections'] for i,_ in sec['ids']]
    sb=[x for x in sb if x[1]]
    rec=None; tamper=None
    if v['ok']:
        rec,_=F.make_record(plan,pool,gaps,req,rep,'public',f"John 3:{lo}-{hi} study {st['key']}, {st['title']} (Fathers checked against CCEL)")
        _,tests=RF.tamper_tests(plan,pool,gaps,req,rep); tamper=f"{sum(1 for c in tests if c['pass_'])}/{len(tests)}"
        records[st['key']]=rec
    teachers=sorted({P[i]['teacher_key'] for sec in st['sections'] for i,_ in sec['ids']})
    results[st['key']]=dict(title=st['title'],ok=v['ok'],stats=v['stats'],rejections=v['rejections'],warnings=[(w['kind'],w.get('verse'),w['msg'][:120]) for w in v['warnings']],summary_check_failures=sb,teachers=len(teachers),tamper_tests=tamper)
    json.dump(plan,open(f"{out}/plan-jhn3-study-{st['key']}.json",'w'),indent=1)
    print(st['key'],st['title'],'validator',v['ok'],v['stats']['picked'],v['stats']['chars'],'| summary check',sb or 'ok','| teachers',len(teachers),'| rej',v['rejections'][:2],'| warn',[w['kind'] for w in v['warnings']])
results_json=results
json.dump(results,open(f'{out}/studies-summary.json','w'),indent=1,default=str)
json.dump(records,open(f'{out}/approval-records-jhn3.json','w'),indent=1)
# ---------------- render ----------------
web=json.load(open(os.path.join(REPO,'library','bible','WEB','JHN.json'))); WV=[c for c in web['chapters'] if c['chapter']==3][0]['verses']
def cite_html(p):
    if not p.get('citations'): return ''
    c='; '.join(html.escape((x['raw'] if not x.get('ibid') else x['raw']+' (the same work: '+str(x['work'])+')')) for x in p['citations'])
    late=' A later Jewish writing that Gill cites; not a statement of what people believed in Jesus&rsquo;s day.' if p.get('jewish_source') else ''
    return f'<div class=cite>Gill&rsquo;s footnote for this quotation: {c}.{late}</div>'
ROLE={'overview':'Overview','meaning':'What it means','word':'The word','doctrine':'The teaching','tension':'Where teachers differ','context':'Background','application':'Living it','warning':'A warning'}
css='''body{font:17px/1.6 Georgia,serif;max-width:780px;margin:1.5rem auto;padding:0 1rem;color:#222}h1{font-size:1.5rem;margin-bottom:.2rem}h2{margin-top:2.4rem;border-top:3px solid #8a6d3b;padding-top:.8rem}h3{font-size:1.05rem;margin:1.6rem 0 .3rem}
.v{background:#f6f1e7;padding:.6rem .9rem;border-left:4px solid #8a6d3b}.own{font:14px system-ui;color:#555}.q{font:italic 16px Georgia;color:#444;margin:.6rem 0}
.t{margin:.8rem 0;padding:.6rem .9rem;border:1px solid #ddd;border-radius:6px}.who{font:600 14px system-ui;color:#333}.who span{font-weight:400;color:#666}.say{margin:.35rem 0}
.cite{font:12px system-ui;color:#6b5a2e;margin-top:.4rem;border-left:3px solid #d9c9a0;padding-left:.5rem}.ai{font:11px system-ui;letter-spacing:.04em;color:#8a6d3b;text-transform:uppercase}details{margin-top:.4rem}summary{font:13px system-ui;color:#555;cursor:pointer}.words{font-size:15px;margin-top:.4rem;color:#333}
.note{font:14px system-ui;background:#fff8e1;border:1px solid #e6d28a;padding:.7rem;border-radius:6px}nav a{font:15px system-ui;margin-right:1rem}.head{font:600 15px system-ui;color:#5a4520;margin:.2rem 0}.head .ai{margin-left:.4rem}.credits{font:13px system-ui;color:#555;margin-top:1.4rem;border-top:1px solid #ddd;padding-top:.6rem}'''
H=[f'<!doctype html><meta charset=utf-8><title>Three Rabbit studies: John 3:16-21</title><style>{css}</style><h1>John 3:16-21: three studies</h1>',
 '<p class=note><b>Private pipeline test.</b> Each study is built only from the John 3:16-21 teacher pieces, each validated against its own scope. For every teacher passage: the <b>modern-language summary</b> was written by the AI stand-in (Claude; no model call) from that one passage, and names the teacher. A mechanical screen rejects quotation marks, numbers not in the passage and some unexpected capitalized words; it is not a complete check for added names or for faithful meaning; the <b>teacher\'s own words</b> sit underneath, word for word. Focus questions, study questions, take-aways and closing reflections are Rabbit\'s own and labeled so. Study D also gives each passage a short heading, written by the AI stand-in from that one passage and labeled. Scripture text: WEB.</p>',
 '<nav>'+' '.join(f'<a href="#s{st["key"]}">{st["key"]}. {st["title"]}</a>' for st in S.STUDIES)+'</nav>']
for st in S.STUDIES:
    ids=[i for sec in st['sections'] for i,_ in sec['ids']]; teachers=sorted({P[i]['teacher_key'] for i in ids}); r=results[st['key']]
    H.append(f'<h2 id="s{st["key"]}">Study {st["key"]}: {st["title"]}</h2><p class=own>Rabbit\'s own focus: <b>{html.escape(st["focus"])}</b><br>Rabbit\'s own take: {html.escape(st["take"])}<br>Teachers in this study: {", ".join(S.TEACH[t] for t in teachers)}. {len(ids)} passages, {r["stats"]["chars"]:,} characters of the 12,000 allowed; validator {"passed" if r["ok"] else "FAILED"}.</p>')
    for sec in st['sections']:
        v=sec['verse']; H.append(f'<h3>John 3:{v}</h3><div class=v>{html.escape(WV[str(v)])}</div>'+(f'<p class=q><span class=own>Rabbit\'s question:</span> {html.escape(sec["q"])}</p>' if sec.get('q') else ''))
        for i,role in sec['ids']:
            p=P[i]; wide=f" (this note covers {p['covers_verses'][0]}-{p['covers_verses'][-1]})" if len(p['covers_verses'])>1 else ''
            H.append(f'<div class=t><div class=who>{S.TEACH[p["teacher_key"]]} <span>&middot; {ROLE[role]} &middot; {html.escape(p["work_title"][:60])}{wide}</span></div>'+(f'<div class=head>{html.escape(S.HEAD[i])} <span class=ai>Heading by AI</span></div>' if st.get('shape')=='short' else '')+f'<div class=ai>Modern language, by AI</div><div class=say>{html.escape(S.SAY[i])}</div><details><summary>{S.TEACH[p["teacher_key"]]} in his own words</summary><div class=words>{md(p["text"])}{cite_html(p)}</div></details></div>')
    if st.get('question'): H.append(f'<p class=q><span class=own>Rabbit\'s question for this study:</span> {html.escape(st["question"])}</p>')
    H.append(f'<p class=q><span class=own>{"Rabbit\'s closing reflection" if st.get("shape")=="short" else "Rabbit\'s take-away"}:</span> {html.escape(st["closing"].split(": ",1)[1])}</p>')
seen={}
for st in S.STUDIES:
    for sec in st['sections']:
        for i,_ in sec['ids']: p=P[i]; seen.setdefault((p['teacher_key'],p['work_title'][:60]),p['rights'])
H.append('<div class=credits><b>Credits.</b> '+'; '.join(f'{S.TEACH[k]}, <i>{html.escape(w)}</i> (rights tier {t}{"; public domain by age" if t in "AB" else ""}{"; NPNF translation, checked against the CCEL text (pool/fathers-source-checks.json)" if k in ("augustine","chrysostom","cyril") else ""})' for (k,w),t in sorted(seen.items()))+'. Teacher text is shown as stored. The modern-language summaries (and Study D\'s headings) are the AI\'s, labeled on the page; questions and reflections are Rabbit\'s own.</div>')
open(f'{out}/studies-jhn3-16-21.html','w').write('\n'.join(H))
# exactness: every teacher passage on the page matches its stored piece
h='\n'.join(H); miss=[i for st in S.STUDIES for sec in st['sections'] for i,_ in sec['ids'] if md(P[i]['text']) not in h]; print('verbatim missing:',miss)
