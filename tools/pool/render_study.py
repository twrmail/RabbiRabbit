#!/usr/bin/env python3
"""Render a validated plan to a private HTML study page. Teacher text = stored pieces, byte-exact; headings/questions are labeled Rabbit's own.
Usage: render_study.py REPORT_JSON PLAN_JSON OUT_HTML"""
import json,html,re,sys,os
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import run_validator as RV
rep,pool,cov,req=RV.load(sys.argv[1]); P={p['id']:p for p in pool}
plan=json.load(open(sys.argv[2]))
web=json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','library','bible','WEB','JHN.json')))
WV=[c for c in web['chapters'] if c['chapter']==3][0]['verses']
FOCUS={"16":"How big is God's love, and who is it for?","17":"Did the Son come to judge or to save?","18":"What separates being saved from being condemned?","19":"Why do people turn from the light?","20":"What does the light expose?","21":"What does it look like to come to the light?"}
ROLE={'overview':'Overview','meaning':'What it means','word':'The word','doctrine':'The teaching','tension':'Where teachers differ','context':'Background','application':'Living it','warning':'A warning'}
def md(t): return re.sub(r'\*([^*]+)\*',r'<em>\1</em>',html.escape(t)).replace('\n','<br>')
NAME={'matthew-henry':'Matthew Henry','john-calvin':'John Calvin','john-gill':'John Gill','jamieson-fausset-brown':'Jamieson, Fausset & Brown','augustine':'Augustine','chrysostom':'John Chrysostom','cyril':'Cyril of Alexandria'}
n=sum(len(v) for v in plan['verses'].values()); chars=sum(len(P[i['id']]['text']) for v in plan['verses'].values() for i in v)
teachers=sorted({NAME[P[i['id']]['teacher_key']] for v in plan['verses'].values() for i in v})
out=[f'''<!doctype html><meta charset=utf-8><title>Rabbit study: John 3:16-21 (pipeline test)</title>
<style>body{{font:17px/1.55 Georgia,serif;max-width:760px;margin:2rem auto;padding:0 1rem;color:#222}}h1{{font-size:1.5rem}}h2{{margin-top:2.2rem;border-top:1px solid #ccc;padding-top:1rem}}
.v{{background:#f6f1e7;padding:.6rem .9rem;border-left:4px solid #8a6d3b}}.q{{color:#444;font-style:italic}}.t{{margin:.9rem 0;padding:.6rem .9rem;border:1px solid #ddd;border-radius:6px}}
.t small{{display:block;color:#666;font-family:system-ui;margin-bottom:.3rem}}.note{{font:14px system-ui;background:#fff8e1;border:1px solid #e6d28a;padding:.7rem;border-radius:6px}}.own{{font:14px system-ui;color:#555}}</style>
<h1>John 3:16-21: God so loved, the light came</h1>
<p class=note><b>Pipeline test, private.</b> Every teacher passage below is a stored piece, word for word from its source, chosen by a sorter (Claude standing in, no model call) and passed by the validator ({n} pieces, {chars:,} of 12,000 characters). Focus questions and headings are Rabbit's own and labeled so. No plain-English layer in this test. Verse text: WEB.</p>
<p class=own>Rabbit's own: <b>Focus.</b> Does God's love end in judgment or in rescue, and what do we do with the light?</p>''']
for v in range(16,22):
    s=str(v); out.append(f'<h2>John 3:{v}</h2><div class=v>{html.escape(WV[s])}</div><p class="q own">Rabbit\'s question: {FOCUS[s]}</p>')
    for it in plan['verses'][s]:
        p=P[it['id']]
        wide=f" (this note covers {p['covers_verses'][0]}-{p['covers_verses'][-1]})" if len(p['covers_verses'])>1 else ''
        out.append(f'<div class=t><small>{ROLE[it["role"]]} &middot; {NAME[p["teacher_key"]]} &middot; <i>{html.escape(p["work_title"][:70])}</i>{wide}</small>{md(p["text"])}</div>')
out.append(f'<p class=own>{n} passages from {len(teachers)} teachers: {", ".join(teachers)}. Fathers pieces are tier B (public-domain by age). Held back from this public view: Aquinas (tier C) and unverified Fathers (tier U).</p>')
h='\n'.join(out); open(sys.argv[3],'w').write(h)
bad=[i['id'] for v in plan['verses'].values() for i in v if md(P[i['id']]['text']) not in h]; print('pieces',n,'chars',chars,'missing',bad)
