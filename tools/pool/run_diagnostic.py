#!/usr/bin/env python3
"""Diagnostic runner: five passages, five sources (Henry, Calvin, JFB, Gill, Fathers). No model calls.
Usage: python3 run_diagnostic.py LIBRARY_DIR OUT_DIR [PASSAGE_KEY ...]"""
import json, os, sys, re, hashlib, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import henry_parser as H, pool_sources as P

PASSAGES = {
    '1jn2-15':  dict(label='1 John 2:15', book='1JN', ch=2, lo=15, hi=15, abbr='1Jo'),
    'rom13-11': dict(label='Romans 13:11', book='ROM', ch=13, lo=11, hi=11, abbr='Ro'),
    '1jn2-15-17': dict(label='1 John 2:15-17', book='1JN', ch=2, lo=15, hi=17, abbr='1Jo'),
    'rom13-11-14': dict(label='Romans 13:11-14', book='ROM', ch=13, lo=11, hi=14, abbr='Ro'),
    'mrk13-35': dict(label='Mark 13:35', book='MRK', ch=13, lo=35, hi=35, abbr='Mr'),
    'mrk13-32-37': dict(label='Mark 13:32-37', book='MRK', ch=13, lo=32, hi=37, abbr='Mr'),
    'eph1-15-23': dict(label='Ephesians 1:15-23', book='EPH', ch=1, lo=15, hi=23, abbr='Eph'),
    'jhn3-16-18': dict(label='John 3:16-18', book='JHN', ch=3, lo=16, hi=18, abbr='Joh'),
    'jhn3-16-21': dict(label='John 3:16-21', book='JHN', ch=3, lo=16, hi=21, abbr='Joh'),
    'mat25-31-46': dict(label='Matthew 25:31-46', book='MAT', ch=25, lo=31, hi=46, abbr='Mt'),
}
PARALLELS = {'mrk13-35': [dict(label='Matthew 24:42 (parallel of Mark 13:35, report only, never in the Mark pool)', book='MAT', ch=24, lo=42, hi=42, abbr='Mt')]}

def sha(b): return hashlib.sha256(b if isinstance(b, bytes) else b.encode()).hexdigest()

def henry(lib, book, ch, lo, hi, abbr):
    S, cov, notes, pieces, findings = H.build(lib, book, ch, lo, hi, abbr)
    return dict(file_sha256=S['file_sha256'], text_sha256=S['text_sha256'], index_file_sha256=S['idx_file_sha256']), cov, notes, pieces, findings

SOURCES = [('henry', henry), ('calvin', P.calvin), ('jfb', P.jfb), ('gill', P.gill), ('wesley', P.wesley), ('barnes', P.barnes), ('tyndale', P.tyndale), ('scofield', P.scofield), ('fathers', P.fathers)]

def calvin_alt(lib, book, ch, lo, hi, abbr, cov):
    """For range sections excluded by D1, show what the body alone would be if the span only describes the heading block.
    Diagnostic only: never enters the pool."""
    d = json.load(open(f'{lib}/commentary/Calvin/{book}.json'))
    text = [c for c in d['chapters'] if c['chapter'] == ch][0]['commentary']
    out = {}
    for v, c in cov.items():
        alt = c.get('alternative_reading')
        if not alt: continue
        a, b = c['section']['start'], c['section']['end']; sp = c['note_span']
        seg = text[a:b]
        lat = [m.end() for m in re.finditer(rf'(?<![\d:]){sp[1]} ?\.? (?=[A-Z])', seg)]
        start = None
        if len(lat) >= 2:
            m = re.compile(rf'(?<![\d:]){sp[0]} ?\.? (?=[A-Z])').search(seg, lat[1])
            if m: start = a + m.start()
        if start is None: out[v] = dict(error='could not locate body start after the printed heading block'); continue
        spans = H.make_spans(text, start, b)
        out[v] = dict(header_chars=start - a, body_start=start, body_end=b, body_chars=b - start, pieces=len(spans),
                      tiling_problems=H.tiling_check(text, start, b, spans), first_150=text[start:start + 150],
                      header_first_150=text[a:a + 150], note='DIAGNOSTIC ONLY (not in pool). Strict D1 stands unless Tom decides otherwise.')
    return out

def run(lib, key, cfg):
    res = dict(passage=cfg['label'], book=cfg['book'], chapter=cfg['ch'], scope=[cfg['lo'], cfg['hi']], sources={}, findings=[])
    allp = []
    for name, fn in SOURCES:
        try:
            hashes, cov, notes, pieces, findings = fn(lib, cfg['book'], cfg['ch'], cfg['lo'], cfg['hi'], cfg['abbr'])
        except SystemExit as e:
            hashes, cov, notes, pieces, findings = {}, {v: dict(state='extraction failure', detail=str(e)) for v in range(cfg['lo'], cfg['hi'] + 1)}, [], [], [dict(kind='fatal', msg=str(e))]
        except (FileNotFoundError, IndexError, KeyError) as e:
            hashes, cov, notes, pieces, findings = {}, {v: dict(state='extraction failure', detail=f'{type(e).__name__}: {e}') for v in range(cfg['lo'], cfg['hi'] + 1)}, [], [], [dict(kind='fatal', msg=f'{name}: {type(e).__name__}: {e} (a missing file or malformed index is an extraction failure, not "not applicable")')]
        entry = dict(hashes=hashes, coverage={str(k): v for k, v in cov.items()}, notes=notes, pieces=pieces, findings=findings)
        if name == 'calvin':
            alt = calvin_alt(lib, cfg['book'], cfg['ch'], cfg['lo'], cfg['hi'], cfg['abbr'], cov)
            if alt: entry['alternative_readings'] = {str(k): v for k, v in alt.items()}
        res['sources'][name] = entry; allp += pieces
        for f in findings: res['findings'].append(dict(source=name, **f))
    # summary
    verses = list(range(cfg['lo'], cfg['hi'] + 1))
    for p in allp: p['covers_verses'] = [v for v in verses if p['note_span'][0] <= v <= p['note_span'][1]]  # Option B
    res['matrix'] = {name: {str(v): res['sources'][name]['coverage'][str(v)]['state'] for v in verses} for name in res['sources']}
    by_src = collections.Counter(); chars_src = collections.Counter(); by_t = collections.Counter(); chars_t = collections.Counter()
    for p in allp:
        by_src[p['source_id'].split(':')[0]] += 1; chars_src[p['source_id'].split(':')[0]] += len(p['text'])
        by_t[p['teacher_key']] += 1; chars_t[p['teacher_key']] += len(p['text'])
    per_verse = {str(v): dict(pieces=sum(1 for p in allp if p['anchor_verse'] == v), chars=sum(len(p['text']) for p in allp if p['anchor_verse'] == v),
                              teacher_keys=sorted({p['teacher_key'] for p in allp if p['anchor_verse'] == v})) for v in verses}
    per_cov = {str(v): dict(pieces=sum(1 for p in allp if v in p['covers_verses']), chars=sum(len(p['text']) for p in allp if v in p['covers_verses']), notes=len({p['note_id'] for p in allp if v in p['covers_verses']}), teacher_keys=sorted({p['teacher_key'] for p in allp if v in p['covers_verses']})) for v in verses}
    res['summary'] = dict(pieces=len(allp), chars=sum(chars_src.values()), pieces_by_source=dict(by_src), chars_by_source=dict(chars_src),
                          pieces_by_teacher_key=dict(by_t), chars_by_teacher_key=dict(chars_t), per_anchor_verse=per_verse, per_covered_verse=per_cov,
                          rights=dict(collections.Counter(p['rights'] for p in allp)),
                          non_standalone=sum(1 for p in allp if not p['standalone']), boundary_suspect=[p['id'] for p in allp if p['boundary_suspect']],
                          markup_invalid=[p['id'] for p in allp if not p['markup_valid']],
                          notes_with_tiling_problems=[n['note_id'] for s in res['sources'].values() for n in s['notes'] if n['tiling_problems']],
                          note_warnings=[n['note_id'] + ':' + ','.join(k for k in ('opens_mid_outline', 'continues_in_next_note') if n.get(k)) for n in res['sources']['henry']['notes'] if n.get('opens_mid_outline') or n.get('continues_in_next_note')])
    # source fingerprint (brief section 8): hash of sorted (file_sha256, text_sha256) pairs; Fathers file hashes listed individually
    pairs = []
    for s in res['sources'].values():
        h = s['hashes']
        if 'files_sha256' in h: pairs += [(k, v) for k, v in h['files_sha256'].items()]
        else: pairs.append((h.get('file_sha256'), h.get('text_sha256')))
    res['source_problems'] = [f'{n}: {f["msg"]}' for n, s in res['sources'].items() for f in s['findings'] if f['kind'] == 'fatal']
    res['source_fingerprint_sha256'] = None if res['source_problems'] else sha(json.dumps(sorted([[str(a), str(b)] for a, b in pairs]), sort_keys=True, separators=(',', ':'), ensure_ascii=False))
    # verbatim recheck is done in verify.py against fresh slices
    res['parallels'] = {}
    for par in PARALLELS.get(key, []):
        pr = {}
        for name, fn in SOURCES[:4]:
            try:
                _, cov, notes, pieces, _ = fn(lib, par['book'], par['ch'], par['lo'], par['hi'], par['abbr'])
                pr[name] = dict(states={str(k): v['state'] for k, v in cov.items()}, pieces=len(pieces), chars=sum(len(p['text']) for p in pieces),
                                pointers=[v.get('pointer') for v in cov.values() if v.get('pointer')])
            except Exception as e: pr[name] = dict(error=f'{type(e).__name__}: {e}')
        res['parallels'][par['label']] = pr
    return res

def md(res):
    L = [f"# Diagnostic: {res['passage']} (worker 17, no model calls)", '', f"Scope: verses {res['scope'][0]}-{res['scope'][1]} of chapter {res['chapter']} ({res['book']}). Source fingerprint: `{res['source_fingerprint_sha256']}`", '']
    L += ['## 1-2. Coverage per source per verse (brief section 5)', '', '| Verse | ' + ' | '.join(res['matrix']) + ' |', '|---|' + '---|' * len(res['matrix'])]
    for v in res['matrix']['henry']:
        L.append(f'| {v} | ' + ' | '.join(res['matrix'][s][v] for s in res['matrix']) + ' |')
    L += ['', 'Other library sources (Barnes-NT, Wesley, Scofield, Tyndale): no parser in this milestone; not reported as absent.', '']
    L += ['## 3. Source sections examined', '']
    for s, e in res['sources'].items():
        for n in e['notes']:
            L.append(f"- {s}: {n['note_id']} span {n['note_span']} offsets {n['start']}-{n['end']} ({n['chars']} chars, {n['pieces']} pieces)" + (f" TILING PROBLEMS {n['tiling_problems']}" if n['tiling_problems'] else '') + (' [opens mid-outline]' if n.get('opens_mid_outline') else '') + (' [continues in next note]' if n.get('continues_in_next_note') else ''))
    S = res['summary']
    L += ['', '## 4. Pieces extracted', '', f"Total {S['pieces']} pieces, {S['chars']} characters. Rights tiers: {S['rights']}.", '', '| Source | Pieces | Chars |', '|---|---|---|']
    for k in S['pieces_by_source']: L.append(f"| {k} | {S['pieces_by_source'][k]} | {S['chars_by_source'][k]} |")
    L += ['', '| teacher_key | Pieces | Chars | Share |', '|---|---|---|---|']
    for k, v in sorted(S['chars_by_teacher_key'].items(), key=lambda x: -x[1]): L.append(f"| {k} | {S['pieces_by_teacher_key'][k]} | {v} | {100 * v // max(1, S['chars'])}% |")
    L += ['', 'Per verse, counting each note under every requested verse it covers (Option B; a range note is one note, listed under each verse; totals above count each piece once):', '', '| Verse | Pieces (anchored) | Pieces (covering) | Chars (covering) | Notes | Teachers |', '|---|---|---|---|---|---|']
    for v, d in S['per_covered_verse'].items(): L.append(f"| {v} | {S['per_anchor_verse'][v]['pieces']} | {d['pieces']} | {d['chars']} | {d['notes']} | {len(d['teacher_keys'])} |")
    L += ['', '## 5. Excluded notes and pieces', '']
    n_ex = 0
    for s, e in res['sources'].items():
        for v, c in e['coverage'].items():
            if c['state'] in ('present but excluded by range policy', 'extraction failure', 'withheld'):
                n_ex += 1; L.append(f"- {s} verse {v}: {c['state']}. {c.get('pointer') or c.get('detail') or ''}")
        for f in e['findings']:
            if f['kind'] in ('parallel-excluded',): n_ex += 1; L.append(f"- {s}: {f['msg']}")
    if not n_ex: L.append('- none')
    for s, e in res['sources'].items():
        for v, a in e.get('alternative_readings', {}).items():
            L.append(f"- Calvin verse {v} alternative reading (diagnostic only): {a if 'error' in a else str(a['body_chars']) + ' chars of body in ' + str(a['pieces']) + ' pieces after a ' + str(a['header_chars']) + '-char printed heading block'}")
    L += ['', '## 6. Expected material missing', '']
    miss = [(s, v, c) for s, e in res['sources'].items() for v, c in e['coverage'].items() if c['state'] in ('source absence', 'index absence', 'undetermined', 'not applicable')]
    L += [f"- {s} verse {v}: {c['state']}. {c.get('detail', '')}" for s, v, c in miss] or ['- none']
    for s, e in res['sources'].items():
        for v, c in e['coverage'].items():
            if c.get('absent_fathers'): L.append(f"- Fathers verse {v}: no entry from {', '.join(c['absent_fathers'])}")
    L += ['', '## 7. Uncertain boundaries and context', '', f"- Non-standalone pieces: {S['non_standalone']} of {S['pieces']}", f"- boundary_suspect: {S['boundary_suspect'] or 'none'}", f"- markup invalid: {S['markup_invalid'] or 'none'}", f"- Henry outline warnings: {S['note_warnings'] or 'none'}"]
    if res['parallels']:
        L += ['', '## Gospel parallels (D2: report only)', '', '```', json.dumps(res['parallels'], indent=1), '```']
    L += ['', '## 8. Validator output', '', 'See validator report (run separately by validate.py against stand-in and bad plans).', '', '## 9. Findings log', '']
    for f in res['findings']:
        if f['kind'] in ('fathers-files',): L.append(f"- [{f['source']}] files: {f['msg']}")
        else: L.append(f"- [{f['source']}/{f['kind']}] {f['msg']}")
    return '\n'.join(L) + '\n'

if __name__ == '__main__':
    lib, out = sys.argv[1], sys.argv[2]; keys = sys.argv[3:] or list(PASSAGES)
    os.makedirs(out, exist_ok=True)
    for k in keys:
        r = run(lib, k, PASSAGES[k])
        json.dump(r, open(f'{out}/diagnostic-{k}.json', 'w'), indent=1, ensure_ascii=False)
        open(f'{out}/diagnostic-{k}.md', 'w').write(md(r))
        print(k, 'pieces', r['summary']['pieces'], 'chars', r['summary']['chars'], r['matrix'])
