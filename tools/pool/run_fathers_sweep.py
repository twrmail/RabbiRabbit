#!/usr/bin/env python3
"""Whole-Bible Fathers sweep (level 2). Reads a full copy of the Historical Christian Faith database at the pinned commit (HCF_LOCAL; the copy must
pass the pin check) and, for every book and chapter, asks the Fathers adapter for the whole chapter. Measures how many entries were found, cut and
re-sliced exactly, and how many pieces would be public (tier B with a Public Domain source check) versus withheld (fail closed).
No model calls, no network. Usage: run_fathers_sweep.py LIBRARY_DIR OUT_DIR [BOOK ...]"""
import json, sys, os, collections, time, tomllib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pool_sources as P
from books import ORDER, BOOKNAMES
lib, out = sys.argv[1], sys.argv[2]; only = sys.argv[3:] or ORDER
os.makedirs(out, exist_ok=True)
t0 = time.time(); R = {}; ex = collections.defaultdict(list); tot = collections.Counter(); by_author = collections.defaultdict(collections.Counter)
_toml = {}; reached = set()
def entry_text(p):
    dirn, rest = p['source_file'].split('/', 1); fn = rest.split(' [entry ')[0]; i = int(rest.split('[entry ')[1].rstrip(']'))
    raw = P.hcf_get(dirn, fn); return P.fathers_corrected(tomllib.loads(raw.decode())['commentary'][i - 1]['quote'])[0]
for book in only:
    web = json.load(open(f'{lib}/bible/WEB/{book}.json'))['chapters']; r = collections.Counter()
    for c in web:
        ch, nv = c['chapter'], len(c['verses'])
        try: _, cov, notes, pieces, findings = P.fathers(lib, book, ch, 1, nv, BOOKNAMES[book][0], nverses=nv)
        except BaseException as e: r['errors'] += 1; ex['error'].append(f'{book} {ch}: {type(e).__name__}: {str(e)[:150]}'); continue
        r['chapters'] += 1; r['notes'] += len(notes); r['pieces'] += len(pieces)
        for n in notes:
            reached.add((n['file'], n['note_id']))
            if n['tiling_problems']: r['tiling_problem_notes'] += 1; ex['tiling'].append(f'{book} {ch}: {n["note_id"]}')
        for f in findings:
            if f['kind'] in ('extraction-failure', 'fatal'): r['fatal'] += 1; ex['fatal'].append(f'{book} {ch}: {f["msg"][:150]}')
            if f['kind'] == 'fathers-withheld': r['entries_withheld_finding'] += 1
        for p in pieces:
            a = p['original_author']; pub = p['rights'] in ('A', 'B') and p.get('public_build', True) is not False
            r['public' if pub else 'withheld'] += 1; by_author[a]['public' if pub else 'withheld'] += 1; by_author[a]['pieces'] += 1
            if entry_text(p)[p['start']:p['end']] != p['text']: r['mismatches'] += 1; ex['mismatch'].append(f'{book} {ch}: {p["id"]}')
            if p['text'] and max(map(ord, p['text'])) >= 0x10000: r['non_bmp'] += 1
    R[book] = dict(r); tot.update(r); print(f'{book} {dict(r)} ({time.time() - t0:.0f}s)', flush=True)
# which database files did the sweep reach? (file-name probing finds files whose verse span fits a window; report the rest)
import glob, re as _re
allfiles = {f'{a}/{os.path.basename(f)}' for a in ('Augustine of Hippo', 'John Chrysostom', 'Thomas Aquinas', 'Cyril of Alexandria') for f in glob.glob(os.path.join(os.environ['HCF_LOCAL'], a, '*.toml')) if os.path.basename(f) != 'metadata.toml'}
got = {f for f, _ in reached}; missed = sorted(allfiles - got)
kinds = collections.Counter('chapter-crossing span' if _re.search(r'_\d+-\d+_\d+', m) else ('whole-chapter or long span' if _re.search(r' \d+\.toml$', m) is None and _re.search(r'_(\d+)-(\d+)\.toml$', m) and int(_re.search(r'_(\d+)-(\d+)\.toml$', m).group(2)) - int(_re.search(r'_(\d+)-(\d+)\.toml$', m).group(1)) > 6 else 'other') for m in missed)
tot['files_in_database'] = len(allfiles); tot['files_reached'] = len(got); tot['files_not_reached'] = len(missed)
json.dump(dict(books=R, totals=dict(tot), by_author={k: dict(v) for k, v in by_author.items()}, examples={k: v[:30] for k, v in ex.items()}, not_reached_kinds=dict(kinds), not_reached_examples=missed[:60]), open(f'{out}/fathers-sweep.json', 'w'), indent=1)
L = ['# Whole-Bible Fathers sweep (level 2)', '', f'Totals: {dict(tot)}', '', '| Author | Pieces | Public | Withheld |', '|---|---|---|---|']
for a, v in sorted(by_author.items()): L.append(f"| {a} | {v['pieces']} | {v['public']} | {v['withheld']} |")
L += ['', f'Files in the four authors\' folders: {len(allfiles)}; reached by the sweep: {len(got)}; not reached: {len(missed)} {dict(kinds)}', '', 'Problems:', ''] + ([f'- {k} ({len(v)}): ' + '; '.join(v[:6]) for k, v in ex.items()] or ['- none'])
open(f'{out}/fathers-sweep.md', 'w').write('\n'.join(L) + '\n'); print('\n'.join(L))
bad = [k for k in ('errors', 'tiling_problem_notes', 'fatal', 'mismatches') if tot[k]]
print('FATHERS SWEEP FAILED: ' + str(bad) if bad else 'FATHERS SWEEP OK: no errors, every note tiles, every piece equals its source slice')
sys.exit(1 if bad else 0)
