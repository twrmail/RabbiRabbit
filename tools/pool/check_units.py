#!/usr/bin/env python3
"""Checks pool/units.json. Usage: check_units.py LIBRARY_DIR UNITS_JSON. No model calls, no network.
Fails if a unit names an unknown book, a chapter or verse that is not in the WEB text, an id that does not match its span,
units that overlap, movements that do not tile the unit exactly (in order, no gaps, no overlaps), or an approved unit
without a named approver and date. A proposed unit must not carry an approver."""
import json, sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from books import ORDER

lib, path = sys.argv[1], sys.argv[2]
units = json.load(open(path))['units']
bad = []
def nverses(book, ch):
    for c in json.load(open(f'{lib}/bible/WEB/{book}.json'))['chapters']:
        if c['chapter'] == ch: return len(c['verses'])
    return 0
seen = {}
for u in units:
    uid = u.get('id', '?')
    if u['book'] not in ORDER: bad.append(f'{uid}: unknown book {u["book"]}'); continue
    n = nverses(u['book'], u['chapter'])
    if not n: bad.append(f'{uid}: chapter {u["chapter"]} not in WEB'); continue
    if not (1 <= u['start'] <= u['end'] <= n): bad.append(f'{uid}: span {u["start"]}-{u["end"]} outside 1-{n}')
    if uid != f'{u["book"]}.{u["chapter"]}.{u["start"]}-{u["end"]}': bad.append(f'{uid}: id does not match its span')
    for other, (ch, s, e) in seen.items():
        if other.split('.')[0] == u['book'] and ch == u['chapter'] and s <= u['end'] and u['start'] <= e: bad.append(f'{uid}: overlaps {other}')
    seen[uid] = (u['chapter'], u['start'], u['end'])
    mv = u.get('movements', [])
    if mv:
        nxt = u['start']
        for m in mv:
            if m['start'] != nxt or m['end'] < m['start'] or not m.get('label'): bad.append(f'{uid}: movement {m["start"]}-{m["end"]} does not continue from {nxt}'); break
            nxt = m['end'] + 1
        else:
            if nxt != u['end'] + 1: bad.append(f'{uid}: movements stop at {nxt - 1}, unit ends at {u["end"]}')
    if u['status'] == 'approved':
        if not u.get('approved_by') or not re.fullmatch(r'\d{4}-\d\d-\d\d', u.get('approved_on') or ''): bad.append(f'{uid}: approved without a named approver and date')
    elif u['status'] == 'proposed':
        if u.get('approved_by') or u.get('approved_on'): bad.append(f'{uid}: proposed but carries an approver')
    else: bad.append(f'{uid}: unknown status {u["status"]}')
for b in bad: print('FAIL', b)
a = sum(u['status'] == 'approved' for u in units)
print(f'{len(units)} units ({a} approved, {len(units) - a} proposed), {len(bad)} problems'); sys.exit(1 if bad else 0)
