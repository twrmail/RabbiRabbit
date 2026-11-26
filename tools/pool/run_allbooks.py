#!/usr/bin/env python3
"""Whole-Bible adapter sweep (level 2). For every book and chapter of the 66, ask each commentary adapter for the whole chapter (verse 1 to the last verse)
and measure: did it run, how many pieces, did the cut tile the source note exactly, does every piece equal its source text at (start,end) (fresh re-slice),
and which verses have material. No model calls, no network, reads library files only. Fathers are not swept here (they need the pinned HCF copy and the
source-check registry; see README).
Usage: run_allbooks.py LIBRARY_DIR OUT_DIR [--baseline FILE | --write-baseline FILE] [BOOK ...]
Writes OUT_DIR/allbooks.json and OUT_DIR/allbooks.md. Exit 1 if any adapter errors, any note fails to tile, any piece differs from its source slice,
any piece names verses outside its chapter, or (with --baseline, all 66 books) any per-source total differs from the recorded baseline."""
import json, sys, os, collections, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import henry_parser as H, pool_sources as P
from books import ORDER, BOOKNAMES
from pool_common import sha

args = sys.argv[1:]; base_f = wbase_f = None
if '--baseline' in args: i = args.index('--baseline'); base_f = args[i + 1]; del args[i:i + 2]
if '--write-baseline' in args: i = args.index('--write-baseline'); wbase_f = args[i + 1]; del args[i:i + 2]
lib, out = args[0], args[1]; only = args[2:] or ORDER
os.makedirs(out, exist_ok=True)
FOLDER = {'henry': 'MHC', 'calvin': 'Calvin', 'jfb': 'JFB', 'gill': 'Gill', 'wesley': 'Wesley', 'barnes': 'Barnes-NT', 'tyndale': 'Tyndale'}
def henry(lib, book, ch, lo, hi, abbr):
    S, cov, notes, pieces, findings = H.build(lib, book, ch, lo, hi, abbr)
    return {}, cov, notes, pieces, findings
FN = {'henry': henry, 'calvin': P.calvin, 'jfb': P.jfb, 'gill': P.gill, 'wesley': P.wesley, 'barnes': P.barnes, 'tyndale': P.tyndale}
_cache = {}
def jload(path):
    if path not in _cache:
        if len(_cache) > 6: _cache.clear()
        _cache[path] = json.load(open(path))
    return _cache[path]
def has_file(src, book): return os.path.exists(f'{lib}/commentary/{FOLDER[src]}/{book}.json')
def chapter_entry(src, book, ch):
    d = jload(f'{lib}/commentary/{FOLDER[src]}/{book}.json')['chapters']
    if src == 'wesley': return d.get(str(ch))
    return next((c for c in d if c['chapter'] == ch), None)
def source_text(src, book, ch, p):
    e = chapter_entry(src, book, ch)
    if src in ('henry', 'calvin', 'jfb'): return e['commentary']
    if src == 'wesley': return e
    if src == 'gill': return e['verses'][str(p['anchor_verse'])]
    return e['verses'][str(p['note_span'][0])]
def nverses(book, ch):
    return len(next(c for c in jload(f'{lib}/bible/WEB/{book}.json')['chapters'] if c['chapter'] == ch)['verses'])

res = {}; t0 = time.time(); examples = collections.defaultdict(list)
for book in only:
    web = jload(f'{lib}/bible/WEB/{book}.json')['chapters']; abbr = BOOKNAMES[book][0]
    res[book] = {}
    for src, fn in FN.items():
        r = dict(file=has_file(src, book), chapters=0, chapters_ran=0, chapters_with_pieces=0, pieces=0, chars=0, errors=0, tiling_problem_notes=0,
                 mismatches=0, span_outside=0, non_bmp=0, verse_states=collections.Counter(), finding_kinds=collections.Counter(), verses=0, verses_with_pieces=0, fatal=0)
        res[book][src] = r
        for c in web:
            ch = c['chapter']; nv = len(c['verses']); r['chapters'] += 1; r['verses'] += nv
            if not r['file']: continue
            try:
                _, cov, notes, pieces, findings = fn(lib, book, ch, 1, nv, abbr)
            except BaseException as e:
                r['errors'] += 1; examples[(src, 'error')].append(f'{book} {ch}: {type(e).__name__}: {str(e)[:140]}'); continue
            r['chapters_ran'] += 1
            for f in findings: r['finding_kinds'][f.get('kind', '?')] += 1
            r['fatal'] += sum(1 for f in findings if f.get('kind') in ('fatal', 'extraction-failure'))
            for f in findings:
                if f.get('kind') in ('fatal', 'extraction-failure'): examples[(src, 'fatal')].append(f'{book} {ch}: {f.get("msg", "")[:160]}')
            if pieces: r['chapters_with_pieces'] += 1
            r['pieces'] += len(pieces); r['chars'] += sum(len(p['text']) for p in pieces)
            bad = [n['note_id'] for n in notes if n.get('tiling_problems')]; r['tiling_problem_notes'] += len(bad)
            for b_ in bad[:2]: examples[(src, 'tiling')].append(f'{book} {ch}: {b_}')
            for v, cv in cov.items(): r['verse_states'][cv['state']] += 1
            r['verses_with_pieces'] += len({v for v in range(1, nv + 1) if any(p['note_span'][0] <= v <= p['note_span'][1] for p in pieces)})
            for p in pieces:
                if p['note_span'][0] < 1 or p['note_span'][1] > nv or p['note_span'][0] > p['note_span'][1]: r['span_outside'] += 1; examples[(src, 'span-outside-chapter')].append(f'{book} {ch}: {p["id"]} {p["note_span"]} of {nv}')
                s = source_text(src, book, ch, p)
                if s[p['start']:p['end']] != p['text']: r['mismatches'] += 1; examples[(src, 'mismatch')].append(f'{book} {ch}: {p["id"]}')
                if p['text'] and max(map(ord, p['text'])) >= 0x10000: r['non_bmp'] += 1
        r['verse_states'] = dict(r['verse_states']); r['finding_kinds'] = dict(r['finding_kinds'])
    print(f'{book} done ({time.time() - t0:.0f}s)', flush=True)
json.dump(dict(books=res, examples={f'{k[0]}:{k[1]}': v[:25] for k, v in examples.items()}), open(f'{out}/allbooks.json', 'w'), indent=1)
# markdown
tot = collections.defaultdict(lambda: collections.Counter())
for book, d in res.items():
    for src, r in d.items():
        for k in ('chapters', 'chapters_ran', 'chapters_with_pieces', 'pieces', 'chars', 'errors', 'tiling_problem_notes', 'mismatches', 'span_outside', 'non_bmp', 'verses', 'verses_with_pieces', 'fatal'): tot[src][k] += r[k]
L = ['# Whole-Bible adapter sweep (level 2)', '', 'Each adapter asked for every chapter, verse 1 to the last verse. No model calls.', '',
     '| Source | Chapters | Ran | With pieces | Pieces | Characters | Errors | Fatal | Tiling problems | Re-slice mismatches | Verses with a piece / all verses |', '|---|---|---|---|---|---|---|---|---|---|---|']
for src in FN:
    t = tot[src]; L.append(f"| {src} | {t['chapters']} | {t['chapters_ran']} | {t['chapters_with_pieces']} | {t['pieces']} | {t['chars']} | {t['errors']} | {t['fatal']} | {t['tiling_problem_notes']} | {t['mismatches']} | {t['verses_with_pieces']} / {t['verses']} |")
L += ['', '## What each adapter reported for each verse (all 66 books)', '', '| Source | ' + ' | '.join(sorted({k for d in res.values() for r in d.values() for k in r['verse_states']})) + ' |']
_ks = sorted({k for d in res.values() for r in d.values() for k in r['verse_states']})
L.append('|---|' + '---|' * len(_ks))
for src in FN: L.append(f'| {src} | ' + ' | '.join(str(sum(d[src]['verse_states'].get(k, 0) for d in res.values())) for k in _ks) + ' |')
L += ['', '## Findings the adapters raised (counts by kind)', '']
for src in FN:
    c = collections.Counter()
    for d in res.values(): c.update(d[src]['finding_kinds'])
    L.append(f'- **{src}**: ' + (', '.join(f'{k} {v}' for k, v in sorted(c.items())) or 'none'))
L += ['', '## Examples of problems (first few per kind)', '']
for k, v in sorted(examples.items()): L += [f'- **{k[0]} {k[1]}** ({len(v)}): ' + '; '.join(v[:6])]
if not examples: L.append('- none')
L += ['', '## Per book (pieces by source)', '', '| Book | ' + ' | '.join(FN) + ' |', '|---|' + '---|' * len(FN)]
for book, d in res.items(): L.append(f'| {book} | ' + ' | '.join(str(d[s]['pieces']) if d[s]['file'] else '-' for s in FN) + ' |')
open(f'{out}/allbooks.md', 'w').write('\n'.join(L) + '\n')
print('\n'.join(L[:14]))
KEYS = ('chapters', 'chapters_ran', 'chapters_with_pieces', 'pieces', 'chars', 'verses_with_pieces')
totals = {src: {k: tot[src][k] for k in KEYS} | {'verse_states': {st: sum(d[src]['verse_states'].get(st, 0) for d in res.values()) for st in sorted({k for d in res.values() for k in d[src]['verse_states']})}} for src in FN}
if wbase_f and len(only) == 66: json.dump(totals, open(wbase_f, 'w'), indent=1); print('baseline written', wbase_f)
fail = [f'{src}: {k} = {tot[src][k]}' for src in FN for k in ('errors', 'fatal', 'tiling_problem_notes', 'mismatches', 'span_outside', 'non_bmp') if tot[src][k]]
if base_f and len(only) == 66:
    b = json.load(open(base_f))
    for src in FN:
        if b.get(src) != totals[src]: fail.append(f'{src}: totals differ from baseline {base_f}: now {totals[src]} was {b.get(src)}')
print('SWEEP FAILED:' if fail else 'SWEEP OK: no errors, every note tiles, every piece equals its source slice, every span inside its chapter' + (', totals equal the baseline' if base_f else ''))
for f in fail: print(' -', f)
sys.exit(1 if fail else 0)
