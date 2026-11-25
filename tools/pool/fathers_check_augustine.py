#!/usr/bin/env python3
"""Add Augustine entries to pool/fathers-source-checks.json (same rules as the Chrysostom registry).
Usage: python3 tools/fathers_check_augustine.py HCF_DIR REGISTRY.json NPNF103 NPNF107 NPNF108"""
import sys, re, glob, html, hashlib, tomllib, urllib.parse, json, difflib, os
src = open(os.path.join(os.path.dirname(__file__), 'fathers_check_registry.py')).read()
ns = {'re': re, 'html': html, 'difflib': difflib, 'hashlib': hashlib, 'json': json}
exec(src[src.index('ROM = {'):src.index('class Vol')], ns)
exec(src[src.index("let = lambda"):src.index('res = {}')], ns)
hcf, reg, v3, v7, v8 = sys.argv[1:6]
sha = lambda b: hashlib.sha256(b).hexdigest()
TITLES = {v3: 'NPNF1-03. St. Augustin: On the Holy Trinity (tr. Arthur West Haddan)',
          v7: 'NPNF1-07. St. Augustin: Gospel of John, First Epistle of John (tr. Gibb & Innes; Browne, rev. Myers)',
          v8: 'NPNF1-08. St. Augustin: Expositions on the Psalms (Oxford Library of the Fathers tr.)'}
SPANS = [  # (url fragment, volume, start, end, label)
 ('On The Trinity/Book 1.html', v3, 79360, 234613, 'On the Trinity 1'),
 ('TRACTATES ON JOHN/Tractate 68.html', v7, 1911672, 1926389, 'Tractate 68 on John'),
 ('First Epistle of John/Homily 2.html', v7, 2816890, 2863967, 'Homily 2 on 1 John'),
 ('PSALMS/Psalm 6.html', v8, 151221, 187348, 'Psalm 6'),
 ('PSALMS/Psalm 8.html', v8, 247019, 284316, 'Psalm 8'),
 ('PSALMS/Psalm 10.html', v8, 327063, 352452, 'Psalm 10 (NPNF Psalm X)'),
 ('PSALMS/Psalm 37.html', v8, 760773, 850965, 'Psalm 37 (NPNF Psalm XXXVII)')]
d = json.load(open(reg)); res = d['entries']
raw = {}; fsha = {}
for p in (v3, v7, v8):
    raw[p] = open(p, encoding='utf-8', errors='replace').read(); fsha[p] = sha(open(p, 'rb').read())
for f in sorted(glob.glob(f'{hcf}/Augustine of Hippo/*.toml')):
    for i, e in enumerate(tomllib.load(open(f, 'rb')).get('commentary', []), 1):
        u = re.sub(r'^.*file=', '', urllib.parse.unquote(urllib.parse.unquote(e.get('source_url', '')))); q = e['quote']
        rec = dict(file=f'Augustine of Hippo/{os.path.basename(f)}', entry=i, source=u)
        s = next((x for x in SPANS if x[0] in u), None)
        if s:
            hom = ns['clean'](raw[s[1]][s[2]:s[3]])
            rec.update(homily=s[4], against=dict(volume=TITLES[s[1]], ccel_file_sha256=fsha[s[1]], ccel_rights='Public Domain'))
            rec.update(ns['check'](q, hom))
        else:
            note = ('Catena Aurea (Aquinas; Newman translation): not yet checked' if 'Catena Aurea' in u else
                    'Letters: checked earlier against the Writings Database, not an NPNF volume; tier U stands' if u.endswith('Letters.html') else
                    'no public-domain full text found to check against (looks like a modern translation); stays withheld')
            rec.update(homily=u, status='unchecked', note=note)
        res[sha(q.encode())] = rec
summary = {}
for r in res.values(): summary[r['status']] = summary.get(r['status'], 0) + 1
d['summary'] = summary; d['note'] = 'Chrysostom and Augustine excerpts (HCF, pinned) checked against CCEL NPNF1 full text. Key = sha256 of the HCF entry quote.'
json.dump(d, open(reg, 'w'), indent=1, ensure_ascii=False)
print(len(res), summary)
for r in res.values():
    if r['file'].startswith('Augustine'): print(r['file'], r['entry'], r['homily'], r['status'], json.dumps(r.get('corrections') or r.get('gaps') or '')[:160])
