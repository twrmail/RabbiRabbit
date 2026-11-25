#!/usr/bin/env python3
"""Shared helpers for the per-source adapters (moved out of pool_sources.py, no behaviour change)."""
import json, re, os, sys, hashlib, urllib.request, urllib.parse, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import henry_parser as H

BOOKNAMES = {
    '1JN': ('1Jo', ['1Jo', '1 John', '1John', 'John']),
    'ROM': ('Ro', ['Ro', 'Rom', 'Romans']),
    'MRK': ('Mr', ['Mr', 'Mk', 'Mark']),
    'EPH': ('Eph', ['Eph', 'Ephesians']),
    'MAT': ('Mt', ['Mt', 'Mat', 'Matt', 'Matthew']),
    'JHN': ('Joh', ['Joh', 'John']),
}
HCF_BOOK = {'1JN': '1 John', 'ROM': 'Romans', 'MRK': 'Mark', 'EPH': 'Ephesians', 'MAT': 'Matthew', 'JHN': 'John'}
GEN_REF = re.compile(r'\b((?:[1-3]\s?)?[A-Z][a-z]{1,9}\.?)\s+(\d{1,3}):(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?')
FATHERS = [('Augustine of Hippo', 'augustine', 'Augustine of Hippo'), ('John Chrysostom', 'chrysostom', 'John Chrysostom'),
           ('Thomas Aquinas', 'aquinas', 'Thomas Aquinas'), ('Cyril of Alexandria', 'cyril', 'Cyril of Alexandria')]

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

def repair_spans(text, a, b, spans):
    """If a cut falls inside a parenthesis or an asterisk pair that closes later in the same note, drop that cut (merge the two neighbouring
    pieces) and re-check. Pieces stay exact slices of the source; they only get longer. Returns (spans, problems_left, cuts_dropped)."""
    spans = list(spans); dropped = 0
    for _ in range(40):
        probs = H.tiling_check(text, a, b, spans)
        cuts = [int(m.group(1)) for p in probs for m in [re.search(r'at cut (\d+)', p)] if m]
        if not cuts or len(probs) != len(cuts): return spans, probs, dropped
        c = cuts[0]; i = [k for k, (x, y) in enumerate(spans) if y == c]
        if not i or i[0] + 1 >= len(spans): return spans, probs, dropped
        i = i[0]; spans[i:i + 2] = [(spans[i][0], spans[i + 1][1])]; dropped += 1
    return spans, H.tiling_check(text, a, b, spans), dropped

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
