#!/usr/bin/env python3
"""Calvin: put back the Hebrew and Greek that our Isaiah text still has as plain-letter stand-ins (found by tools/check-calvin-ccel.py).
Usage:  CCEL_DIR=/tmp/ccel python3 -I tools/build-calvin-script-words.py <root> <patch out> <review tsv out>
<root> holds library/commentary/Calvin as it is after the rule calvin-word-fixes and before calvin-notes-split (the order the rules run in).
For each CCEL paragraph with script in it, the matching paragraph of ours (same book and chapter) is compared token by token. A stand-in is replaced
only when ours is plain letters, CCEL's is script, at most 8 CCEL tokens, and the two tokens before and the two after are identical in both copies.
The replacement is CCEL's own text for those words. Output patch: same format as calvin-word-fixes.json (op replace-words).
"""
import re, json, os, sys, glob, hashlib, html, unicodedata, difflib
from collections import defaultdict, Counter
OSIS={'Gen':'GEN','Exod':'EXO','Lev':'LEV','Num':'NUM','Deut':'DEU','Josh':'JOS','Ps':'PSA','Isa':'ISA','Jer':'JER','Lam':'LAM','Ezek':'EZK','Dan':'DAN','Hos':'HOS','Joel':'JOL','Amos':'AMO','Obad':'OBA','Jonah':'JON','Mic':'MIC','Nah':'NAH','Hab':'HAB','Zeph':'ZEP','Hag':'HAG','Zech':'ZEC','Mal':'MAL','Matt':'MAT','Mark':'MRK','Luke':'LUK','John':'JHN','Acts':'ACT','Rom':'ROM','1Cor':'1CO','2Cor':'2CO','Gal':'GAL','Eph':'EPH','Phil':'PHP','Col':'COL','1Thess':'1TH','2Thess':'2TH','1Tim':'1TI','2Tim':'2TI','Titus':'TIT','Phlm':'PHM','Heb':'HEB','Jas':'JAS','1Pet':'1PE','2Pet':'2PE','1John':'1JN','2John':'2JN','3John':'3JN','Jude':'JUD'}
root, out, review = sys.argv[1:4]; CCEL = os.environ.get('CCEL_DIR', '/tmp/ccel')
H = lambda s: hashlib.sha256(s.encode('utf-8')).hexdigest()
def norm1(s):
    s = html.unescape(s).lower().replace('’', "'").replace('‘', "'").replace('­', '')
    return ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c))
def toks(s): return re.findall(r"[^\W_]+", norm1(s))
def spans(s):
    """raw tokens with their places; the token list must equal toks(s) or the paragraph is skipped"""
    sp = [(m.start(), m.end(), norm1(m.group(0))) for m in re.finditer(r"[^\W_]+", s)]
    sp = [x for x in sp if x[2]]
    return sp if [x[2] for x in sp] == toks(s) else None
nonlat = re.compile(r'[^\x00-ɏḀ-ỿ]')
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

chapters = {}
for f in sorted(glob.glob(os.path.join(root, 'library/commentary/Calvin/*.json'))):
    b = os.path.basename(f)[:-5]
    for c in json.load(open(f, encoding='utf8'))['chapters']: chapters[(b, c['chapter'])] = c['commentary']
oursparas = defaultdict(list)
for (b, ch), t in chapters.items():
    off = 0
    for p in t.split('\n\n'):
        if len(toks(p)) >= 3: oursparas[(b, ch)].append((off, p))
        off += len(p) + 2
def bc(ref):
    r = ref.replace('Bible:', '').split('-')[0].split('.')
    return OSIS.get(r[0]), (int(r[1]) if len(r) > 1 and r[1].isdigit() else None)
edits = defaultdict(list); rows = []; stats = Counter()
for f in sorted(glob.glob(os.path.join(CCEL, 'calcom*.xml'))):
    t = open(f, encoding='utf8').read()
    for ref, body in (blocks_div(t) if 'class="Commentary"' in t else blocks_flat(t)):
        b, ch = bc(ref)
        if b is None or (b, ch) not in chapters: continue
        body2 = re.sub(r'<note.*?</note>', '', body, flags=re.S)
        for p in re.findall(r'<p[ >].*?</p>', body2, re.S):
            if re.match(r'<p class="[^"]*(?:SCRIPTURE|Scripture|Footnote)', p): continue
            raw = html.unescape(re.sub(r'<[^>]+>', '', p)); tk = toks(raw)
            if not any(nonlat.search(x) for x in tk): continue
            g = set(zip(*[tk[i:] for i in range(4)])); best = None
            for off, op in oursparas[(b, ch)]:
                t2 = toks(op); s = len(g & set(zip(*[t2[i:] for i in range(4)])))
                if best is None or s > best[0]: best = (s, off, op, t2)
            if not best or best[0] < 3: continue
            _, poff, op, t2 = best
            sm = difflib.SequenceMatcher(None, tk, t2, autojunk=False)
            todo = []
            for tag, a1, a2, b1, b2 in sm.get_opcodes():
                a = tk[a1:a2]; o = t2[b1:b2]
                if tag != 'replace' or not any(nonlat.search(x) for x in a) or any(nonlat.search(x) for x in o): continue
                # a footnote marker such as [135] sitting at the edge of the stand-in stays where it is (it is cut out later by calvin-notes-split)
                while o and o[0].isdigit() and not a[0].isdigit(): o = o[1:]; b1 += 1
                while o and o[-1].isdigit() and not a[-1].isdigit(): o = o[:-1]; b2 -= 1
                if not o: continue
                # two words before and two after must be identical; footnote-marker numbers in ours (the text still has them at this stage) are stepped over
                nd = lambda L: [x for x in L if not x.isdigit()]
                ctx = tk[a1 - 2:a1] == nd(t2[:b1])[-2:] if a1 >= 2 else False
                ctx = ctx and tk[a2:a2 + 2] == nd(t2[b2:])[:2] and a2 + 2 <= len(tk)
                if ctx and len(a) <= 8 and len(o) <= 10: todo.append((a1, a2, b1, b2))
                else: stats['not changed: context or size'] += 1; rows.append(('script', 'not changed', b, ch, ref.replace('Bible:', ''), '', ' '.join(o), ' '.join(a), ''))
            if not todo: continue
            rs, os_ = spans(raw), spans(op)
            if rs is None or os_ is None: stats['paragraph skipped: tokens do not line up with the text'] += 1; continue
            for a1, a2, b1, b2 in todo:
                old = op[os_[b1][0]:os_[b2 - 1][1]]; new = raw[rs[a1][0]:rs[a2 - 1][1]]
                edits[(b, ch)].append(dict(off=poff + os_[b1][0], old=old, new=new, cls='script')); stats['accepted script'] += 1
                rows.append(('script', 'APPLIED', b, ch, ref.replace('Bible:', ''), '', old, new, ''))
chs = []; total = 0
for (b, ch), es in sorted(edits.items()):
    es.sort(key=lambda e: e['off']); clean = []
    for e in es:
        if clean and e['off'] < clean[-1]['off'] + len(clean[-1]['old']): continue
        clean.append(e)
    t = chapters[(b, ch)]; new = t
    for e in sorted(clean, key=lambda e: -e['off']):
        assert new[e['off']:e['off'] + len(e['old'])] == e['old'], (b, ch, e)
        new = new[:e['off']] + e['new'] + new[e['off'] + len(e['old']):]
    total += len(clean); chs.append(dict(book=b, chapter=ch, beforeSha256=H(t), afterSha256=H(new), edits=clean))
json.dump(dict(schemaVersion=1, note="Hebrew and Greek words that were still plain-letter stand-ins in our Calvin, put back from CCEL (see tools/build-calvin-script-words.py). off = place in the text before the change; old must match there.", chapters=chs), open(out, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
with open(review, 'w', encoding='utf8') as fh:
    fh.write('class\tstatus\tbook\tchapter\treference\tbefore\tours\tCCEL\tafter\n')
    for r in rows: fh.write('\t'.join(str(c).replace('\t', ' ').replace('\n', ' ') for c in r) + '\n')
print(dict(stats)); print('chapters', len(chs), 'edits', total)
