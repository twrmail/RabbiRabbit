#!/usr/bin/env python3
"""Calvin equals CCEL: the completeness gate (read-only on the library).
Usage (repo root):  CCEL_DIR=/tmp/ccel python3 -I tools/check-calvin-ccel.py [--write] [--accepted tools/calvin-ccel-audit/gate-accepted.json]
CCEL_DIR holds calcom01.xml .. calcom45.xml (the release asset ccel-calvin-2026-11-10; sha256 in source-originals/ccel-calvin/MANIFEST.json).
Every paragraph of CCEL's commentary (footnotes and Scripture-text lines left out) is looked up, by five-word sequences, in OUR copy of the same
book: the commentary text, the editors' notes layer and the held material. Each paragraph is then one of:
  exact (99%+ of its sequences found), near (85-99%: small wording differences left unchanged on purpose), partial (50-85%), missing (under 50%).
The reverse direction too: each paragraph of ours is looked up in CCEL's whole book text; "extra" = under 85% found.
The gate passes only if every partial, missing and extra paragraph is on the accepted list with a reason. --write records the result in
library/calvin-ccel-gate.json, bound by sha256 to the Calvin files it was run on, so the scorecard can tell when it is stale.
"""
import re, json, os, sys, glob, hashlib, html, unicodedata
from collections import defaultdict, Counter
OSIS={'Gen':'GEN','Exod':'EXO','Lev':'LEV','Num':'NUM','Deut':'DEU','Josh':'JOS','Ps':'PSA','Isa':'ISA','Jer':'JER','Lam':'LAM','Ezek':'EZK','Dan':'DAN','Hos':'HOS','Joel':'JOL','Amos':'AMO','Obad':'OBA','Jonah':'JON','Mic':'MIC','Nah':'NAH','Hab':'HAB','Zeph':'ZEP','Hag':'HAG','Zech':'ZEC','Mal':'MAL','Matt':'MAT','Mark':'MRK','Luke':'LUK','John':'JHN','Acts':'ACT','Rom':'ROM','1Cor':'1CO','2Cor':'2CO','Gal':'GAL','Eph':'EPH','Phil':'PHP','Col':'COL','1Thess':'1TH','2Thess':'2TH','1Tim':'1TI','2Tim':'2TI','Titus':'TIT','Phlm':'PHM','Heb':'HEB','Jas':'JAS','1Pet':'1PE','2Pet':'2PE','1John':'1JN','2John':'2JN','3John':'3JN','Jude':'JUD'}
CCEL = os.environ.get('CCEL_DIR', '/tmp/ccel'); write = '--write' in sys.argv
acc_path = sys.argv[sys.argv.index('--accepted') + 1] if '--accepted' in sys.argv else 'tools/calvin-ccel-audit/gate-accepted.json'
H = lambda s: hashlib.sha256(s.encode('utf-8')).hexdigest()
def toks(s):
    s = s.lower().replace('’', "'").replace('‘', "'").replace('­', '')
    s = ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c))
    return re.findall(r"[^\W_]+", s)
def grams(t, n=5): return [' '.join(t[i:i + n]) for i in range(len(t) - n + 1)]
# ---- ours ----
ours = defaultdict(lambda: defaultdict(list))      # book -> chapter -> tokens (commentary); chapter 0 = notes and held
oursparas = defaultdict(list)
for f in sorted(glob.glob('library/commentary/Calvin/*.json')):
    b = os.path.basename(f)[:-5]
    for c in json.load(open(f, encoding='utf8'))['chapters']:
        ours[b][c['chapter']] = toks(c['commentary'])
        for p in c['commentary'].split('\n\n'):
            if len(toks(p)) >= 5: oursparas[b].append((c['chapter'], p))
for f in sorted(glob.glob('library/commentary-notes/Calvin/*.json')):
    b = os.path.basename(f)[:-5]; d = json.load(open(f, encoding='utf8'))
    txt = ' '.join([n.get('text', '') for n in d.get('notes', [])] + [x.get('text', '') for x in d.get('chapterMatter', [])])
    ours[b][0] += toks(txt)
held = []
for f in sorted(glob.glob('library/held/calvin-held*.json')):
    for it in json.load(open(f, encoding='utf8'))['items']: held += toks(it.get('text', ''))
bookset = {}; chapset = {}
for b, chs in ours.items():
    s = set(); cs = defaultdict(set)
    for ch, t in chs.items():
        for g in grams(t): s.add(g); cs[g].add(ch)
    bookset[b] = s; chapset[b] = cs
heldset = set(grams(held))
bookstr = {b: ' ' + ' '.join(t for ch, tk in sorted(chs.items()) for t in [' '.join(tk)]) + ' ' for b, chs in ours.items()}
heldstr = ' ' + ' '.join(held) + ' '
# ---- CCEL ----
SC = re.compile(r'<scripCom[^>]*osisRef="([^"]*)"[^>]*/>')
DIV = re.compile(r'<scripCom[^>]*osisRef="([^"]*)"[^>]*/>(?:</p>)?\s*(?:<a [^>]*/>)?\s*(?:</p>)?\s*<div class="Commentary"[^>]*>', re.S)
def blocks_div(t):
    allm = [m.start() for m in SC.finditer(t)]
    for m in DIV.finditer(t):
        i = m.end(); depth = 1; end = None
        for k in re.finditer(r'<div\b|</div>', t[i:]):
            depth += 1 if k.group(0) == '<div' else -1
            if depth == 0: end = i + k.start(); break
        nxt = next((a for a in allm if a >= i), len(t))
        if end is None or end > nxt: end = nxt
        yield m.group(1), t[i:end]
def blocks_flat(t):
    ms = list(SC.finditer(t))
    for i, m in enumerate(ms):
        end = ms[i + 1].start() if i + 1 < len(ms) else len(t)
        seg = re.sub(r'<table.*?</table>', '', t[m.end():end], flags=re.S)
        yield m.group(1), re.sub(r'<p class="[^"]*(?:SCRIPTURE|Footnote)[^"]*".*?</p>', '', seg, flags=re.S)
def bc(ref):
    r = ref.replace('Bible:', '').split('-')[0].split('.')
    return OSIS.get(r[0]), (int(r[1]) if len(r) > 1 and r[1].isdigit() else None)
paras = []; ccelall = defaultdict(set); hashes = {}
for f in sorted(glob.glob(os.path.join(CCEL, 'calcom*.xml'))):
    raw = open(f, 'rb').read(); hashes[os.path.basename(f)] = hashlib.sha256(raw).hexdigest(); t = raw.decode('utf8')
    for ref, body in (blocks_div(t) if 'class="Commentary"' in t else blocks_flat(t)):
        b, ch = bc(ref)
        if b is None: continue
        body2 = re.sub(r'<note.*?</note>', '', body, flags=re.S)
        for p in re.findall(r'<p[ >].*?</p>', body2, re.S):
            if re.match(r'<p class="[^"]*(?:SCRIPTURE|Scripture|Footnote)', p): continue
            tk = toks(html.unescape(re.sub(r'<[^>]+>', '', p)))
            if len(tk) >= 3: paras.append((b, ch, ref.replace('Bible:', ''), tk))
    # for the reverse direction: the whole text of every CCEL volume that has commentary on a book (Scripture lines and CCEL's footnotes included)
    vb = {bc(ref)[0] for ref, body in (blocks_div(t) if 'class="Commentary"' in t else blocks_flat(t))} - {None}
    body = t[t.find('<ThML.body>'):] if '<ThML.body>' in t else t
    vs = set(grams(toks(html.unescape(re.sub(r'<[^>]+>', ' ', body))))) | set(grams(toks(html.unescape(re.sub(r'<[^>]+>', ' ', re.sub(r'<note.*?</note>', ' ', body, flags=re.S))))))   # with and without CCEL's footnotes (ours has those in the notes layer)
    for b in vb: ccelall[b] |= vs
ccelset = ccelall
# ---- forward: CCEL paragraph -> ours ----
cls = Counter(); flagged = []; elsewhere = []
for b, ch, ref, tk in paras:
    if b not in bookset: cls['book not in library'] += 1; flagged.append(dict(side='ccel', kind='missing', book=b, chapter=ch, ref=ref, coverage=0, text=' '.join(tk)[:160], key=H(' '.join(tk)))); continue
    g = grams(tk)
    if g:
        hit = sum(1 for x in g if x in bookset[b] or x in heldset); cov = hit / len(g)
        if cov >= 0.85 and ch is not None:
            inch = sum(1 for x in g if ch in chapset[b].get(x, ()) or x in heldset)
            if inch / len(g) < 0.5: elsewhere.append((b, ch, ref))
    else:
        s = ' ' + ' '.join(tk) + ' '; cov = 1.0 if (s in bookstr[b] or s in heldstr) else 0.0
    kind = 'exact' if cov >= 0.99 else 'near' if cov >= 0.85 else 'partial' if cov >= 0.5 else 'missing'
    cls[kind] += 1
    if kind in ('partial', 'missing'): flagged.append(dict(side='ccel', kind=kind, book=b, chapter=ch, ref=ref, coverage=round(cov, 3), text=' '.join(tk)[:160], key=H(' '.join(tk))))
# ---- reverse: our paragraph -> CCEL ----
rev = Counter()
for b, lst in oursparas.items():
    for ch, p in lst:
        tk = toks(p); g = grams(tk)
        if not g: continue
        cov = sum(1 for x in g if x in ccelset.get(b, ())) / len(g)
        if cov >= 0.85: rev['found'] += 1
        else: rev['extra'] += 1; flagged.append(dict(side='ours', kind='extra', book=b, chapter=ch, ref='', coverage=round(cov, 3), text=' '.join(tk)[:160], key=H(' '.join(tk))))
accepted = json.load(open(acc_path, encoding='utf8')) if os.path.exists(acc_path) else {'accepted': []}
acc = {a['key']: a for a in accepted['accepted']}
unaccepted = [f for f in flagged if f['key'] not in acc]; stale = [k for k in acc if k not in {f['key'] for f in flagged}]
libhash = H(''.join(os.path.basename(os.path.dirname(f)) + '/' + os.path.basename(f) + ' ' + H(open(f, encoding='utf8').read()) + '\n' for f in sorted(glob.glob('library/commentary/Calvin/*.json') + glob.glob('library/commentary-notes/Calvin/*.json') + glob.glob('library/held/calvin-held*.json'))))   # the scorecard recomputes this
mf = json.load(open('source-originals/ccel-calvin/MANIFEST.json')); manifest_ok = all(hashes.get(x['file']) == x['sha256'] for x in mf['files']) and len(hashes) == len(mf['files'])
res = dict(schemaVersion=1, ccelFilesMatchManifest=manifest_ok, libraryHash=libhash, ccelParagraphs=len(paras), ccel=dict(cls), ours=dict(rev),
           flaggedTotal=len(flagged), flaggedAccepted=len(flagged) - len(unaccepted), flaggedNotAccepted=len(unaccepted), acceptedNoLongerFlagged=len(stale), movedToAnotherChapter=len(elsewhere))
print(json.dumps(res, indent=1))
for f in unaccepted[:60]: print(f['side'], f['kind'], f['book'], f['chapter'], f['ref'], f['coverage'], f['text'][:100])
if elsewhere: print('in another chapter than CCEL files them under:', len(elsewhere), elsewhere[:12])
if write:
    json.dump(dict(res, flagged=flagged), open('library/calvin-ccel-gate.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1); open('library/calvin-ccel-gate.json', 'a').write('\n')
sys.exit(0 if manifest_ok and not unaccepted and not stale else 1)
