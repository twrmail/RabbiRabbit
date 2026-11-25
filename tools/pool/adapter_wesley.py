#!/usr/bin/env python3
"""Wesley adapter for the pool builder. Wesley's chapter is one string with verse notes opened by 'N. ' at line start, but his own
outlines ('1. A sweet invitation ..., ver. 3-12.') and numbered lists use the same shape. The verse markers are chosen by a small
dynamic programme: strictly increasing verse numbers, preferring markers whose catchword (the words before ' - ') appears in the KJV
verse of that number, penalising outline lines that print 'ver. N'. Text before the first chosen marker is Wesley's chapter outline."""
import json, re, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pool_common import *
from pool_common import sha, tier_of, make_piece, cut_note

WORK_NT = 'Explanatory Notes upon the New Testament'
WORK_OT = 'Explanatory Notes upon the Old Testament'
NT_BOOKS = set('MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV'.split())
MARK = re.compile(r'(?m)^(\d{1,3})(?:\s*[-,–]\s*(\d{1,3}))?\.\s')
WORD = re.compile(r"[a-z']{3,}")

def kjv_chapter(lib, book, ch):
    d = json.load(open(f'{lib}/bible/KJV/{book}.json'))
    return [c for c in d['chapters'] if c['chapter'] == ch][0]['verses']

def choose_markers(text, kjv):
    cands = []
    for m in MARK.finditer(text):
        l = int(m.group(1)); h = int(m.group(2) or l)
        if h < l or h - l > 3: h = l
        line = text[m.end():m.end() + 160]
        head = line.split(' - ')[0] if ' - ' in line else ''
        hw = set(WORD.findall(head.lower())); vw = set(WORD.findall(kjv.get(str(l), '').lower()))
        sc = 0.1 + (0.2 if ' - ' in line else 0) + (2.0 if hw and hw & vw else 0) - (1.0 if re.search(r'ver\. ?\d', line.split('\n')[0] + ' ' + line) and not hw & vw else 0)
        cands.append((l, h, m.start(), sc))
    best = [c[3] for c in cands]; prev = [-1] * len(cands)
    for i, ci in enumerate(cands):
        for j in range(i):
            if cands[j][0] < ci[0] and best[j] + ci[3] >= best[i] and (best[j] + ci[3] > best[i] or True):
                if best[j] + ci[3] >= best[i]: best[i] = best[j] + ci[3]; prev[i] = j
    if not cands: return [], 0
    i = max(range(len(cands)), key=lambda k: (best[k], k)); path = []
    while i != -1: path.append(cands[i]); i = prev[i]
    path.reverse(); return path, len(cands)

def wesley(lib, book, ch, lo, hi, abbr=None):
    fp = f'{lib}/commentary/Wesley/{book}.json'; raw = open(fp, 'rb').read(); d = json.loads(raw)
    text = d['chapters'][str(ch)]; kjv = kjv_chapter(lib, book, ch)
    tier = tier_of(lib, 'wesley'); findings, cov, notes, pieces = [], {}, [], []
    marks, ncand = choose_markers(text, kjv)
    hits = sum(1 for l, h, s, sc in marks if sc >= 2)
    findings.append(dict(kind='convention', msg=f'Wesley chapter {len(text)} chars; {ncand} numbered line starts, {len(marks)} chosen as verse markers ({hits} confirmed by a catchword in the KJV verse): {[(l if l == h else f"{l}-{h}") for l, h, _, _ in marks]}; max code point U+{max(map(ord, text)):04X}'))
    if marks and text[:marks[0][2]].strip(): findings.append(dict(kind='chapter-outline', msg=f'{len(text[:marks[0][2]].strip())} characters before the first verse marker (Wesley\'s chapter outline); not a verse note, not in the pool.'))
    unconf = [f'{l}' for l, h, s, sc in marks if sc < 2 and lo <= l <= hi]
    if unconf: findings.append(dict(kind='marker-unconfirmed', msg=f'verse marker(s) {unconf} in the request have no catchword matching the KJV verse; accepted by order only.'))
    ends = [marks[i + 1][2] if i + 1 < len(marks) else len(text) for i in range(len(marks))]
    nl = [dict(lo=l, hi=h, start=s, end=e, sc=sc) for (l, h, s, sc), e in zip(marks, ends)]
    own = {n['lo']: n for n in nl}; built = {}
    def build(n):
        nid = f'WES.{ch}.{n["lo"]}' + (f'-{n["hi"]}' if n['hi'] != n['lo'] else '')
        if nid in built: return nid
        tag = f'{n["lo"]}' + (f'-{n["hi"]}' if n['hi'] != n['lo'] else '')
        def mk(k, t, x, y, prev, nid=nid, n=n, tag=tag):
            p = make_piece(f'WES{ch}.{tag}.{k:02d}', nid, 'wesley', 'wesley', 'John Wesley', 'wesley', None, WORK_NT if book in NT_BOOKS else WORK_OT,
                              d.get('source', '')[:120], f'{abbr or book} {ch}:{tag}', [n['lo'], n['hi']], n['lo'], t, fp.split('/library/')[-1], x, y, tier, prev, book, ch, lo, hi)
            if book not in NT_BOOKS:   # Wesley's preface to the Old Testament notes: an abridgement of Matthew Henry (claude/wesley-two-works-evidence-nov4.md)
                p['derived_from'] = ['henry']; p['flags'] = list(p.get('flags') or []) + ["Wesley's Old Testament notes abridge Matthew Henry (Wesley's own preface); not an independent voice from Henry"]
            return p
        spans, probs, ps = cut_note(text, n['start'], n['end'], mk)
        notes.append(dict(note_id=nid, verse=n['lo'], note_span=[n['lo'], n['hi']], start=n['start'], end=n['end'], chars=n['end'] - n['start'], pieces=len(spans), tiling_problems=probs))
        built[nid] = (probs, ps)
        if not probs: pieces.extend(ps)
        return nid
    for v in range(lo, hi + 1):
        n = own.get(v)
        if n is None:
            cover = [x for x in nl if x['lo'] < v <= x['hi']]
            if cover:
                c = cover[0]
                if c['lo'] < lo or c['hi'] > hi:
                    cov[v] = dict(state='present but excluded by range policy', detail=f'only inside range note {c["lo"]}-{c["hi"]}', pointer=f'Wesley treats {c["lo"]}-{c["hi"]} together'); continue
                nid = build(c); probs = built[nid][0]
                cov[v] = dict(state='extraction failure', detail=probs) if probs else dict(state='confirmed', note_id=nid, detail=f'inside range note {c["lo"]}-{c["hi"]}'); continue
            cov[v] = dict(state='source absence', detail=f'no Wesley marker for verse {v}'); continue
        if n['hi'] != n['lo'] and (n['lo'] < lo or n['hi'] > hi):
            cov[v] = dict(state='present but excluded by range policy', detail=f'range note {n["lo"]}-{n["hi"]} reaches outside the request'); continue
        nid = build(n); probs = built[nid][0]
        cov[v] = dict(state='extraction failure', detail=probs) if probs else dict(state='confirmed', note_id=nid)
    return dict(file_sha256=sha(raw), text_sha256=sha(text.encode())), cov, notes, pieces, findings
