#!/usr/bin/env python3
"""Survey Gill's footnoted quotations across the whole library (no network, no model). usage: survey_gill_quotes.py LIBRARY_DIR"""
import json, glob, os, sys, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import adapter_gill as G, henry_parser as H
lib = sys.argv[1]; C = collections.Counter(); fb = []
for fp in sorted(glob.glob(f'{lib}/commentary/Gill/*.json')):
    d = json.load(open(fp)); bk = d['book']
    for ch in d['chapters']:
        for v, t in ch['verses'].items():
            if not t.strip(): continue
            C['notes'] += 1
            segs, cites = G.segment(t); sp = [(x, y) for x, y, _, _ in segs]
            if H.tiling_check(t, 0, len(t), sp): C['fallback to plain cut'] += 1; fb.append((bk, ch['chapter'], v)); continue
            for (x, y, k, l) in segs:
                if k == 'cited_quote':
                    C['cited quotes'] += 1; c = cites[l]
                    C['  jewish source' if G.JEWISH.search(c['raw'] + ' ' + (c['work'] or '')) else '  other source'] += 1
                    if c['ibid'] and not c['work']: C['  ibid unresolved'] += 1
                if k == 'citation_list': C['footnote lists'] += 1
            if any(k == 'cited_quote' for _, _, k, _ in segs): C['notes with cited quotes'] += 1
for k, n in C.items(): print(f'{n:7d}  {k}')
print('fallbacks', fb[:15])
