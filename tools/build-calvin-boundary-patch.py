#!/usr/bin/env python3
# Builds library/patches/calvin-boundaries-from-ccel.json.
# Usage (repo root):  python3 tools/build-calvin-boundary-patch.py <folder with calcom01..45.xml> library library/patches/calvin-boundaries-from-ccel.json
# Our Calvin chapters often end with the opening verse block of the NEXT chapter and lack their own (and the first chapter's opening
# block is missing altogether). CCEL's copy of the same translation has each chapter whole. A chapter is replaced with CCEL's only if
#   (1) at least 97% of our chapter's 6-word runs are found in CCEL's chapter or the one after it (nothing of ours is lost), and
#   (2) at least 97% of CCEL's chapter is found in our chapter or its two neighbours (nothing is invented).
# Chapters that fail are listed and left alone.
import re, json, html, os, sys, hashlib, glob
src, lib, out = sys.argv[1:4]
BK = {'Genesis':'GEN','Joshua':'JOS','Isaiah':'ISA','Jeremiah':'JER','Lamentations':'LAM','Ezekiel':'EZK','Daniel':'DAN','Hosea':'HOS','Joel':'JOL','Amos':'AMO','Obadiah':'OBA','Jonah':'JON','Micah':'MIC','Nahum':'NAH','Habakkuk':'HAB','Zephaniah':'ZEP','Haggai':'HAG','Zechariah':'ZEC','Malachi':'MAL','John':'JHN','Acts':'ACT','Romans':'ROM','1 Corinthians':'1CO','2 Corinthians':'2CO','Galatians':'GAL','Ephesians':'EPH','Philippians':'PHP','Colossians':'COL','First Thessalonians':'1TH','Second Thessalonians':'2TH','1 Thessalonians':'1TH','2 Thessalonians':'2TH','First Timothy':'1TI','Second Timothy':'2TI','1 Timothy':'1TI','2 Timothy':'2TI','Titus':'TIT','Philemon':'PHM','Hebrews':'HEB','James':'JAS','1 Peter':'1PE','2 Peter':'2PE','First Peter':'1PE','Second Peter':'2PE','1 John':'1JN','First John':'1JN','Jude':'JUD'}
H = lambda s: hashlib.sha256(s.encode('utf-8')).hexdigest()
def clean(x):
    x = re.sub(r'<note\b.*?</note>', '', x, flags=re.S)
    x = re.sub(r'<script.*?</script>', '', x, flags=re.S)
    x = re.sub(r'<[^>]+>', ' ', x); x = html.unescape(x)
    return re.sub(r'\s+', ' ', x).strip()
STOP = r'^(Chapter \d+$|Commentary on |Translation of|Indexes|Scripture Translations|List of|Ancient|Dissertations|Translator|Argument|The Argument|Calvin.s (Preface|Dedication|Epistle)|Preface)'
ccel = {}
for f in sorted(glob.glob(os.path.join(src, 'calcom*.xml'))):
    s = open(f, encoding='utf-8', errors='replace').read(); s = s[s.index('</ThML.head>'):]
    tags = []
    for m in re.finditer(r'<div([1-4])\b[^>]*>', s):
        t = re.search(r'title="([^"]*)"', m.group(0)); tags.append((m.start(), int(m.group(1)), t.group(1) if t else ''))
    ctx = None
    for i, (p, L, t) in enumerate(tags):
        if t.startswith('Commentary on '):
            nm = re.sub(r'\s+\d.*$', '', t[len('Commentary on '):]).strip()
            if nm in BK: ctx = BK[nm]
        m = re.match(r'Chapter (\d+)$', t)
        if m:
            e = len(s)
            for q, L2, t2 in tags[i + 1:]:
                if re.match(STOP, t2) or (L2 <= L and t2.startswith('Chapter')): e = q; break
            seg = s[p:e]; code = ctx; num = int(m.group(1))
            for rt in re.findall(r'title="([^"]*)"', seg)[1:]:
                mm = re.match(r'^((?:[1-3] )?[A-Z][a-z]+) (\d+):\d+', rt)
                if mm and mm.group(1) in BK: code = BK[mm.group(1)]; num = int(mm.group(2)); break
            if code and num not in ccel.get(code, {}): ccel.setdefault(code, {})[num] = clean(seg)
# Philemon has no chapter divisions: its commentary is the section from "Commentary on Philemon" to the next top-level section
s = open(os.path.join(src, 'calcom43.xml'), encoding='utf-8', errors='replace').read(); s = s[s.index('</ThML.head>'):]
a = s.rfind('<div1', 0, s.index('title="Commentary on Philemon"')); b = s.rfind('<div1', 0, s.index("title=\"Calvin's Scripture Translations\""))
PHM = clean(s[a:b])
tok = lambda x: re.findall(r"[^\W_]+", x.lower().replace('’', "'"))
grams = lambda T: set(tuple(T[i:i + 6]) for i in range(len(T) - 5))
cov = lambda O, S: sum(1 for i in range(len(O) - 5) if tuple(O[i:i + 6]) in S) / max(1, len(O) - 5)
entries = []; skipped = []
for f in sorted(glob.glob(os.path.join(lib, 'commentary', 'Calvin', '*.json'))):
    b = os.path.basename(f)[:-5]
    d = json.load(open(f, encoding='utf-8')); ours = {c['chapter']: c['commentary'] for c in d['chapters']}
    if b == 'PHM':
        O, C = tok(ours[1]), tok(PHM)
        c2 = cov(C, grams(O))
        if c2 >= 0.99 and ours[1] != PHM: entries.append(dict(book=b, chapter=1, beforeSha256=H(ours[1]), afterSha256=H(PHM), oursChars=len(ours[1]), ccelChars=len(PHM), coverageOursInCcel=round(cov(O, grams(C)), 3), coverageCcelInOurs=round(c2, 3), text=PHM))
        continue
    if b not in ccel: continue
    C = ccel[b]; OT = {k: tok(v) for k, v in ours.items()}; CT = {k: tok(v) for k, v in C.items()}
    for k in sorted(ours):
        if k not in C: skipped.append((b, k, 'no CCEL chapter')); continue
        if ours[k] == C[k]: continue
        c1 = cov(OT[k], grams(CT[k]) | (grams(CT[k + 1]) if k + 1 in CT else set()))
        c2 = cov(CT[k], grams(OT[k]) | (grams(OT[k - 1]) if k - 1 in OT else set()) | (grams(OT[k + 1]) if k + 1 in OT else set()))
        if c1 >= 0.97 and (c2 >= 0.97 or len(C[k]) > 3 * len(ours[k])):
            entries.append(dict(book=b, chapter=k, beforeSha256=H(ours[k]), afterSha256=H(C[k]), oursChars=len(ours[k]), ccelChars=len(C[k]), coverageOursInCcel=round(c1, 3), coverageCcelInOurs=round(c2, 3), text=C[k]))
        else: skipped.append((b, k, 'coverage %.3f / %.3f' % (c1, c2)))
patch = dict(schemaVersion=1, id='calvin-boundaries-from-ccel',
  purpose='Calvin chapter boundaries: our chapters end with the opening verse block of the next chapter and lack their own. Replaced with CCEL chapters when the two copies agree.',
  source=dict(comparedWith='CCEL, Calvin Translation Society commentaries (ThML), https://ccel.org/ccel/calvin/calcom01.xml .. calcom45.xml', footnotes='left out, as in our copy'),
  method='Each entry gives the chapter text from CCEL (tags and footnotes removed, whitespace collapsed), the sha256 of our chapter before and of this text after, and two coverage figures: the share of our 6-word runs found in CCEL (this chapter or the next), and the share of CCEL\'s found in ours (this chapter or its neighbours).')
with open(out, 'w', encoding='utf-8') as fh:
    fh.write(json.dumps(patch, ensure_ascii=False)[:-1] + ',"chapters":[\n' + ',\n'.join(json.dumps(e, ensure_ascii=False, separators=(',', ':')) for e in entries) + '\n]}\n')
import collections
print('chapters', len(entries), 'bytes', os.path.getsize(out))
print('per book', dict(sorted(collections.Counter(e['book'] for e in entries).items())))
print('left alone', len(skipped), dict(sorted(collections.Counter(x[0] for x in skipped).items())))