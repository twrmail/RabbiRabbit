#!/usr/bin/env python3
"""Gill adapter for the pool builder (moved out of pool_sources.py, no behaviour change)."""
import json, re, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pool_common import *
from pool_common import sha, tier_of, make_piece, cut_note, repair_spans


# --- Gill's footnoted quotations (Nov 24 design, approved by Tom) -----------------------------------------------------------
# Gill quotes (mostly rabbinic) works in blocks that start with a quotation mark and end with two apostrophes. Footnote letters
# like (b) point to a citation list at the end of the note ("(b) T. Bab. Avoda Zara, fol. 2. 1. (c) Ib. fol. 4. 1. ...").
# Each quote becomes its own piece (kind 'cited_quote') carrying its citation(s) as metadata; the citation list stays as a
# 'citation_list' piece so the verse text still tiles, but it can never be picked on its own. The text of every piece is still
# an exact slice of the source (the verbatim check re-slices them).
PARA = re.compile(r'\n[ \t]*\n')
QUOTE_END = re.compile(r"''\s*$")
LETTER = re.compile(r'\(([a-z])\)')
CITE_START = re.compile(r'^\s*\(?\(([a-z])\)\s')
JEWISH = re.compile(r'\b(T\. ?Bab|T\. ?Hieros|Rabba|Zohar|Targum|Misn|Mishn|Maimon|Jarchi|Kimchi|Aben Ezra|Talmud|Gemara|Pirke|Pesikta|Midrash|Tanchuma|Sepher|Seder Olam|Abarbinel|Bemidbar|Bereshit|Shemot|Vajikra|Debarim|Shirhashirim|Echa|Esther Rabba|Zohar|Baal Hatturim|Menachem|Raya Mehimna|Siphre|Sifre|Mechilta|Jonathan|Onkelos|Jerus)', re.I)

def paragraphs(t):
    out, pos = [], 0
    for m in PARA.finditer(t):
        if t[pos:m.start()].strip(): out.append((pos, m.start()))
        pos = m.end()
    if t[pos:].strip(): out.append((pos, len(t)))
    return [(x, x + len(t[x:y].rstrip())) for x, y in out]

def parse_citations(par):
    """'(b) T. Bab. X, fol. 2. 1. (c) Ib. fol. 4. 1.((d) ...' -> {'b': raw, ...}; 'Ib.' resolved to the work of the entry before it."""
    ms = list(re.finditer(r'\(([a-z])\)\s+', par)); raw = {}
    for i, m in enumerate(ms):
        e = par[m.end(): ms[i + 1].start() if i + 1 < len(ms) else len(par)]
        raw[m.group(1)] = e.strip().rstrip('(').strip()
    res, last = {}, None
    for k, r in raw.items():
        w = re.split(r',|\s+fol\.|\s+sect\.|\s+Vid\.', r)[0].strip()
        if re.match(r'Ib(id)?\.?$', w) or re.match(r'Ib(id)?\.?\s', r):
            res[k] = dict(letter=k, raw=r, work=last, ibid=True)
        else:
            res[k] = dict(letter=k, raw=r, work=w, ibid=False); last = w
    return res

def segment(t):
    """Return list of (start, end, kind, letter) tiling t (whitespace between). kind: commentary / cited_quote / citation_list.
    A quotation becomes 'cited_quote' only when its footnote letter resolves in the note's own footnote list (or it is a
    'gloss' continuing the quotation right before it); otherwise it stays ordinary commentary, as before."""
    ps = paragraphs(t); n = len(ps); kind = ['c'] * n
    j = n
    while j > 0 and CITE_START.match(t[ps[j - 1][0]:ps[j - 1][1]]): j -= 1
    for i in range(j, n): kind[i] = 'L'
    cites = {}
    for i in range(j, n): cites.update(parse_citations(t[ps[i][0]:ps[i][1]]))
    spans = []   # (a, b, kind, letter)
    prev_q = None
    for i in range(n):
        s = t[ps[i][0]:ps[i][1]]
        if kind[i] == 'L': spans.append((ps[i][0], ps[i][1], 'citation_list', None)); prev_q = None; continue
        isq = s.lstrip().startswith('"') and QUOTE_END.search(s) and cites
        if not isq: spans.append((ps[i][0], ps[i][1], 'commentary', None)); prev_q = None; continue
        a = ps[i][0]
        if spans and spans[-1][2] == 'commentary' and i > 0:
            px, py = ps[i - 1]; lead = t[px:py]
            if len(lead) <= 160 and not lead.lstrip().startswith('"') and spans[-1][0] == px and spans[-1][1] == py: a = px
        tt = t[a:ps[i][1]]; inner = LETTER.findall(tt); letter = inner[0] if inner else None
        if letter is None:
            bl = LETTER.findall(t[:a].rstrip()[-120:]); letter = bl[-1] if bl else None
        if letter is None and prev_q is not None: letter = prev_q   # gloss: same footnote as the quotation just above
        if letter is not None and letter in cites:
            if a != ps[i][0] and spans[-1][2] == 'commentary' and spans[-1][0] == a: spans.pop()
            spans.append((a, ps[i][1], 'cited_quote', letter)); prev_q = letter
        else:
            spans.append((ps[i][0], ps[i][1], 'commentary', None)); prev_q = None
    out, run = [], []
    def flush():
        if run:
            for (x, y) in H.make_spans(t, run[0][0], run[-1][1]): out.append((x, y, 'commentary', None))
            run.clear()
    for sp in spans:
        if sp[2] == 'commentary': run.append(sp)
        else: flush(); out.append(sp)
    flush()
    return out, cites

def gill(lib, book, ch, lo, hi, abbr=None):
    fp = f'{lib}/commentary/Gill/{book}.json'; raw = open(fp, 'rb').read(); d = json.loads(raw)
    cc = [c for c in d['chapters'] if c['chapter'] == ch][0]['verses']
    tier = tier_of(lib, 'gill'); findings, cov, notes, pieces = [], {}, [], []
    findings.append(dict(kind='convention', msg=f'Gill: {len(cc)} verse entries in chapter; offsets are into each verse string; max code point U+{max(map(ord, "".join(cc.values()))):04X}'))
    for v in range(lo, hi + 1):
        t = cc.get(str(v))
        if t is None or not t.strip():
            cov[v] = dict(state='source absence', detail='no Gill entry for this verse in the file' if t is None else 'entry present but empty'); continue
        nid = f'GILL.{ch}.{v}'
        segs, cites = segment(t)
        spans = [(x, y) for x, y, _, _ in segs]; kinds = [k for _, _, k, _ in segs]; letters = [l for _, _, _, l in segs]
        probs = H.tiling_check(t, 0, len(t), spans)
        if probs:   # quote handling must never cost a note: fall back to the plain cut used before
            spans, _p, _d = repair_spans(t, 0, len(t), H.make_spans(t, 0, len(t))); kinds = ['commentary'] * len(spans); letters = [None] * len(spans); cites = {}
            findings.append(dict(kind='quote-segmentation-fallback', msg=f'{nid}: {probs[0]}; cut as plain commentary'))
            probs = H.tiling_check(t, 0, len(t), spans)
        notes.append(dict(note_id=nid, verse=v, note_span=[v, v], start=0, end=len(t), chars=len(t), pieces=len(spans), tiling_problems=probs))
        if probs: cov[v] = dict(state='extraction failure', detail=probs); continue
        ps, prev = [], None; list_id = None
        for n, ((x, y), k, letter) in enumerate(zip(spans, kinds, letters), 1):
            tt = t[x:y]
            fl = [] if k == 'commentary' else ([f'Gill quotes another work here; the citation is Gill\'s own footnote'] if k == 'cited_quote' else ['footnote list only; never shown on its own'])
            p = make_piece(f'GIL{ch}.{v}.{n:02d}', nid, 'gill', 'gill', 'John Gill', 'john-gill', None, 'An Exposition of the Old and New Testament',
                           d.get('source', '')[:120], f'{abbr or book} {ch}:{v}', [v, v], v, tt, fp.split('/library/')[-1], x, y, tier, prev, book, ch, lo, hi, fl)
            p['source_text_sha256'] = sha(t.encode()); p['piece_kind'] = k
            if k == 'cited_quote':
                cs = [cites[letter]] if letter in cites else []
                p['cites_letters'] = [letter]
                p['citations'] = cs
                p['jewish_source'] = bool(cs and JEWISH.search(cs[0]['raw'] + ' ' + (cs[0]['work'] or '')))
                p['quoted_by'] = 'John Gill'
                p['predecessor_ids'] = []; p['standalone'] = True   # the lead-in line is inside the piece; a quote needs nothing before it
                p['flags'] = [f for f in p['flags'] if not f.startswith('non-standalone')]
                if not cs: p['flags'].append('quote has no resolved footnote citation')
            ps.append(p)
            if k == 'citation_list': p['citation_letters'] = sorted(cites)
            prev = p['id'] if k != 'citation_list' else prev
        # a commentary piece that follows a quote may depend on it only through the shared splitter's rules (unchanged)
        notes[-1]['quote_pieces'] = sum(k == 'cited_quote' for k in kinds)
        cov[v] = dict(state='confirmed', note_id=nid); pieces += ps
    return dict(file_sha256=sha(raw), text_sha256=None), cov, notes, pieces, findings
