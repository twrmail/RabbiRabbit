#!/usr/bin/env python3
"""Fresh re-slice check: every piece must equal its source text at (start,end). Usage: verify.py LIB REPORTS_DIR"""
import json, sys, glob, os, tomllib, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pool_sources as P
lib, rep = sys.argv[1], sys.argv[2]
def chap(src, book, ch):
    return [c for c in json.load(open(f'{lib}/commentary/{src}/{book}.json'))['chapters'] if c['chapter'] == ch][0]
bad = tot = bmp = 0
for f in sorted(glob.glob(f'{rep}/diagnostic-*.json')):
    d = json.load(open(f)); book, ch = d['book'], d['chapter']; texts = {}
    for name, e in d['sources'].items():
        for p in e['pieces']:
            tot += 1
            if name == 'henry': src = chap('MHC', book, ch)['commentary']
            elif name == 'calvin': src = chap('Calvin', book, ch)['commentary']
            elif name == 'jfb': src = chap('JFB', book, ch)['commentary']
            elif name == 'gill': src = chap('Gill', book, ch)['verses'][str(p['anchor_verse'])]
            elif name == 'wesley': src = json.load(open(f'{lib}/commentary/Wesley/{book}.json'))['chapters'][str(ch)]
            elif name in ('barnes', 'tyndale'): src = chap({'barnes': 'Barnes-NT', 'tyndale': 'Tyndale'}[name], book, ch)['verses'][str(p['note_span'][0])]
            else:
                dirn, rest = p['source_file'].split('/', 1); fn = rest.split(' [entry ')[0]; i = int(rest.split('[entry ')[1].rstrip(']'))
                raw = P.hcf_get(dirn, fn, '/tmp/hcf-cache'); src = P.fathers_corrected(tomllib.loads(raw.decode())['commentary'][i - 1]['quote'])[0]
            if src[p['start']:p['end']] != p['text']: bad += 1; print('MISMATCH', f, p['id'])
            if max(map(ord, p['text'])) >= 0x10000: bmp += 1
print(f'verified {tot} pieces, mismatches {bad}, pieces with non-BMP characters {bmp}')
