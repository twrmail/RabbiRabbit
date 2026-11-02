#!/usr/bin/env python3
# Builds library/patches/calvin-from-ccel.json: the full text of selected Calvin chapters taken from CCEL's copy.
# Usage (from the repo root):  python3 tools/build-calvin-patch.py <folder with calcom*.xml> library library/patches/calvin-from-ccel.json
# A chapter is included only if (1) it exists in our library and in CCEL's copy and (2) at least 97% of every 6-word run in our
# chapter is found in CCEL's chapter, i.e. our text is a (shorter) copy of what CCEL has. Nothing else is touched.
import re, json, html, os, sys, hashlib
src, lib, out = sys.argv[1:4]
BOOKS = {'ZEC': 30, 'MAL': 30, '1TI': 43, '2TI': 43, 'TIT': 43}   # book code -> CCEL volume
NAMES = {'Zechariah': 'ZEC', 'Malachi': 'MAL', 'First Timothy': '1TI', 'Second Timothy': '2TI', 'Titus': 'TIT', 'Philemon': 'PHM'}
H = lambda s: hashlib.sha256(s.encode('utf-8')).hexdigest()
def clean(x):
    x = re.sub(r'<note\b.*?</note>', '', x, flags=re.S)
    x = re.sub(r'<script.*?</script>', '', x, flags=re.S)
    x = re.sub(r'<[^>]+>', ' ', x); x = html.unescape(x)
    return re.sub(r'\s+', ' ', x).strip()
def chapters_of(vol):
    s = open(os.path.join(src, 'calcom%02d.xml' % vol), encoding='utf-8', errors='replace').read()
    s = s[s.index('</ThML.head>'):]
    tags = []
    for m in re.finditer(r'<div([1-4])\b[^>]*>', s):
        t = re.search(r'title="([^"]*)"', m.group(0))
        tags.append((m.start(), int(m.group(1)), t.group(1) if t else ''))
    ctx = None; got = {}
    for i, (p, L, t) in enumerate(tags):
        if t.startswith('Commentary on '):
            nm = re.sub(r'\s+\d.*$', '', t[len('Commentary on '):]).strip()
            if nm in NAMES: ctx = NAMES[nm]
        m = re.match(r'Chapter (\d+)$', t)
        if m and ctx:
            e = len(s)
            for q, L2, t2 in tags[i + 1:]:
                if re.match(r'^(Chapter \d+$|Commentary on |Translation of|Indexes|Scripture Translations|List of|Ancient|Dissertations)', t2): e = q; break
            got.setdefault(ctx, {}).setdefault(int(m.group(1)), clean(s[p:e]))
    return got
tok = lambda s: re.findall(r"[^\W_]+", s.lower().replace('’', "'"))
entries = []
for vol in sorted(set(BOOKS.values())):
    got = chapters_of(vol)
    for code in [b for b, v in BOOKS.items() if v == vol]:
        d = json.load(open(os.path.join(lib, 'commentary', 'Calvin', code + '.json'), encoding='utf-8'))
        for c in d['chapters']:
            new = got.get(code, {}).get(c['chapter'])
            if new is None: print('no CCEL chapter', code, c['chapter']); continue
            O, C = tok(c['commentary']), tok(new)
            sh = set(tuple(C[i:i + 6]) for i in range(len(C) - 5))
            cov = sum(1 for i in range(len(O) - 5) if tuple(O[i:i + 6]) in sh) / max(1, len(O) - 5)
            if cov < 0.97: print('SKIP (coverage %.3f)' % cov, code, c['chapter']); continue
            entries.append(dict(book=code, chapter=c['chapter'], beforeSha256=H(c['commentary']), afterSha256=H(new), oursChars=len(c['commentary']), ccelChars=len(new), coverage=round(cov, 3), text=new))
patch = dict(schemaVersion=1, id='calvin-from-ccel',
  purpose='Zechariah, Malachi, 1 and 2 Timothy and Titus in our copy hold only 6-10% of each chapter. Every 6-word run of our text is found in CCEL, which has the whole chapter.',
  source=dict(comparedWith='CCEL, Calvin Translation Society commentaries (ThML), https://ccel.org/ccel/calvin/calcom30.xml and calcom43.xml', footnotes='left out, as in our copy'),
  method='Each entry gives the chapter text from CCEL (tags removed, footnotes removed, whitespace collapsed), the sha256 of our chapter before and of this text after, and the share of our 6-word runs found in CCEL.',
  chapters=entries)
with open(out, 'w', encoding='utf-8') as f:
    f.write(json.dumps({k: v for k, v in patch.items() if k != 'chapters'}, ensure_ascii=False)[:-1] + ',"chapters":[\n' + ',\n'.join(json.dumps(e, ensure_ascii=False, separators=(',', ':')) for e in entries) + '\n]}\n')
print('chapters', len(entries), 'bytes', os.path.getsize(out))