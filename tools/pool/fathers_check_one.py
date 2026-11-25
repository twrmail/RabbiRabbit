#!/usr/bin/env python3
"""Check HCF entries from one work against one stretch of a CCEL volume, using the same rules as fathers_check_registry.py.
Usage: python3 tools/fathers_check_one.py HCF_DIR CCEL_XML START END ENTRY_FILTER_REGEX   (START/END are character positions in the XML)"""
import sys, re, glob, html, hashlib, tomllib, urllib.parse, json, difflib
src = open(__file__.replace('fathers_check_one.py', 'fathers_check_registry.py')).read()
ns = {'re': re, 'html': html, 'difflib': difflib, 'hashlib': hashlib, 'json': json}
exec(src[src.index('ROM = {'):src.index('class Vol')], ns)          # roman numerals, clean()
exec(src[src.index("let = lambda"):src.index('res = {}')], ns)       # let, TOK, REFWORDS, check()
hcf, xml, a, b, flt = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
hom = ns['clean'](open(xml, encoding='utf-8', errors='replace').read()[a:b]); out = {}
for f in sorted(glob.glob(f'{hcf}/Augustine of Hippo/*.toml')):
    for i, e in enumerate(tomllib.load(open(f, 'rb')).get('commentary', []), 1):
        u = re.sub(r'^.*file=', '', urllib.parse.unquote(urllib.parse.unquote(e.get('source_url', ''))))
        if re.search(flt, u):
            r = ns['check'](e['quote'], hom); out[f'{f.split("/")[-1]} #{i}'] = r; print(f.split('/')[-1], i, u, len(e['quote']), json.dumps(r, ensure_ascii=False)[:700])
