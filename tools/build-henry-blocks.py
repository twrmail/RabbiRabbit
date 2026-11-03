#!/usr/bin/env python3
# Finds quotation blocks (<verse> plus its <attr>) that CCEL's Henry has and ours lacks, and where they go in our chapter.
# Usage: python3 build-henry-blocks.py <folder with mhc1..6.xml> <library dir> <out patch>
import re, json, html, os, sys, hashlib, difflib
src, lib, out = sys.argv[1:4]
H = lambda s: hashlib.sha256(s.encode('utf-8')).hexdigest()
R = {'I':1,'V':5,'X':10,'L':50,'C':100}
def rom(s):
    s = s.upper(); t = 0
    for i, c in enumerate(s):
        v = R[c]; t += -v if i + 1 < len(s) and R[s[i + 1]] > v else v
    return t
NAMES = {'Genesis':'GEN','Exodus':'EXO','Leviticus':'LEV','Numbers':'NUM','Deuteronomy':'DEU','Joshua':'JOS','Judges':'JDG','Ruth':'RUT','First Samuel':'1SA','Second Samuel':'2SA','First Kings':'1KI','Second Kings':'2KI','First Chronicles':'1CH','Second Chronicles':'2CH','Ezra':'EZR','Nehemiah':'NEH','Esther':'EST','Job':'JOB','Psalms':'PSA','Proverbs':'PRO','Ecclesiastes':'ECC','Song of Solomon':'SNG','Isaiah':'ISA','Jeremiah':'JER','Lamentations':'LAM','Ezekiel':'EZK','Daniel':'DAN','Hosea':'HOS','Joel':'JOL','Amos':'AMO','Obadiah':'OBA','Jonah':'JON','Micah':'MIC','Nahum':'NAH','Habakkuk':'HAB','Zephaniah':'ZEP','Haggai':'HAG','Zechariah':'ZEC','Malachi':'MAL','Matthew':'MAT','Mark':'MRK','Luke':'LUK','John':'JHN','Acts':'ACT','Romans':'ROM','First Corinthians':'1CO','Second Corinthians':'2CO','Galatians':'GAL','Ephesians':'EPH','Philippians':'PHP','Colossians':'COL','First Thessalonians':'1TH','Second Thessalonians':'2TH','First Timothy':'1TI','Second Timothy':'2TI','Titus':'TIT','Philemon':'PHM','Hebrews':'HEB','James':'JAS','First Peter':'1PE','Second Peter':'2PE','First John':'1JN','Second John':'2JN','Third John':'3JN','Jude':'JUD','Revelation':'REV'}
def clean(x):
    x = re.sub(r'<note\b.*?</note>', '', x, flags=re.S); x = re.sub(r'<script.*?</script>', '', x, flags=re.S)
    x = re.sub(r'<[^>]+>', ' ', x); x = html.unescape(x); return re.sub(r'\s+', ' ', x).strip()
raw = {}
for v in range(1, 7):
    s = open(os.path.join(src, 'mhc%d.xml' % v), encoding='utf-8').read(); body = s[s.index('</ThML.head>'):]
    d1 = [(m.start(), m.group(1)) for m in re.finditer(r'<div1\b[^>]*?title="([^"]*)"', body)]
    for i, (p, t) in enumerate(d1):
        if t not in NAMES: continue
        seg = body[p:(d1[i + 1][0] if i + 1 < len(d1) else len(body))]
        d2 = [(m.start(), m.group(1)) for m in re.finditer(r'<div2\b[^>]*?title="([^"]*)"', seg)]
        for j, (q, ct) in enumerate(d2):
            m = re.match(r'Chapter ([IVXLC]+)$', ct)
            if m: raw[(NAMES[t], rom(m.group(1)))] = seg[q:(d2[j + 1][0] if j + 1 < len(d2) else len(seg))]
SUP = str.maketrans('⁰¹²³⁴⁵⁶⁷⁸⁹', '0123456789')
def toks(t):
    t = t.translate(SUP).replace('*', ' ').replace('_', ' ').replace('’', "'")
    return [(m.group(0).lower(), m.start(), m.end()) for m in re.finditer(r"[A-Za-zÀ-ɏͰ-Ͽ֐-׿']{4,}", t)]
def grams(T): return set(tuple(T[i:i + 6]) for i in range(len(T) - 5))
entries = []; note = []
for code in sorted({c for c, _ in raw}):
    d = json.load(open(os.path.join(lib, 'commentary', 'MHC', code + '.json'), encoding='utf-8'))
    for c in d['chapters']:
        k = c['chapter']; r = raw.get((code, k)); ours = c['commentary']
        if r is None: continue
        blocks = []
        for m in re.finditer(r'<verse\b.*?</verse>(?:\s*<attr\b.*?</attr>)?|<ol\b.*?</ol>', r, flags=re.S):
            if m.group(0).startswith('<ol'):
                txt = '\n'.join(clean(li) for li in re.findall(r'<li\b.*?</li>', m.group(0), flags=re.S))
            else: txt = clean(m.group(0))
            blocks.append((m.start(), txt))
        if not blocks: continue
        A = toks(ours); Aw = [x[0] for x in A]; ours_grams = grams(Aw)
        # CCEL text pieces: text before each block (cleaned) gives the anchor position among CCEL tokens
        full = ''; pieces = []
        last = 0
        for pos, btxt in blocks:
            pre = clean(r[last:pos]); last = pos
            pieces.append((pre, btxt))
        # build CCEL token stream with block markers
        cc_text = ''; marks = []
        raw_before = ''
        for n, (pos, btxt) in enumerate(blocks):
            raw_before = clean(r[:pos])  # text before the block, blocks included
            marks.append((len(toks(raw_before)), btxt))
        all_cc = toks(clean(re.sub(r'<verse\b.*?</verse>(?:\s*<attr\b.*?</attr>)?|<ol\b.*?</ol>', ' ', r, flags=re.S)))
        # tokens of CCEL with blocks removed, aligned to ours
        Bw = [x[0] for x in all_cc]
        sm = difflib.SequenceMatcher(None, Aw, Bw, autojunk=False); mb = sm.get_matching_blocks()
        def map_b_to_a(jb):
            # last matched CCEL token index <= jb -> ours token index
            best = None
            for a0, b0, n in mb:
                if b0 <= jb < b0 + n: return a0 + (jb - b0)
                if b0 + n <= jb: best = a0 + n - 1
            return best
        # marks counted tokens in text including blocks; convert: number of tokens before block excluding earlier blocks' tokens
        removed = 0; fixed = []
        for n, (ntok, btxt) in enumerate(marks):
            fixed.append((ntok - removed, btxt)); removed += len(toks(btxt))
        for ntok, btxt in fixed:
            bg = grams([x[0] for x in toks(btxt)])
            bt = [x[0] for x in toks(btxt)]
            if len(bt) >= 6 and bg and sum(1 for g in bg if g in ours_grams) / len(bg) > 0.3: note.append((code, k, 'already present')); continue
            ai = map_b_to_a(ntok - 1) if ntok > 0 else None
            if ai is None: off = 0
            else:
                off = A[ai][2]
                nx = ours.find('\n\n', off)
                off = nx if nx >= 0 else len(ours)
            entries.append(dict(book=code, chapter=k, offset=off, before=ours[max(0, off - 40):off], after=ours[off:off + 40], text=btxt, tokens=len(bt)))
bych = {}
for e in entries: bych.setdefault((e['book'], e['chapter']), []).append(e)
chs = []
for (b, k), es in sorted(bych.items()):
    d = json.load(open(os.path.join(lib, 'commentary', 'MHC', b + '.json'), encoding='utf-8')); t = [c['commentary'] for c in d['chapters'] if c['chapter'] == k][0]
    merged = {}
    for e in es: merged.setdefault(e['offset'], []).append(e)
    es = []
    for off in sorted(merged):
        g = merged[off]; e0 = dict(g[0]); e0['text'] = '\n\n'.join(x['text'] for x in g); es.append(e0)
    res = t
    for e in sorted(es, key=lambda e: -e['offset']): res = res[:e['offset']] + '\n\n' + e['text'] + res[e['offset']:]
    chs.append(dict(book=b, chapter=k, beforeSha256=H(t), afterSha256=H(res), inserts=[dict(offset=e['offset'], before=e['before'], after=e['after'], text=e['text']) for e in es]))
patch = dict(schemaVersion=1, id='henry-quotation-blocks', purpose='Poetry and Latin quotations (with their attributions) that CCEL\'s Henry has and our copy dropped.',
  source=dict(comparedWith='CCEL, Matthew Henry Commentary on the Whole Bible (ThML), https://ccel.org/ccel/henry/mhc1.xml .. mhc6.xml'),
  method='Each block is a <verse> element (with a following <attr>) in CCEL, shown as plain text. It is inserted as its own paragraph after the paragraph that precedes it in CCEL, found in our text by aligning the two chapters word by word and moving to the end of that paragraph. A block is skipped if our chapter already has it. Each chapter records the sha256 before and after.',
  insert='(each insertion carries its own text and goes in as its own paragraph: a blank line, then the text)', chapters=chs)
with open(out, 'w', encoding='utf-8') as fh:
    fh.write(json.dumps({k: v for k, v in patch.items() if k != 'chapters'}, ensure_ascii=False)[:-1] + ',"chapters":[\n' + ',\n'.join(json.dumps(c, ensure_ascii=False, separators=(',', ':')) for c in chs) + '\n]}\n')
print('blocks', len(entries), 'chapters', len(chs), 'bytes', os.path.getsize(out)); print('already present', len(note))