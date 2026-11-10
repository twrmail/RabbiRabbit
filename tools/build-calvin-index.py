#!/usr/bin/env python3
# Builds the verse index for Calvin: library/commentary-index/Calvin/<BOOK>.json
# Usage (repo root):  CCEL_DIR=/tmp/ccel python3 -I tools/build-calvin-index.py library
# Calvin's commentary is kept as repaired chapter text (library/commentary/Calvin), because every repair, hold, move and check works on that text.
# The standard (library/commentary/STANDARD.md) wants to be able to find the note on a verse. This index does that WITHOUT copying or changing
# a word: for each chapter it records where each section of Calvin's commentary starts and ends in the chapter text (character offsets), which
# verse it opens on (from CCEL's own section markers, <scripCom osisRef="Bible:Gen.1.6">), and, where Calvin's own heading gives one
# ("Acts 1:3-5"), the verses it covers. A reader slices the chapter text at the offsets. Each chapter entry carries the sha256 of the exact
# text it was built for, so the index cannot silently go stale: if a chapter's text changes, the scorecard fails until the index is rebuilt.
import re, json, os, sys, glob, html, hashlib, unicodedata
lib = sys.argv[1]; CCEL = os.environ.get('CCEL_DIR', '/tmp/ccel')
H = lambda s: hashlib.sha256(s.encode('utf-8')).hexdigest()
OSIS = {'Gen':'GEN','Exod':'EXO','Lev':'LEV','Num':'NUM','Deut':'DEU','Josh':'JOS','Ps':'PSA','Isa':'ISA','Jer':'JER','Lam':'LAM','Ezek':'EZK','Dan':'DAN','Hos':'HOS','Joel':'JOL','Amos':'AMO','Obad':'OBA','Jonah':'JON','Mic':'MIC','Nah':'NAH','Hab':'HAB','Zeph':'ZEP','Hag':'HAG','Zech':'ZEC','Mal':'MAL','Matt':'MAT','Mark':'MRK','Luke':'LUK','John':'JHN','Acts':'ACT','Rom':'ROM','1Cor':'1CO','2Cor':'2CO','Gal':'GAL','Eph':'EPH','Phil':'PHP','Col':'COL','1Thess':'1TH','2Thess':'2TH','1Tim':'1TI','2Tim':'2TI','Titus':'TIT','Phlm':'PHM','Heb':'HEB','Jas':'JAS','1Pet':'1PE','2Pet':'2PE','1John':'1JN','2John':'2JN','3John':'3JN','Jude':'JUD'}
def norm(s):
    s = html.unescape(s).lower().replace('’', "'").replace('‘', "'")
    s = ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]', '', s)
SC = re.compile(r'<scripCom[^>]*osisRef="([^"]*)"[^>]*/>')
DIV = re.compile(r'<scripCom[^>]*osisRef="([^"]*)"[^>]*/>(?:</p>)?\s*(?:<a [^>]*/>)?\s*(?:</p>)?\s*<div class="Commentary"[^>]*>', re.S)
def blocks(t):
    allm = [m.start() for m in SC.finditer(t)]
    if 'class="Commentary"' in t:
        for m in DIV.finditer(t):
            i = m.end(); depth = 1; end = None
            for k in re.finditer(r'<div\b|</div>', t[i:]):
                depth += 1 if k.group(0) == '<div' else -1
                if depth == 0: end = i + k.start(); break
            nxt = next((a for a in allm if a >= i), len(t))
            if end is None or end > nxt: end = nxt
            yield m.group(1), t[i:end]
    else:
        ms = list(SC.finditer(t))
        for i, m in enumerate(ms):
            end = ms[i + 1].start() if i + 1 < len(ms) else len(t)
            seg = re.sub(r'<table.*?</table>', '', t[m.end():end], flags=re.S)
            seg = re.sub(r'<p class="[^"]*(?:SCRIPTURE|Footnote)[^"]*".*?</p>', '', seg, flags=re.S)
            yield m.group(1), seg
def bref(ref):
    r = ref.replace('Bible:', '').split('-')[0].split('.')
    return OSIS.get(r[0]), (int(r[1]) if len(r) > 1 and r[1].isdigit() else None), (int(r[2]) if len(r) > 2 and r[2].isdigit() else None)
def firstpara(body):
    body = re.sub(r'<note.*?</note>', '', body, flags=re.S)
    for p in re.findall(r'<p[ >].*?</p>', body, re.S):
        x = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', p))).strip()
        if len(norm(x)) >= 40: return x
    return None
B = {}; nblocks = 0
for f in sorted(glob.glob(CCEL + '/calcom*.xml')):
    t = open(f, encoding='utf8').read()
    for ref, body in blocks(t):
        b, ch, v = bref(ref)
        if b and ch and v: B.setdefault((b, ch), []).append((ref.replace('Bible:', ''), v, firstpara(body))); nblocks += 1
def nmap(s):
    out = []; idx = []
    for i, c in enumerate(s):
        for x in norm(c): out.append(x); idx.append(i)
    return ''.join(out), idx
HEAD = re.compile(r'((?:[1-3] ?(?:Samuel|Kings|Chronicles|Corinthians|Thessalonians|Timothy|Peter|John)|[A-Z][a-z]+)\.? (\d+):(\d+)(?:\s*[-–]\s*(\d+))?)\.?(?=\s)')
os.makedirs(os.path.join(lib, 'commentary-index/Calvin'), exist_ok=True)
tot = dict(books=0, chapters=0, blocks=0, placed=0, unplaced=0, outOfOrder=0, noSections=0, headingSpans=0, derivedSpans=0)
perbook = {}
for f in sorted(glob.glob(os.path.join(lib, 'commentary/Calvin/*.json'))):
    code = os.path.basename(f)[:-5]; d = json.load(open(f, encoding='utf8')); chs = []; bst = dict(blocks=0, placed=0, unplaced=0)
    for c in d['chapters']:
        t = c['commentary']; n = c['chapter']
        assert all(ord(x) <= 0xFFFF for x in t), (code, n, 'character outside the BMP: offsets would differ between Python and JavaScript')
        N, idx = nmap(t); pos = 0; cuts = []; unplaced = []
        for ref, v, fp in B.get((code, n), []):
            bst['blocks'] += 1
            if fp is None: unplaced.append(ref); bst['unplaced'] += 1; continue
            k = re.sub(r'^\d+', '', norm(fp))[:45]
            j = N.find(k, pos); mono = True
            if j < 0:
                first = N.find(k)
                if first >= 0 and N.find(k, first + 1) < 0: j = first; mono = False
            if j < 0: unplaced.append(ref); bst['unplaced'] += 1; continue
            if mono: pos = j + 1
            cuts.append(dict(ref=ref, verse=v, off=idx[j], mono=mono))
        # the section opens at its verse number ("12. "), and at Calvin's own heading ("Romans 1:1-7") if that comes just before
        for c2 in cuts:
            o = c2['off']; m = re.search(r'(?<![\w])(\d{1,3}|l)\s*\.?\s*$', t[:o])
            if m and (m.group(1) == 'l' or int(m.group(1)) == c2['verse']): o = m.start(1)
            # Calvin prints a heading ("Acts 1:3-5" or, in the one-block chapters, "Romans 1:1-7") and then his own translation of those verses,
            # before the commentary on them. That passage header belongs with the section that follows it, so the section opens at the heading.
            for h in reversed(list(HEAD.finditer(t[:o]))):
                if o - h.end() > 8000: break
                before = t[max(0, h.start(1) - 2):h.start(1)]
                if int(h.group(2)) == n and int(h.group(3)) == c2['verse'] and (h.start(1) == 0 or before.endswith('\n\n') or re.search(r'[.\u201d"\u2019)] $|CHAPTER \d+ $', t[max(0, h.start(1) - 12):h.start(1)])) and re.match(r'\s*(\d+|l)\s*\.?\s', t[h.end():]):
                    o = h.start(1)
                    if h.group(4) and int(h.group(4)) > c2['verse']: c2['headingSpan'] = [c2['verse'], int(h.group(4))]
                    break
            c2['start'] = o
        cuts.sort(key=lambda x: x['start'])
        dedup = []
        for c2 in cuts:
            if dedup and c2['start'] == dedup[-1]['start']: unplaced.append(c2['ref']); bst['unplaced'] += 1; continue
            dedup.append(c2)
        cuts = dedup; bst['placed'] += len(cuts)
        ordered = all(a['verse'] <= b['verse'] for a, b in zip(cuts, cuts[1:]))
        secs = []
        for i, c2 in enumerate(cuts):
            end = cuts[i + 1]['start'] if i + 1 < len(cuts) else len(t)
            end = len(t[:end].rstrip())
            s = dict(verse=c2['verse'], start=c2['start'], end=end, ref=c2['ref'], head=t[c2['start']:c2['start'] + 30])
            if 'headingSpan' in c2: s['span'] = c2['headingSpan']; tot['headingSpans'] += 1
            elif ordered and i + 1 < len(cuts) and cuts[i + 1]['verse'] - 1 > c2['verse']: s['span'] = [c2['verse'], cuts[i + 1]['verse'] - 1]; s['spanFrom'] = 'next section'; tot['derivedSpans'] += 1
            secs.append(s)
        ov = None
        if secs and len(t[:secs[0]['start']].strip()) > 0: ov = [0, len(t[:secs[0]['start']].rstrip())]
        if not secs and t.strip(): ov = [0, len(t.rstrip())]   # no section markers in CCEL for this chapter: the whole chapter is held as its overview
        e = dict(chapter=n, textSha256=H(t), textLength=len(t))
        if ov: e['overview'] = ov
        e['sections'] = secs
        if not ordered: e['verseOrderNotAscending'] = True; tot['outOfOrder'] += 1
        if unplaced: e['unplaced'] = unplaced
        if not secs: tot['noSections'] += 1
        chs.append(e)
        # self-check: the sections are in text order, inside the text, and start on a letter or digit
        prev = 0
        for s in secs:
            assert prev <= s['start'] < s['end'] <= len(t) and not t[s['start']].isspace(), (code, n, s); prev = s['end']
    for k in ('blocks', 'placed', 'unplaced'): tot[k] += bst[k]
    tot['books'] += 1; tot['chapters'] += len(chs); perbook[code] = bst
    json.dump(dict(book=code, sourceId='calvin', layer='verse-index',
        about='Where each section of Calvin\'s commentary on this book starts and ends in the chapter text (character offsets into library/commentary/Calvin/%s.json), and which verse it opens on. Built from CCEL\'s own section markers by tools/build-calvin-index.py. No text is copied. "span" gives the verses a section covers: from Calvin\'s own heading where there is one, otherwise "next section" (every verse up to the next commented verse). Several sections may open on the same verse; read all. "unplaced" lists CCEL sections we could not find in our text. "head" is the first 30 characters of the section, to catch an offset that has moved. Overview and sections together cover the whole chapter text, apart from the white space between them. A chapter entry is valid only for the text whose sha256 it records.' % code,
        chapters=chs), open(os.path.join(lib, 'commentary-index/Calvin', code + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(tot)
print({b: '%d/%d' % (v['placed'], v['blocks']) for b, v in perbook.items() if v['placed'] != v['blocks']})
