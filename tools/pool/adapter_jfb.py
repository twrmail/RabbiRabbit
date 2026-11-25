#!/usr/bin/env python3
"""JFB adapter for the pool builder (moved out of pool_sources.py, no behaviour change)."""
import json, re, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pool_common import *
from pool_common import sha, tier_of, make_piece, cut_note

def jfb(lib, book, ch, lo, hi, abbr=None):
    fp = f'{lib}/commentary/JFB/{book}.json'; raw = open(fp, 'rb').read(); d = json.loads(raw)
    text = [c for c in d['chapters'] if c['chapter'] == ch][0]['commentary']
    tier = tier_of(lib, 'jfb'); findings, cov, notes, pieces = [], {}, [], []
    marks = []
    for m in re.finditer(r'(?:^|\n)(\d+)(?:-(\d+))?\.(?:\s+|(?=[A-Z"\u201c(\[]))', text):
        l = int(m.group(1)); h = int(m.group(2) or l)
        if marks and l < marks[-1][0] - 0: findings.append(dict(kind='marker-order', msg=f'marker {m.group(0).strip()} at {m.start()} breaks monotonic order; ignored as a note start')); continue
        marks.append((l, h, m.start() + (1 if text[m.start()] == '\n' else 0)))
    findings.append(dict(kind='convention', msg=f'JFB chapter {len(text)} chars; {len(marks)} verse markers: {[(l if l == h else f"{l}-{h}") for l, h, _ in marks]}; max code point U+{max(map(ord, text)):04X}'))
    ends = [marks[i + 1][2] if i + 1 < len(marks) else len(text) for i in range(len(marks))]
    # JFB prints the next section's heading ('Joh 3:22-36. Jesus in ...') at the end of the last verse note; cut it so the piece stays inside its own verses
    HEAD = re.compile(r'\n(?:[1-3] ?)?[A-Z][a-z]{1,5} \d+:\d+(?:-\d+)?\.\s+[^\n]*\s*$')
    trimmed = []
    for i, ((l, h, st), en) in enumerate(zip(marks, ends)):
        m = HEAD.search(text[st:en])
        if m and m.start() > 0:
            trimmed.append(f'{l}' if l == h else f'{l}-{h}'); ends[i] = st + m.start()
    if trimmed: findings.append(dict(kind='next-heading-trimmed', msg=f'JFB note(s) {trimmed} ended with the heading of the next section; heading cut from the piece (not part of the verse note).'))
    notes_all = [dict(lo=l, hi=h, start=st, end=en) for (l, h, st), en in zip(marks, ends)]
    own = {n['lo']: n for n in notes_all if n['lo'] == n['hi']}
    built = {}
    def build_note(n, v0):
        nid = f'JFB.{ch}.{n["lo"]}' + (f'-{n["hi"]}' if n['hi'] != n['lo'] else '')
        if nid in built: return nid
        def mk(k, t, x, y, prev, nid=nid, n=n):
            return make_piece(f'JFB{ch}.{n["lo"]}{"-" + str(n["hi"]) if n["hi"] != n["lo"] else ""}.{k:02d}', nid, 'jfb', 'jfb', 'Jamieson, Fausset & Brown', 'jamieson-fausset-brown', None,
                              'Commentary Critical and Explanatory on the Whole Bible', d.get('source', '')[:120], f'{abbr or book} {ch}:{n["lo"]}' + (f'-{n["hi"]}' if n['hi'] != n['lo'] else ''),
                              [n['lo'], n['hi']], n['lo'], t, fp.split('/library/')[-1], x, y, tier, prev, book, ch, lo, hi)
        spans, probs, ps = cut_note(text, n['start'], n['end'], mk)
        notes.append(dict(note_id=nid, verse=n['lo'], note_span=[n['lo'], n['hi']], start=n['start'], end=n['end'], chars=n['end'] - n['start'], pieces=len(spans), tiling_problems=probs))
        built[nid] = (probs, ps)
        if not probs: pieces.extend(ps)
        return nid
    for v in range(lo, hi + 1):
        n = own.get(v)
        if n is None:
            cover = [x for x in notes_all if x['lo'] <= v <= x['hi'] and x['lo'] != x['hi']]
            if cover:
                c = cover[0]
                if c['lo'] < lo or c['hi'] > hi:
                    cov[v] = dict(state='present but excluded by range policy', detail=f'only inside range note {c["lo"]}-{c["hi"]}', pointer=f'JFB treats {c["lo"]}-{c["hi"]} together'); continue
                nid = build_note(c, v); probs = built[nid][0]
                cov[v] = dict(state='extraction failure', detail=probs) if probs else dict(state='confirmed', note_id=nid, detail=f'inside range note {c["lo"]}-{c["hi"]}')
                continue
            cited = len(re.findall(rf'\b{ch}:{v}\b', text))
            cov[v] = dict(state='source absence', detail=f'no JFB marker for verse {v}; {cited} text citations of {ch}:{v} (may be treated inside a neighbouring note)'); continue
        nid = build_note(n, v); probs = built[nid][0]
        cov[v] = dict(state='extraction failure', detail=probs) if probs else dict(state='confirmed', note_id=nid)
    # range notes that overlap the request but are not wholly inside: report (D1)
    for n in notes_all:
        if n['lo'] != n['hi'] and n['hi'] >= lo and n['lo'] <= hi and (n['lo'] < lo or n['hi'] > hi):
            sep = [k for k in range(n['lo'], n['hi'] + 1) if k in own]
            findings.append(dict(kind='range-note', msg=f'JFB range note {n["lo"]}-{n["hi"]} ({n["end"] - n["start"]} chars) overlaps the request but is not wholly inside; excluded (D1). Separate notes exist for {sep}.'))
    return dict(file_sha256=sha(raw), text_sha256=sha(text.encode())), cov, notes, pieces, findings

