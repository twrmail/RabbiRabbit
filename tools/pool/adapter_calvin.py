#!/usr/bin/env python3
"""Calvin adapter for the pool builder (moved out of pool_sources.py, no behaviour change)."""
import json, re, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import henry_parser as H
from pool_common import *
from pool_common import sha, tier_of, refs_in, make_piece, cut_note

HEADBLOCK = re.compile(r'(?:(?:[A-Z]{4,}\s\d+:\d+(?:-\d+)?[;,]?\s+)+)?(?:(?:1 John|Romans|Matthew|Mark|Luke|John|Ephesians)\s\d+:\d+(?:-\d+)?\s+){1,3}\d+\s?\.\s')
def calvin(lib, book, ch, lo, hi, abbr=None):
    fp = f'{lib}/commentary/Calvin/{book}.json'; raw = open(fp, 'rb').read(); d = json.loads(raw)
    text = [c for c in d['chapters'] if c['chapter'] == ch][0]['commentary']
    ip = f'{lib}/commentary-index/Calvin/{book}.json'; iraw = open(ip, 'rb').read()
    idx = [c for c in json.loads(iraw)['chapters'] if c['chapter'] == ch][0]
    tier = tier_of(lib, 'calvin'); findings, cov, notes, pieces = [], {}, [], []
    ok = sha(text.encode()) == idx['textSha256'] and len(text) == idx['textLength']
    findings.append(dict(kind='convention', msg=f'Calvin text_sha256 matches index: {ok}; length {len(text)}; sections {len(idx["sections"])}; max code point U+{max(map(ord, text)):04X}'))
    if not ok: raise SystemExit('Calvin index/text mismatch')
    excluded_hdr = []
    secs = idx['sections']; byv = {s['verse']: s for s in secs}
    def span(s): return tuple(s.get('span', [s['verse'], s['verse']]))
    for v in range(lo, hi + 1):
        s = byv.get(v)
        if s is None:
            cover = [x for x in secs if span(x)[0] <= v <= span(x)[1]]
            if cover:
                sp = span(cover[0]); inside = not (sp[0] < lo or sp[1] > hi)
                cov[v] = dict(state='present but excluded by range policy' if not inside else 'pending', cover_section=cover[0]['verse'],
                    detail=f'no section of its own; covered by section {cover[0]["verse"]} span {sp}', pointer=f'Calvin treats {sp[0]}-{sp[1]} together'); continue
            cited = len(re.findall(rf'\b{ch}:{v}\b', text))
            cov[v] = dict(state='index absence' if cited else 'source absence', detail=f'no section; {cited} text citations of {ch}:{v}'); continue
        sp = span(s); a, b = s['start'], s['end']
        hb_end = None
        if 'span' in s and sp[1] > sp[0]:
            seg0 = text[a:b]
            lat = [m.end() for m in re.finditer(rf'(?<![\d:]){sp[1]} ?\.? (?=[A-Z])', seg0)]
            if len(lat) >= 2:
                m0 = re.compile(rf'(?<![\d:]){sp[0]} ?\.? (?=[A-Z])').search(seg0, lat[1])
                if m0: hb_end = a + m0.start()
        exc = bool(hb_end) and lo <= s['verse'] <= hi and (sp[0] < lo or sp[1] > hi)  # Calvin exception (Tom, nov22): heading group, not a real range note
        if (sp[0] < lo or sp[1] > hi) and not exc:
            # range note under strict rule. Report an alternative reading without putting anything in the pool.
            sep = [k for k in range(sp[0] + 1, sp[1] + 1) if k in byv and byv[k]['start'] >= b]
            alt = dict(note_span_if_header_trimmed=[s['verse'], s['verse']], separate_sections_for=sep,
                       chars=b - a, note='index span reports the printed heading group; later verses in the span have their own sections, so the body of this section may treat only verse %d' % s['verse']) if len(sep) == sp[1] - sp[0] else None
            cov[v] = dict(state='present but excluded by range policy', note_span=list(sp), section=dict(start=a, end=b, head=s['head']),
                          pointer=f'Calvin treats {sp[0]}-{sp[1]} together', alternative_reading=alt)
            findings.append(dict(kind='range-note', verse=v, msg=f'Calvin section {s["verse"]} indexed span {sp[0]}-{sp[1]} ({b - a} chars): excluded by strict whole-note rule (D1). ' + ('Verses %s have separate sections, so the span may only describe the printed heading block.' % sep if alt else 'No separate sections for the rest of the span.')))
            continue
        nid = f'CAL.{ch}.{v}' if exc else f'CAL.{ch}.{sp[0]}' + (f'-{sp[1]}' if sp[1] != sp[0] else '')
        nsp = [v, v] if exc else list(sp)
        hflag = [f'Calvin printed heading group covers {sp[0]}-{sp[1]}; body taken as verse {v} (exception to D1, Tom nov22)'] if exc else None
        def mk(n, t, x, y, prev, v=v, nid=nid, sp=sp, nsp=nsp, hflag=hflag):
            return make_piece(f'CAL{ch}.{v}.{n:02d}', nid, 'calvin', 'calvin', 'John Calvin', 'john-calvin', None,
                              'Commentary on the First Epistle of John' if book == '1JN' else f'Calvin commentary {book}', d.get('source', '')[:120],
                              f'{abbr or book} {ch}:{v}', nsp, v, t, fp.split('/library/')[-1], x, y, tier, prev, book, ch, lo, hi, hflag)
        if hb_end:
            sp_h = H.make_spans(text, a, hb_end); sp_b = H.make_spans(text, hb_end, b)
            spans = sp_h + sp_b
            probs = H.tiling_check(text, a, hb_end, sp_h) + H.tiling_check(text, hb_end, b, sp_b)
            ps, prev, prev_hdr = [], None, False
            if not probs:
                for n, (x, y) in enumerate(spans, 1):
                    is_hdr = y <= hb_end
                    p = mk(n, text[x:y], x, y, None if (prev_hdr and not is_hdr) else prev)   # a body piece never depends on an excluded header piece
                    if is_hdr:
                        p['kind'] = 'scripture_header'; p['excluded'] = 'printed scripture heading block (English and Latin), not commentary'
                    elif prev_hdr:
                        p['flags'].append('first commentary piece after the printed scripture heading block (header not in pool)')
                    ps.append(p); prev = p['id']; prev_hdr = is_hdr
            findings.append(dict(kind='scripture-header', verse=v, msg=f'Calvin section {nid}: first {hb_end - a} chars are the printed scripture heading block (English + Latin); {len([p for p in ps if p.get("kind") == "scripture_header"])} pieces marked scripture_header and kept out of the pool'))
        else:
            spans, probs, ps = cut_note(text, a, b, mk)
        if exc: findings.append(dict(kind='calvin-exception', verse=v, msg=f'Calvin section {s["verse"]} indexed span {sp[0]}-{sp[1]} is a printed heading group; header block ({hb_end - a} chars) set aside, body ({b - hb_end} chars) taken as verse {v}. Pointer: Calvin\'s printed heading covers {sp[0]}-{sp[1]}. Warning only: body may also discuss later verses of the span.'))
        seg = text[a:b]; fb = HEADBLOCK.search(seg, 30)
        foreign = a + fb.start() if fb else None
        if foreign is not None:
            fp_ = [p for p in ps if p['end'] > foreign]
            for p in fp_:
                p['boundary_suspect'] = True; p['flags'].append(f'contains printed scripture heading block of another passage (starts at offset {foreign})')
            findings.append(dict(kind='foreign-tail', verse=v, msg=f'Calvin section {v} ({a}-{b}) contains a printed scripture heading block of another passage at offset {foreign} ({b - foreign} of {b - a} chars: {text[foreign:foreign + 60]!r}...). {len(fp_)} of {len(ps)} pieces overlap it and are flagged boundary_suspect.'))
        notes.append(dict(note_id=nid, verse=v, note_span=nsp, start=a, end=b, chars=b - a, pieces=len(spans), tiling_problems=probs, head=s['head'], foreign_tail_start=foreign, heading_group=(list(sp) if exc else None), pointer=(f"Calvin's printed heading covers {sp[0]}-{sp[1]}" if exc else None)))
        if probs: cov[v] = dict(state='extraction failure', detail=probs); continue
        cov[v] = dict(state='confirmed', note_id=nid, **({'pointer': f"Calvin's printed heading covers {sp[0]}-{sp[1]}", 'detail': 'Calvin exception: heading group, body taken as this verse'} if exc else {})); pieces += [p for p in ps if not p.get('excluded')]; excluded_hdr += [p for p in ps if p.get('excluded')]
    for v, c in cov.items():
        if c['state'] == 'pending':
            o = cov.get(c['cover_section'])
            if o and o['state'] == 'confirmed':
                cov[v] = dict(state='confirmed', note_id=o['note_id'], detail=f'inside range note of section {c["cover_section"]} ({c["detail"]})')
            else: cov[v] = dict(state='undetermined', detail=c['detail'] + '; owner section not confirmed')
    findings.append(dict(kind='excluded-pieces', msg=f'{len(excluded_hdr)} scripture_header pieces excluded: {[p["id"] for p in excluded_hdr]}'))
    return dict(file_sha256=sha(raw), text_sha256=sha(text.encode()), index_file_sha256=sha(iraw)), cov, notes, pieces, findings

