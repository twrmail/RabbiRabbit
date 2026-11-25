#!/usr/bin/env python3
"""Scofield adapter. Our Scofield copy is one string per chapter: a run of notes, each a headword plus text ('born again Regeneration: (1) ...'),
with no verse numbers and no separator between notes. Neither the note boundaries nor the verses can be recovered from the file without guessing,
so this adapter builds NO pieces. It reports the state honestly ('index absence': no verse index in the source) and what the chapter holds."""
import json, re, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pool_common import sha

def scofield(lib, book, ch, lo, hi, abbr=None):
    fp = f'{lib}/commentary/Scofield/{book}.json'; raw = open(fp, 'rb').read(); d = json.loads(raw)
    cc = [c for c in d['chapters'] if c['chapter'] == ch]
    text = cc[0]['commentary'] if cc else ''
    findings = [dict(kind='convention', msg=f'Scofield chapter {ch}: {len(text)} characters in one string, no verse anchors and no note separators; {len(re.findall(rf"\b{re.escape(abbr or book)}? ?{ch}:\d+", text))} scripture references to this chapter (these are cross-references, not anchors). No pieces built.')]
    cov = {v: dict(state='index absence', detail='Scofield in our copy has no verse index and no note boundaries; pieces would need guessing, so none are built') for v in range(lo, hi + 1)}
    return dict(file_sha256=sha(raw), text_sha256=sha(text.encode())), cov, [], [], findings
