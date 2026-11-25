import json,glob,os,html,sys
R,VAL,FP,OUT=sys.argv[1:5]
e=lambda s:html.escape(str(s))
names=[os.path.basename(p)[11:-5] for p in sorted(glob.glob(f'{R}/diagnostic-*.json'))]
summ=json.load(open(f'{VAL}/sorter-summary.json'))
def tbl(head,rows):
    return '<table><tr>'+''.join(f'<th>{e(h)}</th>' for h in head)+'</tr>'+''.join('<tr>'+''.join(f'<td>{c}</td>' for c in r)+'</tr>' for r in rows)+'</table>'
def frame_block(fr):
    o=''
    for v,b in fr['verses'].items():
        o+=f'<h4>Verse {e(v)}</h4>'
        for it in b['items']:
            o+=f'<div class="pc"><span class="tag">{e(it["role"])}</span> <b>{e(it["id"])}</b> · {e(it.get("teacher",""))} · <i>{e(it.get("work",""))}</i><p>{e(it["text"])}</p></div>'
        if b.get('gap_line'): o+=f'<p class="gap">{e(b["gap_line"])}</p>'
    return o
tabs='';panes=''
for i,n in enumerate(names):
    d=json.load(open(f'{R}/diagnostic-{n}.json')); v=json.load(open(f'{VAL}/validator-{n}.json')); s=summ[n]; sm=d['summary']
    h=f'<h2>{e(d["passage"])}</h2><p class="priv">PRIVATE DIAGNOSTIC: shows withheld-tier (C/U/W) pieces in counts. Not for public build.</p>'
    h+=f'<p>Pool: <b>{sm["pieces"]}</b> pieces, <b>{sm["chars"]:,}</b> chars. Source fingerprint <code>{e(d["source_fingerprint_sha256"] or "NONE: a source failed to load")}</code></p>'
    h+='<h3>Coverage per source per verse</h3>'
    verses=sorted({int(k) for src in d['matrix'].values() for k in src})
    h+=tbl(['source']+[str(x) for x in verses],[[e(sn)]+[e(d['matrix'][sn].get(str(x),'')) for x in verses] for sn in d['matrix']])
    h+='<h3>Pieces and characters</h3>'+tbl(['teacher_key','pieces','chars'],[[e(k),sm['pieces_by_teacher_key'][k],f'{sm["chars_by_teacher_key"][k]:,}'] for k in sm['pieces_by_teacher_key']])
    pv=sm.get('per_anchor_verse',{})
    h+=tbl(['anchor verse','pieces','chars','teachers'],[[e(k),x['pieces'],x['chars'],e(', '.join(x['teacher_keys']))] for k,x in pv.items()])
    h+='<h3>Sections examined (source index entries)</h3>'
    rows=[]
    for sn,sd in d['sources'].items():
        for vk,c in (sd.get('coverage') or {}).items():
            rows.append([e(sn),e(vk),e(c.get('state','')),e(c.get('note_id','')),e(c.get('pointer','') or c.get('detail',''))])
    h+=tbl(['source','verse','state','note / section','pointer / detail'],rows)
    h+='<h3>Findings log</h3><ul>'+''.join(f'<li><b>{e(f.get("source",""))}</b> · {e(f.get("kind",""))}{(" · v"+str(f["verse"])) if f.get("verse") else ""} — {e(f.get("msg",""))}</li>' for f in d['findings'])+'</ul>'
    if d.get('parallels'): h+='<h3>Parallels (report only)</h3><pre>'+e(json.dumps(d['parallels'],indent=1)[:3000])+'</pre>'
    h+=f'<h3>Validator, stand-in plan</h3><p>{"PASS" if v["standin"]["ok"] else "REJECT"} · {v["standin"]["stats"]["picked"]} pieces · {v["standin"]["stats"]["chars"]:,}/{v["standin"]["stats"]["budget"]:,} chars</p>'
    h+='<h3>Validator, bad-plan suite</h3>'+tbl(['case','expected','got','result'],[[e(c['case']),e(c['expected']),e(c['got']),'pass' if c['pass_'] else '<b class=bad>FAIL</b>'] for c in v['suite']])
    h+=f'<h3>Sorter pass (Claude standing in, public build)</h3><p class="note">Not a Worker or API call. Claude chose ids and roles by reading the pool; the shared validator checked them. Output below is the frozen text of those picks.</p>'
    h+=f'<p>Validator: <b>{"PASS" if s["ok"] else "REJECT"}</b> · {s["stats"]["picked"]} pieces · {s["stats"]["chars"]:,}/{s["stats"]["budget"]:,} chars · gaps {s["gaps"]}</p>'
    if s['warnings']: h+='<ul>'+''.join(f'<li>warning · {e(w["kind"])}: {e(w["msg"])}</li>' for w in s['warnings'])+'</ul>'
    fps={}
    for who in ('claude-sorter','standin'):
        f=json.load(open(f'{FP}/fingerprints-{n}-{who}.json')); fps[who]=f
    f=fps['claude-sorter']
    h+='<h3>Approval record</h3>'+tbl(['field','value'],[[e(k),'<code>'+e(json.dumps(val,ensure_ascii=False))+'</code>'] for k,val in f['record'].items()])
    h+='<p>Tamper tests: '+tbl(['who','passed'],[[w,f'{sum(1 for c in fps[w]["tamper_tests"] if c["pass_"])}/{len(fps[w]["tamper_tests"])}'] for w in fps])+'</p>'
    h+='<details><summary>Frozen study frame (what a reader would be served once approved)</summary>'+frame_block(f['frame'])+'</details>'
    tabs+=f'<button class="tb{" on" if i==0 else ""}" onclick="show({i})">{e(d["passage"])}</button>'
    panes+=f'<section class="pane" id="p{i}" style="display:{"block" if i==0 else "none"}">{h}</section>'
page=f'''<!doctype html><html><head><meta charset="utf-8"><title>Pool builder compare (private)</title><style>
body{{font:15px/1.45 system-ui,sans-serif;margin:0;color:#222}}header{{padding:12px 20px;background:#2b2b3a;color:#fff}}
.tabs{{padding:8px 20px;background:#eee;position:sticky;top:0}}.tb{{margin-right:6px;padding:6px 12px;border:1px solid #999;background:#fff;border-radius:5px;cursor:pointer}}.tb.on{{background:#2b2b3a;color:#fff}}
.pane{{padding:10px 20px 60px;max-width:1200px}}table{{border-collapse:collapse;margin:8px 0;font-size:13px}}td,th{{border:1px solid #ccc;padding:3px 7px;text-align:left;vertical-align:top}}th{{background:#f3f3f3}}
.priv{{background:#fde8e8;padding:6px 10px;border-left:4px solid #b00}}.note{{background:#fff7d6;padding:6px 10px}}.pc{{border:1px solid #ddd;margin:6px 0;padding:6px 10px;border-radius:5px}}.tag{{background:#2b2b3a;color:#fff;padding:1px 6px;border-radius:3px;font-size:12px}}.gap{{color:#a60}}.bad{{color:#b00}}code{{font-size:12px;word-break:break-all}}pre{{white-space:pre-wrap;font-size:12px}}</style></head><body>
<header><b>Pool builder compare page</b> · PRIVATE · generated from diagnostics, validator and fingerprint outputs · all approval records PENDING</header>
<div class="tabs">{tabs}</div>{panes}
<script>function show(i){{document.querySelectorAll('.pane').forEach((p,j)=>p.style.display=j==i?'block':'none');document.querySelectorAll('.tb').forEach((b,j)=>b.className='tb'+(j==i?' on':''))}}</script></body></html>'''
open(OUT,'w').write(page); print(len(page))
