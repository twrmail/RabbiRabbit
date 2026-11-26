#!/usr/bin/env python3
"""Add the John 3 Fathers excerpts used by the John 3:16-21 studies to pool/fathers-source-checks.json (same rules as fathers_check_registry.py).
Usage: python3 tools/pool/fathers_check_john.py HCF_DIR REGISTRY.json NPNF101 NPNF107 NPNF114
Checks: Chrysostom Homilies 27 and 28 on John (NPNF1-14), Augustine Confessions Book X (NPNF1-01), Augustine Tractate 12 on John (NPNF1-07). Spans are character positions in the CCEL XML files
whose sha256 is recorded in each record. Only entries checked here get a record; everything else (Catena Aurea, entries with no source URL,
other works) has none and stays withheld by the fail-closed rule."""
import sys, re, glob, hashlib, tomllib, urllib.parse, json, os, html, difflib
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fathers_check_registry.py')).read()
ns = {'re': re, 'html': html, 'difflib': difflib, 'hashlib': hashlib, 'json': json}
exec(src[src.index('ROM = {'):src.index('class Vol')], ns)          # roman numerals, clean()
exec(src[src.index("let = lambda"):src.index('res = {}')], ns)       # let, TOK, REFWORDS, check()
hcf, reg, v1, v7, v14 = sys.argv[1:6]
sha = lambda b: hashlib.sha256(b).hexdigest()
TITLES = {v7: 'NPNF1-07. St. Augustin: Gospel of John, First Epistle of John (tr. Gibb & Innes; Browne, rev. Myers)', v1: "NPNF1-01. The Confessions and Letters of St. Augustin (tr. J. G. Pilkington)",
          v14: 'NPNF1-14. Saint Chrysostom: Homilies on the Gospel of St. John and the Epistle to the Hebrews'}
SPANS = [  # (author folder, url fragment, volume, start, end, label)
 ('John Chrysostom', 'On John/Homily 27.html', v14, 696866, 716208, 'Homily 27 on John (NPNF Homily XXVII, John 3.12,13)'),
 ('John Chrysostom', 'On John/Homily 28.html', v14, 716208, 740806, 'Homily 28 on John (NPNF Homily XXVIII, John 3.17)'),
 ('Augustine of Hippo', 'Confessions/Book 10.html', v1, 1029807, 1202763, 'Confessions Book X'),
 ('Augustine of Hippo', 'TRACTATES ON JOHN/Tractate 12.html', v7, 459794, 491955, 'Tractate 12 on John (NPNF Tractate XII, John 3.6-21)')]
HCF_PIN = 'a88dc031b9a1'
def put(res, key, rec):
    old = res.get(key)
    if old and (old.get('file'), old.get('entry')) != (rec.get('file'), rec.get('entry')): raise SystemExit(f'registry key collision: {old.get("file")} #{old.get("entry")} and {rec.get("file")} #{rec.get("entry")} have the same quote')
    rec['quote_sha256'] = key; rec['hcf_commit'] = HCF_PIN; res[key] = rec
d = json.load(open(reg)); res = d['entries']
raw = {p: open(p, encoding='utf-8', errors='replace').read() for p in (v1, v7, v14)}; fsha = {p: sha(open(p, 'rb').read()) for p in (v1, v7, v14)}
added = []
for author in ('John Chrysostom', 'Augustine of Hippo'):
    for f in sorted(glob.glob(f'{hcf}/{author}/John 3_*.toml')):
        for i, e in enumerate(tomllib.load(open(f, 'rb')).get('commentary', []), 1):
            u = re.sub(r'^.*file=', '', urllib.parse.unquote(urllib.parse.unquote(e.get('source_url', '')))); q = e['quote']
            rec = dict(file=f'{author}/{os.path.basename(f)}', entry=i, source=u)
            s = next((x for x in SPANS if x[0] == author and x[1] in u), None)
            if s:
                hom = ns['clean'](raw[s[2]][s[3]:s[4]])
                rec.update(homily=s[5], against=dict(volume=TITLES[s[2]], ccel_file_sha256=fsha[s[2]], ccel_rights='Public Domain'))
                rec.update(ns['check'](q, hom))
            else: continue   # not checked here: no record, so the fail-closed rule keeps it withheld (Catena Aurea, no source URL, other works)
            key = sha(q.encode())
            if key in res and res[key].get('status') != 'unchecked': continue   # never downgrade an existing check
            put(res, key, rec); added.append(rec)
summary = {}
for r in res.values(): summary[r['status']] = summary.get(r['status'], 0) + 1
d['summary'] = summary; d['note'] = 'Chrysostom and Augustine excerpts (HCF, pinned) checked against CCEL NPNF1 full text. Key = sha256 of the HCF entry quote.'
json.dump(d, open(reg, 'w'), indent=1, ensure_ascii=False)
print(len(res), summary)
for r in added: print(r['file'], r['entry'], r['homily'][:60], r['status'], json.dumps(r.get('corrections') or r.get('gaps') or r.get('note') or '')[:160])
