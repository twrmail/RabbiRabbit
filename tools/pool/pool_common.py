#!/usr/bin/env python3
"""Shared helpers for the per-source adapters (moved out of pool_sources.py, no behaviour change)."""
import json, re, os, sys, hashlib, urllib.request, urllib.parse, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import henry_parser as H

from books import BOOKNAMES, HCF_BOOK  # all 66 books; see books.py
GEN_REF = re.compile(r'\b((?:[1-3]\s?)?[A-Z][a-z]{1,13}\.?)\s+(\d{1,3}):(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?')
FATHERS = [('Augustine of Hippo', 'augustine', 'Augustine of Hippo'), ('John Chrysostom', 'chrysostom', 'John Chrysostom'),
           ('Thomas Aquinas', 'aquinas', 'Thomas Aquinas'), ('Cyril of Alexandria', 'cyril', 'Cyril of Alexandria')]

def chapter_guard(folder, sid, dict_keyed=False):
    """Decorator for an adapter. If the source has no file for the book, or the file has no entry for the chapter, answer the way every other
    absence is answered: every requested verse 'source absence' with the reason, no pieces, no crash. (Known gaps this covers: Calvin stops at
    Ezekiel 20 and Jeremiah 51, Wesley has no 2 Samuel 24, Tyndale has no Exodus 36, Barnes is New Testament only.)"""
    import functools
    def deco(fn):
        @functools.wraps(fn)
        def wrapped(lib, book, ch, lo, hi, abbr=None, *a, **k):
            fp = f'{lib}/commentary/{folder}/{book}.json'
            why = None
            if not os.path.exists(fp): why = f'{sid} has no file for this book'
            else:
                d = json.load(open(fp))['chapters']
                if not ((str(ch) in d) if dict_keyed else any(c['chapter'] == ch for c in d)): why = f'{sid} has no entry for chapter {ch} in its file (the work does not reach it, or a recorded gap)'
            if why:
                return ({}, {v: dict(state='source absence', detail=why) for v in range(lo, hi + 1)}, [], [], [dict(kind='absence', msg=why)])
            return fn(lib, book, ch, lo, hi, abbr, *a, **k)
        return wrapped
    return deco

def sha(b): return hashlib.sha256(b).hexdigest()

def tier_of(lib, sid):
    prov = json.load(open(f'{lib}/provenance.json'))
    return [x for x in prov['sources'] if x.get('sourceId') == sid][0]['tier']

def refs_in(t, book):
    names = set(BOOKNAMES[book][1]); out = []
    for m in GEN_REF.finditer(t):
        lo = int(m.group(3)); hi = int(m.group(4) or lo)
        out.append(dict(raw=m.group(0), book=m.group(1).rstrip('.'), chapter=int(m.group(2)), lo=lo, hi=max(lo, hi),
                        same_book=m.group(1).rstrip('.') in names))
    return out

def make_piece(pid, nid, src, container, author, tkey, compiler, work, edition, refstr, nspan, anchor, t, sfile, x, y,
               tier, prev_id, book, ch, lo, hi, extra_flags=None):
    mk = H.marker_at(t)
    body = t[mk[4]:] if mk else t
    standalone = not H.PRON_RE.match(body.strip())
    rs = refs_in(t, book)
    outside = [r for r in rs if r['same_book'] and r['chapter'] == ch and (r['lo'] < lo or r['hi'] > hi)]
    head_out = [r for h in H.outline_heads(t, anchor) for r in refs_in(h, book) if r['same_book'] and r['chapter'] == ch and (r['lo'] < lo or r['hi'] > hi)]
    suspect = bool(head_out)
    fl = list(extra_flags or [])
    if not standalone and prev_id is None: fl.append('non-standalone but first piece of note (back-reference to text outside the note)')
    if outside and not suspect: fl.append('cites same-chapter verses outside the request (ordinary cross-reference)')
    return dict(id=pid, note_id=nid, source_id=src, container_id=container, original_author=author, teacher_key=tkey,
                compiler=compiler, work_title=work, edition=edition, reference=refstr, note_span=nspan, subject_span=nspan,
                anchor_verse=anchor, text=t, outline_label=(mk[0] if mk else None),
                marker_span=([x + mk[3], x + mk[4]] if mk else None), source_file=sfile, start=x, end=y, rights=tier,
                standalone=standalone, predecessor_ids=[] if standalone or prev_id is None else [prev_id],
                markup_valid=t.count('*') % 2 == 0, boundary_suspect=suspect,
                contains_cross_refs=[r['raw'] for r in rs], flags=fl)

repair_spans = H.repair_spans  # lives in henry_parser so Henry, Calvin, Gill and the rest share it

def cut_note(text, a, b, mkpiece):
    spans = H.make_spans(text, a, b)
    spans, probs, dropped = repair_spans(text, a, b, spans)
    out, prev = [], None
    if not probs:
        for n, (x, y) in enumerate(spans, 1):
            p = mkpiece(n, text[x:y], x, y, prev)
            if dropped: p['flags'] = list(p.get('flags') or []) + [f'{dropped} cut(s) removed so no parenthesis or emphasis pair is split']
            out.append(p); prev = p['id']
    return spans, probs, out
