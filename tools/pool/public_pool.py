#!/usr/bin/env python3
"""Write a public copy of a diagnostic pool report: pieces in rights tiers C and U are dropped (their text may not be committed to this
public repo). Coverage, hashes and the source fingerprint are kept as they are, so a public-build plan validates and fingerprints the
same against the copy as against the full report. The script fails if any dropped piece's text still appears anywhere in the copy.
usage: public_pool.py FULL_REPORT.json PUBLIC_REPORT.json"""
import json, sys

def main(src, dst):
    r = json.load(open(src)); dropped = []
    for name, e in r['sources'].items():
        keep = [p for p in e.get('pieces', []) if p.get('rights') in ('A', 'B')]
        dropped += [p for p in e.get('pieces', []) if p.get('rights') not in ('A', 'B')]
        e['pieces'] = keep
    r['public_copy'] = dict(note='Pieces in rights tiers C and U removed; everything else unchanged.', pieces_removed=len(dropped))
    s = json.dumps(r, ensure_ascii=False, indent=1)
    # Look for withheld text everywhere in the copy except inside the kept passages' own words: those are public by definition, and they
    # often share Scripture quotations with a withheld passage (e.g. Augustine and Henry both quoting 1 John 2:15), which is not a leak.
    r2 = json.loads(s)
    for e in r2['sources'].values():
        for p in e['pieces']: p['text'] = ''
    s_outside = json.dumps(r2, ensure_ascii=False, indent=1)
    def probes(t):
        e = json.dumps(t, ensure_ascii=False)[1:-1]
        return [e[i:i + 60] for i in range(0, max(1, len(e) - 60), 60)] if len(e) >= 60 else []
    leaks = [p['id'] for p in dropped if any(x in s_outside for x in probes(p['text']))]
    if leaks: sys.exit(f'withheld text still present in the copy: {leaks[:10]}')
    open(dst, 'w').write(s + '\n')
    print(f'kept {sum(len(e["pieces"]) for e in r["sources"].values())} pieces, removed {len(dropped)} (tiers C/U); no withheld text left')

if __name__ == '__main__': main(*sys.argv[1:3])
