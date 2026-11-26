#!/usr/bin/env python3
"""Small regression tests for the level-2 (whole-Bible) adapter work. Usage: run_adapter_tests.py LIBRARY_DIR. No model calls, no network."""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('HCF_LOCAL', '/nonexistent')
import books as B, pool_sources as P, henry_parser as H, adapter_wesley as W
lib = sys.argv[1]; ok = bad = 0
def check(name, cond, why=''):
    global ok, bad
    if cond: ok += 1
    else: bad += 1; print('FAIL', name, why)

check('66 books', len(B.ORDER) == 66 and len(set(B.HCF_BOOK.values())) == 66)
check('every book has a library file for Henry', all(os.path.exists(f'{lib}/commentary/MHC/{c}.json') for c in B.ORDER))
check('the six first books keep their earlier names', B.BOOKNAMES['JHN'] == ('Joh', ['Joh', 'John']) and B.BOOKNAMES['1JN'][0] == '1Jo' and B.BOOKNAMES['MRK'][0] == 'Mr')
check('HCF names as the database spells them', B.HCF_BOOK['PSA'] == 'Psalms' and B.HCF_BOOK['SNG'] == 'Song of Solomon' and B.HCF_BOOK['1CO'] == '1 Corinthians')
check('Henry abbreviations are recognised in citations', all(H.REF_RE.search(f'{a} 3:4') for a in B.HENRY_ABBR.values()))
# known gaps answer as absence, never a crash
for name, fn, bk, ch in [('Calvin past Ezekiel 20', P.calvin, 'EZK', 21), ('Wesley 2 Samuel 24', P.wesley, '2SA', 24), ('Tyndale Exodus 36', P.tyndale, 'EXO', 36),
                         ('Gill 1 Chronicles 14 (introduction only)', P.gill, '1CH', 14), ('Barnes in the Old Testament', P.barnes, 'GEN', 1), ('Calvin has no Judges file', P.calvin, 'JDG', 1)]:
    r = fn(lib, bk, ch, 1, 3, 'x')
    check(name, not r[3] and all(c['state'] == 'source absence' for c in r[1].values()) and len(r[1]) == 3, str(r[1]))
# Wesley: a number past the chapter's last verse is not a verse marker (Job 39 prints '33.' for verse 30)
r = P.wesley(lib, 'JOB', 39, 1, 30, 'x')
check('Wesley Job 39: no note anchored past verse 30', all(p['note_span'][1] <= 30 for p in r[3]) and any(f['kind'] == 'marker-beyond-chapter' for f in r[4]))
# Henry: notes that used to fail to tile (cut inside a parenthesis or emphasis pair) now merge pieces instead
for bk, ch in [('1SA', 8), ('2SA', 1), ('DAN', 9), ('MAT', 13)]:
    S, cov, notes, pieces, fi = H.build(lib, bk, ch, 1, 200, 'x')
    check(f'Henry {bk} {ch} tiles', not [n for n in notes if n['tiling_problems']])
check('Henry merged pieces say so', any('cut(s) removed' in f for p in H.build(lib, '1SA', 8, 1, 200, 'x')[3] for f in p['flags']))
print(f'{ok} pass, {bad} FAIL'); sys.exit(1 if bad else 0)
