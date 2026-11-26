#!/usr/bin/env python3
"""Adapters for verse-keyed commentaries (library standard: verses{'N': note}, optional spans{'N':[a,b]}): Barnes (NT) and Tyndale."""
import json, re, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pool_common import *
from pool_common import sha, tier_of, make_piece, cut_note

def verse_keyed(lib, folder, sid, prefix, author, tkey, work, book, ch, lo, hi, abbr=None):
    fp = f'{lib}/commentary/{folder}/{book}.json'; raw = open(fp, 'rb').read(); d = json.loads(raw)
    cdata = [c for c in d['chapters'] if c['chapter'] == ch][0]; vs = cdata['verses']; spans = cdata.get('spans') or {}
    tier = tier_of(lib, sid); findings, cov, notes, pieces = [], {}, [], []
    findings.append(dict(kind='convention', msg=f'{sid}: {len(vs)} verse notes in chapter, {len(spans)} with spans; offsets are into each note string; max code point U+{max(map(ord, "".join(vs.values()) or " ")):04X}'))
    if cdata.get('overview'): findings.append(dict(kind='chapter-overview', msg=f'{len(cdata["overview"])} character chapter overview; not a verse note, not in the pool.'))
    rng = {int(k): (int(a), int(b)) for k, (a, b) in spans.items()}
    def span_of(k): return rng.get(k, (k, k))
    for v in range(lo, hi + 1):
        key = None
        if str(v) in vs: key = v
        else:
            for k, (a, b) in rng.items():
                if a <= v <= b and str(k) in vs: key = k; break
        if key is None: cov[v] = dict(state='source absence', detail=f'no {sid} note for verse {v}'); continue
        a, b = span_of(key); t = vs[str(key)]
        if not t.strip(): cov[v] = dict(state='source absence', detail='entry present but empty'); continue
        if a < lo or b > hi: cov[v] = dict(state='present but excluded by range policy', detail=f'only inside range note {a}-{b}', pointer=f'{sid} treats {a}-{b} together'); continue
        tag = f'{a}' + (f'-{b}' if b != a else ''); nid = f'{prefix}.{ch}.{tag}'
        if any(n['note_id'] == nid for n in notes): cov[v] = dict(state='confirmed', note_id=nid, detail=f'inside range note {tag}'); continue
        def mk(k, tt, x, y, prev, nid=nid, tag=tag, a=a, b=b, t=t):
            p = make_piece(f'{prefix}{ch}.{tag}.{k:02d}', nid, sid, sid, author, tkey, None, work, d.get('source', '')[:120], f'{abbr or book} {ch}:{tag}',
                           [a, b], a, tt, fp.split('/library/')[-1], x, y, tier, prev, book, ch, lo, hi)
            p['source_text_sha256'] = sha(t.encode()); return p
        sp, probs, ps = cut_note(t, 0, len(t), mk)
        notes.append(dict(note_id=nid, verse=a, note_span=[a, b], start=0, end=len(t), chars=len(t), pieces=len(sp), tiling_problems=probs))
        if probs: cov[v] = dict(state='extraction failure', detail=probs); continue
        cov[v] = dict(state='confirmed', note_id=nid); pieces += ps
    return dict(file_sha256=sha(raw), text_sha256=None), cov, notes, pieces, findings

@chapter_guard('Barnes-NT', 'barnes-nt')
def barnes(lib, book, ch, lo, hi, abbr=None):
    return verse_keyed(lib, 'Barnes-NT', 'barnes-nt', 'BAR', 'Albert Barnes', 'barnes', "Notes on the New Testament", book, ch, lo, hi, abbr)

@chapter_guard('Tyndale', 'tyndale')
def tyndale(lib, book, ch, lo, hi, abbr=None):
    return verse_keyed(lib, 'Tyndale', 'tyndale', 'TYN', 'Tyndale House Publishers', 'tyndale', 'Tyndale Open Study Notes', book, ch, lo, hi, abbr)
