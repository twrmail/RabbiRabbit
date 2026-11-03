#!/usr/bin/env python3
# Builds library/patches/calvin-moves.json: Calvin text that sits at the end of the wrong chapter (or was dropped by the earlier
# chapter replacements) goes to the start of the chapter it belongs to. Text comes from OUR OWN copy (data/, or library/ where the
# tail is still there): nothing is retyped. CCEL is the witness that the text is genuine (coverage recorded).
# Usage: python3 build-calvin-move-patch.py <repo root> <folder with calcom01..45.xml> <out patch>
import re, json, glob, os, sys, html, hashlib
root, ccel, out = sys.argv[1:4]
H = lambda s: hashlib.sha256(s.encode('utf-8')).hexdigest()
R = re.compile(r"[^\W\d_]+")
W = lambda t: [x.lower() for x in R.findall(t)]
def load(src, code):
    return {c['chapter']: c['commentary'] for c in json.load(open(f'{root}/{src}/commentary/Calvin/{code}.json'))['chapters']}
def clean(x):
    x = re.sub(r'<note\b.*?</note>', '', x, flags=re.S); x = re.sub(r'<script.*?</script>', '', x, flags=re.S)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', x)))
norm = ' '.join(' '.join(W(clean(open(f, encoding='utf-8', errors='replace').read()))) for f in sorted(glob.glob(f'{ccel}/calcom*.xml')))
def witness(text):
    w = W(text); wins = [' '.join(w[i:i + 12]) for i in range(0, max(1, len(w) - 11), 24)]
    return round(sum(1 for x in wins if x in norm) / max(1, len(wins)), 3)
def share_in(text, target):
    tw = W(target); G = set(tuple(tw[i:i + 6]) for i in range(len(tw) - 5)); w = W(text)
    return sum(1 for i in range(len(w) - 5) if tuple(w[i:i + 6]) in G) / max(1, len(w) - 5)
chapters = {}   # (book, chapter) -> dict(before text, cut, prepends)
def ent(book, ch, src='library'):
    k = (book, ch)
    if k not in chapters:
        t = load('library', book)[ch]; chapters[k] = dict(book=book, chapter=ch, before=t, cut=None, prepend=[])
    return chapters[k]
report = []
# A. prefaces and arguments that sit at the end of the previous book
HEAD = re.compile(r"(?:Calvin.s Preface(?: to| To)? ?[A-Za-z]*|THE ARGUMENT|PRELECTIONS OF JOHN CALVIN)")
TAILS = [('library','AMO',9,'OBA'),('library','JON',4,'MIC'),('library','MIC',7,'NAH'),('library','1JN',5,'JAS'),('library','1PE',5,'1JN'),('library','1TH',5,'2TH'),('library','2PE',3,'JUD'),('library','GAL',6,'EPH'),('library','JAS',5,'2PE'),('library','PHP',4,'COL'),('data','HAB',3,'ZEP'),('data','ZEP',3,'HAG'),('data','JER',51,'LAM')]
for src, code, n, tgt in TAILS:
    t = load(src, code)[n]
    m = [x for x in HEAD.finditer(t) if x.start() > len(t) * 0.5][0]; seg = t[m.start():]
    tc = load('library', tgt)[1]
    sub = re.search(r"(?:CHAPTER|Chapter) 1\b", seg)
    if sub and re.match(r"\s*(?:CHAPTER|Chapter) 1\b", tc):
        table = seg[sub.start():]; block = seg[:sub.start()].strip()
        if share_in(table, tc) < 0.85: raise SystemExit(f'{code} {n}: the chapter-1 table is not in {tgt} 1 (share {share_in(table, tc):.2f}); stopping')
        note = 'preface moved; its chapter-1 table is already at the start of the target'
    else:
        block = seg.strip(); note = 'preface and chapter-1 table moved together'
    if src == 'library':
        e = ent(code, n); assert e['before'] == t; e['cut'] = dict(offset=m.start(), length=len(seg), sha256=H(seg))
    ent(tgt, 1)['prepend'].append(block)
    report.append(dict(kind='preface/argument', fromBook=code, fromChapter=n, toBook=tgt, toChapter=1, words=len(block.split()), cutFromLibrary=(src == 'library'), witnessCoverage=witness(block), note=note))
# B. chapter-opening Scripture tables that sit at the end of the previous chapter in our copy and are missing from the library
P = json.load(open(f'{root}/library/patches/calvin-boundaries-from-ccel.json'))['chapters'] + json.load(open(f'{root}/library/patches/calvin-from-ccel.json'))['chapters']
CH = re.compile(r"(?:CHAPTER|Chapter)\s+(\d+)\.?\s+(?:\d\s)?[A-Z][A-Za-z]+(?:\s\d)?[^\d]{0,20}\d+:\d+")
lib_cache = {}
allw = {}
def libgrams(book):
    if book not in allw:
        s = set()
        for c in load('library', book).values():
            w = W(c); s.update(hash(tuple(w[i:i + 6])) for i in range(len(w) - 5))
        allw[book] = s
    return allw[book]
for x in P:
    if x['book'] == 'JER' and x['chapter'] == 51: continue   # tail is the translation of Jeremiah 52 (no commentary) and the Lamentations preface (handled above)
    o = load('data', x['book'])[x['chapter']]
    ms = [m for m in CH.finditer(o) if m.start() > len(o) * 0.5]
    if not ms: continue
    m = ms[-1]; blk = o[m.start():].strip(); w = W(blk)
    if len(w) < 6: continue
    k = int(m.group(1)); lib = load('library', x['book'])
    if k not in lib: continue
    G = libgrams(x['book'])
    miss = sum(1 for i in range(len(w) - 5) if hash(tuple(w[i:i + 6])) not in G) / max(1, len(w) - 5)
    if miss < 0.5: continue
    if re.match(r"\s*(?:CHAPTER|Chapter) %d\b" % k, lib[k]): continue
    ent(x['book'], k)['prepend'].append(blk)
    report.append(dict(kind='chapter-opening table', fromBook=x['book'], fromChapter=x['chapter'], toBook=x['book'], toChapter=k, words=len(blk.split()), cutFromLibrary=False, witnessCoverage=witness(blk), note='in our copy at the end of the previous chapter; the library no longer has it'))
chs = []
for (b, k), e in sorted(chapters.items()):
    t = e['before']; res = t
    if e['cut']: res = t[:e['cut']['offset']].rstrip()
    pre = '\n\n'.join(e['prepend']) if e['prepend'] else None
    if pre: res = pre + '\n\n' + res
    chs.append(dict(book=b, chapter=k, beforeSha256=H(t), afterSha256=H(res), cut=e['cut'], prepend=pre, prependSha256=H(pre) if pre else None))
patch = dict(schemaVersion=1, id='calvin-moves', purpose='Calvin prefaces, arguments and chapter-opening Scripture tables go to the start of the chapter they belong to.',
  source=dict(text='our own copy (data/, or library/ where the tail is still present); nothing retyped', witness='CCEL, Calvin Translation Society commentaries (ThML), https://ccel.org/ccel/calvin/calcom01.xml .. calcom45.xml', witnessCoverage='share of 12-word windows of each block found in the CCEL files'),
  method='A tail is a block of text that begins at a heading (Calvin\'s Preface, The Argument, Chapter N with its Scripture table) and runs to the end of the chapter it sits in. It is cut from there (when the library still has it) and put, with a blank line after it, at the start of the chapter it belongs to. Each chapter records sha256 before and after; a cut records the offset, length and sha256 of the removed text.',
  blocks=report, chapters=chs)
open(out, 'w', encoding='utf-8').write(json.dumps({k: v for k, v in patch.items() if k != 'chapters'}, ensure_ascii=False)[:-1] + ',"chapters":[\n' + ',\n'.join(json.dumps(c, ensure_ascii=False, separators=(',', ':')) for c in chs) + '\n]}\n')
print('blocks', len(report), 'chapters', len(chs), 'cuts', sum(1 for c in chs if c['cut']), 'bytes', os.path.getsize(out))
print('witness coverage min', min(r['witnessCoverage'] for r in report))
for r in report: print(r['kind'][:8], r['fromBook'], r['fromChapter'], '->', r['toBook'], r['toChapter'], r['words'], r['witnessCoverage'])