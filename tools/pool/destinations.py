#!/usr/bin/env python3
"""Rabbi Road and What's Over the Hill destinations, chosen by code from the OpenBible cross-references in library/xref (CC BY,
OpenBible.info). The AI never picks a destination; it only writes around the one chosen here.
 Rabbi Road:    the cross-reference with the most votes from any verse of the study scope, to a single verse outside the study's unit.
 Over the Hill: the cross-reference with the most votes from the Rabbi Road verse, to a single verse outside the unit, not the Road
                verse, and not in the Road verse's own chapter (a second hop goes somewhere new, never back to the start).
Ties go to the earlier reference in the xref file. Verse ranges (targets with an end verse) are skipped.
usage: destinations.py BOOK CHAPTER LO HI UNIT_LO UNIT_HI   (prints both as JSON)"""
import json, os, sys
REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')

def refs(book):
    p = os.path.join(REPO, 'library', 'xref', f'{book}.json')
    return json.load(open(p))['refs'] if os.path.exists(p) else []

def _best(cands):
    best = None
    for i, x in enumerate(cands):
        if best is None or x['v'] > best[1]['v']: best = (i, x)
    return best[1] if best else None

def choose(book, ch, lo, hi, unit_lo, unit_hi):
    inunit = lambda b, c, v: b == book and c == ch and unit_lo <= v <= unit_hi
    road = _best([x for x in refs(book) if x['fc'] == ch and lo <= x['fv'] <= hi and not x.get('ev') and not inunit(x['tb'], x['tc'], x['tv'])])
    if not road: return None
    rb, rc, rv = road['tb'], road['tc'], road['tv']
    hill = _best([x for x in refs(rb) if x['fc'] == rc and x['fv'] == rv and not x.get('ev') and not inunit(x['tb'], x['tc'], x['tv'])
                  and not (x['tb'] == rb and x['tc'] == rc)])
    out = dict(source='OpenBible.info cross references (CC BY)',
               road=dict(book=rb, chapter=rc, verse=rv, votes=road['v'], from_verse=road['fv']))
    out['hill'] = dict(book=hill['tb'], chapter=hill['tc'], verse=hill['tv'], votes=hill['v']) if hill else None
    return out

if __name__ == '__main__':
    a = sys.argv[1:]; print(json.dumps(choose(a[0], *map(int, a[1:6])), indent=1))
