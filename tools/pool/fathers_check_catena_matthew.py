#!/usr/bin/env python3
"""Catena Aurea on Matthew ch. 25 (CCEL PDF text) -> registry. Usage: fathers_check_catena_matthew.py HCF_DIR REGISTRY.json CH25_TEXT PDF
CH25_TEXT = chapter 25 of the pdftotext output with running heads/page numbers removed and hyphen breaks joined."""
import sys, re, glob, html, hashlib, tomllib, urllib.parse, json, difflib, os
src = open(os.path.join(os.path.dirname(__file__), 'fathers_check_registry.py')).read()
ns = {'re': re, 'html': html, 'difflib': difflib, 'hashlib': hashlib, 'json': json}
exec(src[src.index('ROM = {'):src.index('class Vol')], ns); exec(src[src.index("let = lambda"):src.index('res = {}')], ns)
hcf, reg, txt, pdf = sys.argv[1:5]; sha = lambda b: hashlib.sha256(b).hexdigest()
HCF_PIN = 'a88dc031b9a1'
def put(res, key, rec):
    """Add a registry record. The key is the sha256 of the HCF quote. Two different source entries with the same quote text would share a key: stop, do not overwrite."""
    old = res.get(key)
    if old and (old.get('file'), old.get('entry')) != (rec.get('file'), rec.get('entry')): raise SystemExit(f'registry key collision: {old.get("file")} #{old.get("entry")} and {rec.get("file")} #{rec.get("entry")} have the same quote')
    rec['quote_sha256'] = key; rec['hcf_commit'] = HCF_PIN; res[key] = rec
hom = open(txt).read(); d = json.load(open(reg)); res = d['entries']
AG = dict(volume='CCEL PDF: Catena Aurea, Gospel of Matthew (Aquinas; file lists William Whiston as translator). Text taken from the PDF, not the XML', ccel_file_sha256=sha(open(pdf, 'rb').read()), ccel_rights='not stated in the file')
for f in sorted(glob.glob(f'{hcf}/*/*.toml')):
    for i, e in enumerate(tomllib.load(open(f, 'rb')).get('commentary', []), 1):
        u = re.sub(r'^.*file=', '', urllib.parse.unquote(urllib.parse.unquote(e.get('source_url', ''))))
        if 'Catena Aurea/Commentary on Matthew/Chapter 25' not in u: continue
        q = e['quote']; r = ns['check'](q, hom); oth = r.get('other', [])
        # citation tags such as "(De Civ. Dei, xx. 1.)" are printed in the margin in this edition; "daemons" is the PDF's spelling of "dæmons"
        benign = lambda o: (o['tag'] == 'insert' and not o['ccel'] and re.fullmatch(r'(de civ dei|gal|[a-z ]{2,24})( [xivl]+)?', o['hcf'].strip())) or (o['ccel'] == 'daemons' and o['hcf'] == 'd mons') or (o['hcf'] in ('d mons are spirits without bodies',) and not o['ccel'])
        if r['status'] == 'other' and oth and all(benign(o) for o in oth):
            r = dict(status='editors-marks', editors_marks=['citation tag in the HCF text that the PDF prints in the margin', 'dæmons / daemons spelling'])
        elif r['status'] == 'other' and any(len(o['ccel']) > 80 for o in oth):
            r = dict(status='other', note='needs a person: HCF entry joins separate Catena paragraphs (other authors between them are skipped) and a few word differences; no automatic corrections applied', candidate_differences=dict(gaps=r.get('gaps'), corrections=r.get('corrections'), other=[o for o in oth if len(o['ccel']) <= 80][:12]))
        put(res, sha(q.encode()), dict(file=f'{f.split("/")[-2]}/{os.path.basename(f)}', entry=i, source=u, homily='Catena Aurea, Matthew 25', against=AG, **r))
s = {}
for v in res.values(): s[v['status']] = s.get(v['status'], 0) + 1
d['summary'] = s; json.dump(d, open(reg, 'w'), indent=1, ensure_ascii=False); print(s)
for v in res.values():
    if v['homily'] == 'Catena Aurea, Matthew 25': print(v['file'], v['entry'], v['status'])
