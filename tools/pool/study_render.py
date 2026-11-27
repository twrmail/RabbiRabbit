#!/usr/bin/env python3
"""Render one study page from its frame_v2 object, and from nothing else (renderer id 'study_html_v1').
Every word printed comes from the frame: teacher text, Scripture, AI summaries and headings, Rabbit's own text, and the label
templates in frame['labels']. The code adds only fixed HTML tags and CSS. test_frame_v2.py checks that no visible text is left on
the page once all frame strings are taken away."""
import html, re

RENDERER = 'study_html_v1'
CSS = '''body{font:17px/1.6 Georgia,serif;max-width:780px;margin:1.5rem auto;padding:0 1rem;color:#222}h2{margin-top:2.4rem;border-top:3px solid #8a6d3b;padding-top:.8rem}h3{font-size:1.05rem;margin:1.6rem 0 .3rem}
.v{background:#f6f1e7;padding:.6rem .9rem;border-left:4px solid #8a6d3b}.own{font:14px system-ui;color:#555}.q{font:italic 16px Georgia;color:#444;margin:.6rem 0}
.t{margin:.8rem 0;padding:.6rem .9rem;border:1px solid #ddd;border-radius:6px}.who{font:600 14px system-ui;color:#333}.who span{font-weight:400;color:#666}.say{margin:.35rem 0}
.cite{font:12px system-ui;color:#6b5a2e;margin-top:.4rem;border-left:3px solid #d9c9a0;padding-left:.5rem}.ai{font:11px system-ui;letter-spacing:.04em;color:#8a6d3b;text-transform:uppercase}details{margin-top:.4rem}summary{font:13px system-ui;color:#555;cursor:pointer}.words{font-size:15px;margin-top:.4rem;color:#333}
.head{font:600 15px system-ui;color:#5a4520;margin:.2rem 0}.head .ai{margin-left:.4rem}.note{font:14px system-ui;background:#fff8e1;border:1px solid #e6d28a;padding:.7rem;border-radius:6px}.credits{font:13px system-ui;color:#555;margin-top:1.4rem;border-top:1px solid #ddd;padding-top:.6rem}'''

def e(t): return html.escape(t)
def md(t): return re.sub(r'\*([^*]+)\*', r'<em>\1</em>', html.escape(t)).replace('\n', '<br>')

NARRATIVE = 'study_narrative_v1'
NCSS = CSS + '''.br{margin:.9rem 0 .3rem}.br .ai{display:block}.qt{margin:.3rem 0 .9rem;padding:.5rem .9rem;border-left:3px solid #bbb;font-size:16px}.qt .who{margin-bottom:.2rem}.gap{color:#888}'''

def narrative(fr):
    """Narrative study (renderer 'study_narrative_v1'): Scripture, AI bridges and quotes in the weave's order. Excerpts show a
    visible ellipsis wherever text is left out (E2) and the whole passage one tap away (E3)."""
    L, st, T = fr['labels'], fr['study'], fr['labels']['teacher_names']
    by = {it['id']: it for vd in fr['verses'].values() for it in vd['items']}; ell = f'<span class=gap>{e(L["ellipsis"])}</span>'
    H = [f'<section id="s{e(st["key"])}"><h2>{e(L["study_heading"].format(key=st["key"], title=st["title"]))}</h2>',
         f'<p class=note>{e(fr["note"])}</p>',
         f'<p class=own>{e(L["focus"])} <b>{e(st["focus"])}</b><br>{e(L["take"])} {e(st["take"])}<br>{e(fr["stats_line"])}</p>']
    for mv in fr['weave']['movements']:
        for s in mv['segments']:
            if s['kind'] == 'scripture':
                H.append(f'<h3>{e(L["verse_heading"].format(place=st["place"], verse=s["verse"]))}</h3><div class=v>{e(s["text"])}</div>')
            elif s['kind'] == 'bridge':
                H.append(f'<div class=br><span class=ai>{e(L["ai_bridge"])}</span>{e(s["text"])}</div>')
            elif s['kind'] == 'quote':
                it = by[s['piece']]; name = T[it['teacher_key']]; cv = it['covers_verses']
                wide = ' ' + e(L['covers'].format(first=cv[0], last=cv[-1])) if len(cv) > 1 else ''
                txt = ''
                for i, p in enumerate(s['parts']):
                    if (i == 0 and s['cut_before']) or p['gap_before']: txt += ell + ' '
                    txt += md(p['text']) + ' '
                txt = txt.rstrip() + (' ' + ell if s['cut_after'] else '')
                x = f'<div class=qt><div class=who>{e(name)} <span>&middot; {e(it["work"] or "")}{wide}</span></div>{txt}'
                if not s['whole']:
                    x += f'<details><summary>{e(L["whole_passage"].format(teacher=name))}</summary><div class=words>{md(it["text"])}</div></details>'
                H.append(x + '</div>')
    if st.get('question'): H.append(f'<p class=q><span class=own>{e(L["study_question"])}</span> {e(st["question"])}</p>')
    H.append(f'<p class=q><span class=own>{e(L["closing_short"])}</span> {e(st["closing"])}</p>')
    H.append(f'<div class=credits>{e(fr["credits"])}</div></section>')
    return '\n'.join(H)

FULL = 'study_full_v1'
FCSS = CSS + '''.aitext{margin:.6rem 0;padding:.5rem .9rem;border-left:3px solid #d9c9a0;background:#fffdf7}.aitext .ai{display:block;margin-bottom:.2rem}
.road{margin-top:2.4rem;border-top:3px solid #8a6d3b;padding-top:.6rem}.ref{font:600 15px system-ui;color:#5a4520}.why{font:12px system-ui;color:#777}'''

def full(fr):
    """Full Rabbit study (renderer 'study_full_v1'): opening, verse-by-verse body (as Study E, with bridges), Rabbi Road, What's Over the
    Hill. Scripture and teacher words come from the frame exactly; every AI field is labeled."""
    L, st, T, X = fr['labels'], fr['study'], fr['labels']['teacher_names'], fr['full']
    C = X.get('corrections') or {}; fixed = set(C.get('fields') or [])
    tag = lambda f: e(L['ai_text']) + (' &middot; ' + e(L['corrected'].format(by=C['by'])) if f in fixed else '')
    ai = lambda t, f=None: f'<div class=aitext><span class=ai>{tag(f)}</span>{e(t)}</div>'
    H = [f'<section id="s{e(st["key"])}"><h2>{e(L["study_heading"].format(key=st["key"], title=st["title"]))}</h2>',
         f'<p class=note>{e(fr["note"])}</p>', f'<p class=own>{e(fr["stats_line"])}</p>',
         f'<h3>{e(L["opening"])}</h3>', ai(X['opening']['text'], 'opening')]
    for v in sorted(fr['verses'], key=int):
        vd = fr['verses'][v]
        H.append(f'<h3>{e(L["verse_heading"].format(place=st["place"], verse=v))}</h3><div class=v>{e(vd["scripture_text"])}</div>')
        for it in vd['items']:
            name = T[it['teacher_key']]; cv = it['covers_verses']
            wide = ' ' + e(L['covers'].format(first=cv[0], last=cv[-1])) if len(cv) > 1 else ''
            H.append(f'<div class=t><div class=who>{e(name)} <span>&middot; {e(it["work"] or "")}{wide}</span></div>'
                     f'<div class=head>{e(it["heading"])} <span class=ai>{tag("heading:" + it["id"] if "heading:" + it["id"] in fixed else "summary:" + it["id"])}</span></div><div class=say>{e(it["summary"])}</div>'
                     f'<details><summary>{e(L["own_words"].format(teacher=name))}</summary><div class=words>{md(it["text"])}</div></details></div>')
        n = (C.get('notes') or {}).get(v)
        if n: H.append(f'<p class=q><span class=own>{e(L["rabbit_note"])}</span> {e(n)}</p>')
        b = X['bridges'].get(v)
        if b: H.append(ai(b['text'], f'bridge:{v}'))
    r = X['road']
    H.append(f'<h2 class=road>{e(L["road_heading"])}</h2><p class=ref>{e(L["road_line"].format(ref=r["ref"]))}</p>'
             f'<div class=v>{e(r["scripture"])}</div><p class=why>{e(L["road_votes"].format(votes=r["votes"]))}</p>' + ai(r['text'], 'rabbi_road'))
    for q in r['quotes']:
        H.append(f'<div class=t><div class=who>{e(q["teacher"])} <span>&middot; {e(q["work"] or "")} &middot; {e(r["ref"])}</span></div><div class=words>{md(q["text"])}</div></div>')
    H.append(f'<p class=q>{e(L["prompt"])} {e(r["prompt"])} <span class=ai>{tag("prompt")}</span></p>')
    h = X['hill']
    H.append(f'<h2 class=road>{e(L["hill_heading"])}</h2><p class=ref>{e(h["ref"])}</p><div class=v>{e(h["scripture"])}</div>'
             f'<p class=why>{e(L["hill_votes"].format(road=r["ref"], votes=h["votes"]))}</p>' + ai(h['text'], 'over_the_hill'))
    H.append(f'<div class=credits>{e(fr["credits"])}</div></section>')
    return '\n'.join(H)

def body(fr):
    """The study section: what an approval covers."""
    if fr.get('renderer') == FULL and fr.get('full'): return full(fr)
    if fr.get('renderer') == NARRATIVE and fr.get('weave'): return narrative(fr)
    if fr.get('renderer') != RENDERER: raise ValueError(f"frame names renderer {fr.get('renderer')!r}, this is {RENDERER!r}")
    L, st = fr['labels'], fr['study']; R = L['roles']; T = L['teacher_names']
    H = [f'<section id="s{e(st["key"])}"><h2>{e(L["study_heading"].format(key=st["key"], title=st["title"]))}</h2>',
         f'<p class=note>{e(fr["note"])}</p>',
         f'<p class=own>{e(L["focus"])} <b>{e(st["focus"])}</b><br>{e(L["take"])} {e(st["take"])}<br>{e(fr["stats_line"])}</p>']
    for v in sorted(fr['verses'], key=int):
        vd = fr['verses'][v]
        H.append(f'<h3>{e(L["verse_heading"].format(place=st["place"], verse=v))}</h3><div class=v>{e(vd["scripture_text"])}</div>')
        if vd.get('question'): H.append(f'<p class=q><span class=own>{e(L["verse_question"])}</span> {e(vd["question"])}</p>')
        for it in vd['items']:
            name = T[it['teacher_key']]; cv = it['covers_verses']
            wide = ' ' + e(L['covers'].format(first=cv[0], last=cv[-1])) if len(cv) > 1 else ''
            x = [f'<div class=t><div class=who>{e(name)} <span>&middot; {e(R[it["role"]])} &middot; {e(it["work"] or "")}{wide}</span></div>']
            if it.get('heading'): x.append(f'<div class=head>{e(it["heading"])} <span class=ai>{e(L["ai_heading"])}</span></div>')
            if it.get('summary'): x.append(f'<div class=ai>{e(L["ai_summary"])}</div><div class=say>{e(it["summary"])}</div>')
            cite = ''
            if it.get('citations'):
                c = '; '.join(e(c['raw'] if not c.get('ibid') else L['ibid'].format(raw=c['raw'], work=c['work'])) for c in it['citations'])
                cite = f'<div class=cite>{e(L["gill_footnote"])} {c}.' + (f' {e(L["jewish_source"])}' if it.get('jewish_source') else '') + '</div>'
            x.append(f'<details><summary>{e(L["own_words"].format(teacher=name))}</summary><div class=words>{md(it["text"])}{cite}</div></details></div>')
            H.append(''.join(x))
        if vd.get('gap_line'): H.append(f'<p class=own>{e(vd["gap_line"])}</p>')
        for ptr in vd.get('pointers') or []: H.append(f'<p class=own>{e(ptr)}</p>')
    if st.get('question'): H.append(f'<p class=q><span class=own>{e(L["study_question"])}</span> {e(st["question"])}</p>')
    H.append(f'<p class=q><span class=own>{e(L["closing_short"] if st.get("shape") == "short" else L["closing"])}</span> {e(st["closing"])}</p>')
    H.append(f'<div class=credits>{e(fr["credits"])}</div></section>')
    return '\n'.join(H)

def page(fr):
    """A whole page for one study."""
    t = fr['labels']['page_title'].format(key=fr['study']['key'], title=fr['study']['title'], scope=fr['scope'])
    css = NCSS if fr.get('renderer') == NARRATIVE else FCSS if fr.get('renderer') == FULL else CSS
    return f'<!doctype html><meta charset=utf-8><title>{e(t)}</title><style>{css}</style>\n{body(fr)}\n'

def review_page(fr, critic):
    """For Tom's review only: the study page with the critic's notes on top. Not part of the frame, never served."""
    notes = critic.get('notes') or []
    rows = ''.join(f'<li><b>{e(str(n.get("severity", "")))}</b> &middot; {e(str(n.get("where", "")))}: {e(str(n.get("issue", "")))}</li>' for n in notes)
    head = (f'<div class=note style="background:#eef4ff;border-color:#9bb5e0"><b>Review copy.</b> The critic ({e(critic.get("model", ""))}) read this study '
            f'against its sources. Its notes are for your review; they did not reject the study. ' +
            (f'<ul>{rows}</ul>' if rows else ('No notes.' if critic.get('ok') else 'The critic did not return usable notes: ' + e(str(critic.get('raw') or '')[:300]))) + '</div>')
    return page(fr).replace('<section', head + '\n<section', 1)
