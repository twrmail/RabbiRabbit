#!/usr/bin/env python3
# Builds library/patches/calvin-word-fixes.json: small wording differences between our Calvin and CCEL's, taken from CCEL where ours is the damaged one.
# Usage (repo root):  CCEL_DIR=/tmp/ccel python3 -I tools/build-calvin-word-fixes.py <library root> <patch out> <review tsv out>
# For every CCEL paragraph of Calvin the matching words of our chapter are found and compared word by word (case, accents, punctuation and
# quote style ignored). Where they differ, only a few kinds of difference are changed to CCEL's wording, and only when OURS is the one that looks damaged:
#   typo      our word is rare in the whole corpus (5 times or fewer), CCEL's differs by at most 2 letters and is at least 20 times as common
#             (heir -> their, conning -> coming, he re -> here)
#   split     the same letters with the spaces in different places, and our pieces include a fragment that is not a word (at e m -> atem)
#   digits    our number is the start of CCEL's (Galatians 3:1 where CCEL has 3:17: a digit was lost)
#   context   one word differs by at most 2 letters and the word before and after it appear far more often with CCEL's word than with ours
#             across the whole corpus (stay -> slay, front -> from, tie -> he); plural-only differences are left alone
#   joined    our run-together word (judgmentseat) where CCEL has the two words (judgment seat) and ours appears 5 times or fewer
#   omitted   CCEL has 1 to 3 more common words in the middle of a sentence that is otherwise word for word the same (chose the [tribe] of Judah)
#   script    (only in the paragraphs listed in SCRIPT_LEFT) our plain-letter stand-in for a Hebrew or Greek word is replaced by CCEL's script
# Everything else that differs is NOT changed; it is written to the review list with its class, so that nothing is hidden.
import re, json, html, os, sys, glob, hashlib, unicodedata
from collections import Counter, defaultdict
from difflib import SequenceMatcher
root, out, review = sys.argv[1:4]; CCEL = os.environ.get('CCEL_DIR', '/tmp/ccel')
H = lambda s: hashlib.sha256(s.encode('utf-8')).hexdigest()
OSIS = {'Gen':'GEN','Exod':'EXO','Lev':'LEV','Num':'NUM','Deut':'DEU','Josh':'JOS','Ps':'PSA','Isa':'ISA','Jer':'JER','Lam':'LAM','Ezek':'EZK','Dan':'DAN','Hos':'HOS','Joel':'JOL','Amos':'AMO','Obad':'OBA','Jonah':'JON','Mic':'MIC','Nah':'NAH','Hab':'HAB','Zeph':'ZEP','Hag':'HAG','Zech':'ZEC','Mal':'MAL','Matt':'MAT','Mark':'MRK','Luke':'LUK','John':'JHN','Acts':'ACT','Rom':'ROM','1Cor':'1CO','2Cor':'2CO','Gal':'GAL','Eph':'EPH','Phil':'PHP','Col':'COL','1Thess':'1TH','2Thess':'2TH','1Tim':'1TI','2Tim':'2TI','Titus':'TIT','Phlm':'PHM','Heb':'HEB','Jas':'JAS','1Pet':'1PE','2Pet':'2PE','1John':'1JN','2John':'2JN','3John':'3JN','Jude':'JUD'}
SCRIPT_LEFT = {('ISA', 19, 'Isa.19.12'), ('ISA', 22, 'Isa.22.15'), ('ISA', 22, 'Isa.22.23'), ('ISA', 24, 'Isa.24.5'), ('ISA', 26, 'Isa.26.14'), ('ISA', 46, 'Isa.46.4'), ('ISA', 47, 'Isa.47.3'), ('ISA', 58, 'Isa.58.7')}
SCR = '֐-׿Ͱ-Ͽἀ-῿'; ANYSC = re.compile('[%s]' % SCR)
VARIANTS = {frozenset(x) for x in [('vail', 'veil'), ('wroth', 'wrath'), ('shew', 'show'), ('shewed', 'showed')]}   # old and modern spellings of one word: neither is damage
COMMON_SHORT = set('a i o an as at be by do he if in is it me my no of on or so to up us we ye am oh'.split())
def fold(s):
    """lower-case letters and digits only, accents off; returns the folded string and, for each folded character, the index in s"""
    f = []; ix = []
    for i, c in enumerate(s):
        c2 = {'æ': 'ae', 'Æ': 'ae', 'œ': 'oe', 'Œ': 'oe', 'ſ': 's'}.get(c, c)
        for x in unicodedata.normalize('NFKD', c2):
            if unicodedata.combining(x): continue
            x = x.lower()
            if re.match(r'[a-z0-9]', x): f.append(x); ix.append(i)
    return ''.join(f), ix
def tokens(s):
    """words = runs of letters/digits, split at any other character (apostrophes, hyphens, punctuation, spaces); script letters are their own token '§'"""
    toks = []; i = 0; n = len(s)
    while i < n:
        c = s[i]
        if ANYSC.match(c):
            j = i
            while j < n and (ANYSC.match(s[j]) or s[j] in ' ־\'’-' and j + 1 < n and ANYSC.match(s[j + 1])): j += 1
            toks.append(('§', i, j)); i = j; continue
        if re.match(r'[A-Za-z0-9À-ɏ]', c):
            j = i
            while j < n and re.match(r'[A-Za-z0-9À-ɏ]', s[j]): j += 1
            f, _ = fold(s[i:j])
            if f: toks.append((f, i, j))
            i = j; continue
        i += 1
    return toks
def blocks(t):
    allm = [m.start() for m in re.finditer(r'<scripCom', t)]
    DIV = re.compile(r'<scripCom[^>]*osisRef="([^"]*)"[^>]*/>(?:</p>)?\s*(?:<a [^>]*/>)?\s*(?:</p>)?\s*<div class="Commentary"[^>]*>', re.S)
    SC = re.compile(r'<scripCom[^>]*osisRef="([^"]*)"[^>]*/>')
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
def bc(ref):
    r = ref.replace('Bible:', '').split('-')[0].split('.')
    return OSIS.get(r[0]), (int(r[1]) if len(r) > 1 and r[1].isdigit() else None)
lib = {}
for f in glob.glob(os.path.join(root, 'library/commentary/Calvin/*.json')):
    b = os.path.basename(f)[:-5]
    for c in json.load(open(f, encoding='utf-8'))['chapters']: lib[(b, c['chapter'])] = c['commentary']
ptoks = {k: tokens(v) for k, v in lib.items()}
freq = Counter(tk[0] for v in ptoks.values() for tk in v)
paras = []   # (book, chapter, ref, text)
for f in sorted(glob.glob(os.path.join(CCEL, 'calcom*.xml'))):
    t = open(f, encoding='utf-8').read()
    for ref, body in blocks(t):
        b, ch = bc(ref)
        if not b or not ch or (b, ch) not in lib: continue
        body = re.sub(r'<note.*?</note>', '', body, flags=re.S)
        for p in re.findall(r'<p[ >].*?</p>', body, re.S):
            x = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', p))).strip()
            if x: paras.append((b, ch, ref.replace('Bible:', ''), x))
for b, ch, ref, x in paras:
    for tk in tokens(x):
        if tk[0] != '§': freq[tk[0]] += 1
bi = Counter()
for v in ptoks.values():
    nm = [t[0] for t in v]
    for i in range(len(nm) - 1): bi[(nm[i], nm[i + 1])] += 1
for b, ch, ref, x in paras:
    nm = [t[0] for t in tokens(re.sub(r'^\s*(?:\d+|l)\s*\.\s*', '', x))]
    for i in range(len(nm) - 1): bi[(nm[i], nm[i + 1])] += 1
def lev(a, b):
    if abs(len(a) - len(b)) > 2: return 9
    p = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        c = [i]
        for j, cb in enumerate(b, 1): c.append(min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (ca != cb)))
        p = c
    return p[-1]
index = {}
for k, tl in ptoks.items():
    g = defaultdict(list); names = [t[0] for t in tl]
    for i in range(len(names) - 4): g[tuple(names[i:i + 5])].append(i)
    index[k] = g
edits = defaultdict(list); rows = []; stats = Counter()
for b, ch, ref, x in paras:
    x2 = re.sub(r'^\s*(?:\d+|l)\s*\.\s*', '', x); off0 = len(x) - len(x2)
    wt = tokens(x2); w = [t[0] for t in wt]
    if len(w) < 8: continue
    stats['paragraphs'] += 1
    ot = ptoks[(b, ch)]; on = [t[0] for t in ot]; g = index[(b, ch)]
    anchors = [(g[tuple(w[i:i + 5])][0] - i) for i in range(len(w) - 4) if '§' not in w[i:i + 5] and len(g.get(tuple(w[i:i + 5]), [])) == 1]
    if not anchors: stats['no anchor'] += 1; continue
    anchors.sort(); start = anchors[len(anchors) // 2]
    lo = max(0, start - 30); hi = min(len(on), start + len(w) + 60)
    seg = on[lo:hi]
    sm = SequenceMatcher(None, seg, w, autojunk=False)
    ops = sm.get_opcodes()
    eq = [i for i, o in enumerate(ops) if o[0] == 'equal' and o[2] - o[1] >= 3]
    if not eq: stats['no equal run'] += 1; continue
    first, last = eq[0], eq[-1]
    for oi in range(first + 1, last):
        tag, j1, j2, i1, i2 = ops[oi]
        if tag == 'equal': continue
        A = ot[lo + j1:lo + j2]; B = wt[i1:i2]
        aw = [t[0] for t in A]; bw = [t[0] for t in B]
        ctx_before = ' '.join(on[max(0, lo + j1 - 4):lo + j1]); ctx_after = ' '.join(on[lo + j2:lo + j2 + 4])
        cls = None; new = None
        aspan = (A[0][1], A[-1][2]) if A else None
        if tag == 'replace' and len(A) == 1 and len(B) == 1 and aw[0] != '§' and bw[0] != '§':
            if aw[0].isdigit() and bw[0].isdigit() and bw[0].startswith(aw[0]) and len(bw[0]) > len(aw[0]): cls = 'digits'
            elif not aw[0].isdigit() and lev(aw[0], bw[0]) <= 2 and freq[aw[0]] <= 5 and freq[bw[0]] >= 20 * max(1, freq[aw[0]]): cls = 'typo'
        if cls is None and tag == 'replace' and len(A) == 1 and len(B) == 1 and aw[0].isalpha() and bw[0].isalpha() and len(aw[0]) >= 2 and lev(aw[0], bw[0]) <= 2 and not (aw[0] + 's' == bw[0] or bw[0] + 's' == aw[0]) and lo + j1 > 0 and lo + j2 < len(on):
            pv, nx = on[lo + j1 - 1], on[lo + j2]
            sa = bi[(pv, aw[0])] + bi[(aw[0], nx)] - 2; sb = bi[(pv, bw[0])] + bi[(bw[0], nx)] - 2
            if sb >= 2 and sb >= 3 * sa + 1 and frozenset((aw[0], bw[0])) not in VARIANTS: cls = 'context'
        if cls is None and tag == 'replace' and len(A) == 1 and len(B) >= 2 and ''.join(bw) == aw[0] and freq[aw[0]] <= 5 and all(freq[t] >= 20 for t in bw) and '§' not in bw: cls = 'joined'
        if cls is None and tag == 'replace' and len(A) >= 2 and len(B) >= 1 and ''.join(aw) == ''.join(bw) and len(B) < len(A) and '§' not in aw + bw:
            if any(len(t) <= 2 and t not in COMMON_SHORT and not t.isdigit() for t in aw): cls = 'split'
        if cls is None and tag == 'insert' and 1 <= len(B) <= 3 and '§' not in bw and all(t.isalpha() and freq[t] >= 20 for t in bw) and ctx_before and ctx_after:
            cls = 'omitted'
        if cls is None and (b, ch, ref) in SCRIPT_LEFT and tag in ('replace', 'delete', 'insert') and '§' in bw: cls = 'script'
        txt_old = lib[(b, ch)][aspan[0]:aspan[1]] if aspan else ''
        if tag == 'insert':
            # where to put the new words: at the start of the next word of ours (or end of the previous one)
            pos = ot[lo + j1][1] if lo + j1 < len(ot) else None
        stats['differences'] += 1
        if cls:
            if cls == 'omitted':
                ins_at = ot[lo + j1][1] if lo + j1 < len(ot) else ot[lo + j1 - 1][2]
                newtxt = ' '.join(x2[t[1]:t[2]] for t in B) + ' '
                e = dict(off=ins_at, old='', new=newtxt, cls=cls)
            else:
                new_span = (B[0][1], B[-1][2]); newtxt = x2[new_span[0]:new_span[1]]
                if cls in ('digits', 'typo', 'context'): newtxt = x2[B[0][1]:B[0][2]]
                e = dict(off=aspan[0], old=txt_old, new=newtxt, cls=cls)
            edits[(b, ch)].append(e); stats['accepted ' + cls] += 1
            rows.append((cls, 'APPLIED', b, ch, ref, ctx_before, txt_old if tag != 'insert' else '', e['new'].strip(), ctx_after))
        else:
            kind = ('script-or-translit' if ('§' in bw or any(ANYSC.search(x2[t[1]:t[2]]) for t in B)) else 'citation/number' if all(t.isdigit() for t in aw + bw) else tag)
            stats['not changed ' + kind] += 1
            rows.append((kind, 'not changed', b, ch, ref, ctx_before, ' '.join(lib[(b, ch)][t[1]:t[2]] for t in A)[:200], ' '.join(x2[t[1]:t[2]] for t in B)[:200], ctx_after))

# One curated repair: our 1 Corinthians 16 stops in the middle of a footnote ("... And thou dost not su"). The footnote (Beza's lines on Bullinger) had been
# copied into Calvin's paragraph in place of the end of Calvin's own text. From "Now Bullinger" to the end of the chapter we take CCEL's paragraph, which
# is Calvin's own words; the editor's footnote is kept in library/commentary-notes/Calvin/1CO.json (built by tools/build-calvin-notes-split.py).
t1 = lib[('1CO', 16)]; k = t1.index('Now Bullinger, Beza, in his poems'); assert t1.rstrip().endswith('And thou dost not su')
cc = next(x for b, ch, ref, x in paras if ref == '1Cor.16.22' and 'Maranatha, is somewhat more difficult' in x)
new_tail = cc[cc.index('Now Bullinger'):]
assert new_tail.endswith('would be an expression of more intense feeling.')
ex = edits[('1CO', 16)]
assert all(e['off'] + len(e['old']) <= k for e in ex), 'a generated edit overlaps the curated one'
ex.append(dict(off=k, old=t1[k:], new=new_tail, cls='truncated-end')); stats['accepted truncated-end'] += 1
rows.append(('truncated-end', 'APPLIED', '1CO', 16, '1Cor.16.22', t1[k - 30:k], t1[k:][:80] + '...', new_tail[:80] + '...', ''))

# Isaiah 19:12: one more of the 8 paragraphs left with plain letters; the Greek is a whole quotation, too far from CCEL's paragraph for the word match.
t19 = lib[('ISA', 19)]; old19 = 'Kratiston einai para men theou eutuchian, para de hemon auton euboulian,'; assert t19.count(old19) == 1
new19 = re.search(r'id="viii\.i-p142\.1">(.*?)</span>', open(os.path.join(CCEL, 'calcom14.xml'), encoding='utf-8').read()).group(1) + ','  # CCEL calcom14 viii.i-p142: Greek span + the comma after it
edits[('ISA', 19)].append(dict(off=t19.index(old19), old=old19, new=new19, cls='script')); stats['accepted script'] += 1
rows.append(('script', 'APPLIED', 'ISA', 19, 'Isa.19.12', '', old19, new19, ''))
chapters = []; total = 0
for (b, ch), es in sorted(edits.items()):
    es.sort(key=lambda e: e['off'])
    # an edit must never swallow the start of an editors' footnote marker such as " [177" (Isa 26:14): keep the marker, change only the word
    for e in es:
        m = re.search(r'\s*\[\d+$', e['old'])
        if m and not re.search(r'\[\d+$', e['new']): e['old'] = e['old'][:m.start()]
    # drop an edit that overlaps the previous one
    clean = []
    for e in es:
        if clean and e['off'] < clean[-1]['off'] + len(clean[-1]['old']): continue
        clean.append(e)
    t = lib[(b, ch)]; new = t
    for e in sorted(clean, key=lambda e: -e['off']):
        assert new[e['off']:e['off'] + len(e['old'])] == e['old'], (b, ch, e)
        new = new[:e['off']] + e['new'] + new[e['off'] + len(e['old']):]
    total += len(clean)
    chapters.append(dict(book=b, chapter=ch, beforeSha256=H(t), afterSha256=H(new), edits=clean))
json.dump(dict(schemaVersion=1, note='Small wording differences between our Calvin and CCEL, changed to CCEL\'s wording where ours is the damaged one (see tools/build-calvin-word-fixes.py for the five kinds). off = place in the text before the change; old must be found there.', chapters=chapters), open(out, 'w', encoding='utf-8'), ensure_ascii=False)
with open(review, 'w', encoding='utf-8') as fh:
    fh.write('class\tstatus\tbook\tchapter\treference\tbefore (ours)\tours\tCCEL\tafter (ours)\n')
    for r in rows: fh.write('\t'.join(str(c).replace('\t', ' ').replace('\n', ' ') for c in r) + '\n')
print(dict(stats)); print('chapters', len(chapters), 'edits', total)
