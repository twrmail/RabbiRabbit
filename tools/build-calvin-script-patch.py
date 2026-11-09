#!/usr/bin/env python3
# Builds library/patches/calvin-script.json and a review list: Hebrew and Greek script restored in Calvin on Isaiah and Acts.
# Usage (repo root):  CCEL_DIR=/tmp/ccel python3 tools/build-calvin-script-patch.py library library/patches/calvin-script.json <review.tsv>
# Our Isaiah and Acts were made from a copy in which every Hebrew and Greek word was turned into plain letters
# (CCEL's  חזון (chazon,)  is  chzvn (chazon,)  in ours;  [καθεξης]  is  [kathexes]). The other 46 books keep the real script.
# For each CCEL paragraph that contains script, the matching paragraph of ours is found from the plain text around the script, the plain-letter
# stand-in is swapped for CCEL's own script, and the result is accepted only if the whole paragraph then agrees with CCEL (similarity >= 0.995
# after dropping verse numbers, footnote markers and spacing). Paragraphs that do not pass are left unchanged and listed.
import re, json, html, os, sys, hashlib, difflib, csv
lib, out, review = sys.argv[1:4]
CCEL = os.environ.get('CCEL_DIR', '/tmp/ccel')
H = lambda s: hashlib.sha256(s.encode('utf-8')).hexdigest()
SC = '֐-׿Ͱ-Ͽἀ-῿'
RUN = re.compile('[%s]+(?:[ ־\'’-]*[%s]+)*' % (SC, SC))
ANY = re.compile('[%s]' % SC)
def canon(s):
    s = re.sub(r'\[\d+\]', ' ', s); s = re.sub(r'^\s*\d+\.\s*', '', s)
    return re.sub(r'\s+', ' ', s).strip()
def blocks(vol):
    t = open(os.path.join(CCEL, f'calcom{vol:02d}.xml'), encoding='utf-8').read()
    allm = [m.start() for m in re.finditer(r'<scripCom', t)]
    for m in re.finditer(r'<scripCom[^>]*osisRef="Bible:([^"]*)"[^>]*/>(?:</p>)?\s*(?:<a [^>]*/>)?\s*(?:</p>)?\s*<div class="Commentary"[^>]*>', t):
        i = m.end(); depth = 1; end = None
        for k in re.finditer(r'<div\b|</div>', t[i:]):
            depth += 1 if k.group(0) == '<div' else -1
            if depth == 0: end = i + k.start(); break
        nxt = next((a for a in allm if a >= i), len(t)); body = t[i:min(end or nxt, nxt)]
        body = re.sub(r'<note.*?</note>', '', body, flags=re.S)
        for p in re.findall(r'<p[ >].*?</p>', body, re.S):
            x = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', p))).strip()
            if ANY.search(x): yield m.group(1), x
import unicodedata
QUOTES = {'\u201c': '"', '\u201d': '"', '\u2018': "'", '\u2019': "'", '\u2014': '-', '\u2013': '-'}
def fold(s):
    """Folded text for matching (curly quotes straight, accents off, footnote markers dropped, spaces collapsed, lower case),
    with, for every folded character, the index of the character it came from in s."""
    f = []; idx = []; i = 0; n = len(s)
    while i < n:
        c = s[i]
        if c == '[':
            m = re.match(r'\[\d+\]', s[i:])
            if m: i += m.end(); continue
        if c.isspace():
            if f and f[-1] != ' ': f.append(' '); idx.append(i)
            i += 1; continue
        c = QUOTES.get(c, c)
        base = ''.join(x for x in unicodedata.normalize('NFKD', c) if not unicodedata.combining(x))
        for x in base: f.append(x.lower()); idx.append(i)
        i += 1
    return ''.join(f), idx
def process(code, vols):
    d = json.load(open(os.path.join(lib, 'commentary/Calvin', code + '.json'), encoding='utf-8'))
    chs = {int(c['chapter']): c['commentary'] for c in d['chapters']}
    new = dict(chs); stats = dict(paras=0, resolved=0, unresolved=0, runs=0); rows = []; unres = []
    for vol in vols:
        for ref, x in blocks(vol):
            stats['paras'] += 1
            ch = int(ref.split('.')[1]) if len(ref.split('.')) > 1 and ref.split('.')[1].isdigit() else None
            x2 = re.sub(r'^\d+\.\s*', '', x)                       # our copy has no leading verse number
            parts = re.split('(' + RUN.pattern + ')', x2)             # A0 R1 A1 R2 ... An
            fx, _ = fold(x2); ok = False; why = set()
            for c in [ch, (ch or 0) + 1, (ch or 0) - 1]:
                if c not in new: continue
                paras = new[c].split('\n\n'); first = fold(parts[0])[0].strip()
                if len(first) < 10 and len(parts) > 2: first = fold(parts[2])[0].strip()
                if len(first) < 10: why.add('no-anchor'); continue
                hit = next((pi for pi, q in enumerate(paras) if first[:60] in fold(q)[0]), None)
                if hit is None: why.add('para-not-found'); continue
                q = paras[hit]; fq, qi = fold(q); pos = 0; out_q = ''; cut = 0; good = True; swaps = []
                for i in range(0, len(parts), 2):
                    A = fold(parts[i])[0].strip(' ')
                    if i + 1 >= len(parts): break
                    R = parts[i + 1]
                    nextA = fold(parts[i + 2])[0].strip(' ') if i + 2 < len(parts) else ''
                    # the stand-in sits between the plain text before it (already matched up to pos) and the plain text after it
                    if A:
                        At = A[-40:]                      # the end of the plain text before the script is enough to find the spot
                        m = fq.find(At, pos)
                        if m < 0: good = False; why.add('before-miss'); break
                        pos = m + len(At)
                    # the stand-in: ascii letters, from pos to the start of the next plain text
                    if nextA:
                        m2 = fq.find(nextA[:40], pos)       # the start of the plain text after the script is enough
                        if m2 < 0: good = False; why.add('after-miss'); break
                    else:
                        m2 = len(fq)
                    S = fq[pos:m2]; core = S.strip(' ')
                    if not core or ANY.search(core) or len(core) > 6 * len(R) + 20 or not re.fullmatch(r"[a-z0-9'\-, ]+", core):
                        good = False; why.add('stand-in-bad'); break
                    lo = pos + (len(S) - len(S.lstrip(' '))); hi = m2 - (len(S) - len(S.rstrip(' ')))
                    o_lo = qi[lo]; o_hi = qi[hi - 1] + 1
                    if re.search(r'\[\d+\]', q[o_lo:o_hi]): good = False; why.add('marker-in-stand-in'); break
                    out_q += q[cut:o_lo] + R; cut = o_hi; swaps.append((q[o_lo:o_hi], R)); pos = m2
                if not good: continue
                out_q += q[cut:]
                r = difflib.SequenceMatcher(None, fold(out_q)[0], fx, autojunk=False).ratio()
                if r < 0.995: why.add('ratio-low:%.3f' % r); continue
                paras[hit] = out_q; new[c] = '\n\n'.join(paras); ok = True
                stats['resolved'] += 1; stats['runs'] += len(swaps)
                for a_, b_ in swaps: rows.append((code, c, ref, a_, b_))
                break
            if not ok: stats['unresolved'] += 1; unres.append((code, ref, '[' + ','.join(sorted(why)) + '] ' + x2[:90]))
    return d, chs, new, stats, rows, unres
entries = []; allrows = []; allun = []
for code, vols in (('ISA', (13, 14, 15, 16)), ('ACT', (36, 37))):
    d, chs, new, stats, rows, unres = process(code, vols)
    print(code, stats)
    for c, t in new.items():
        if t != chs[c]:
            orig = next(x for x in d['chapters'] if int(x['chapter']) == c)
            entries.append({'book': code, 'chapter': orig['chapter'], 'beforeSha256': H(chs[c]), 'afterSha256': H(t), 'oursChars': len(chs[c]), 'newChars': len(t), 'text': t})
    allrows += rows; allun += unres
with open(review, 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f, delimiter='\t'); w.writerow(['book', 'chapter', 'reference', 'our stand-in', 'CCEL script']); w.writerows(allrows)
    w.writerow([]); w.writerow(['UNRESOLVED (left unchanged)', '', '', '', '']); w.writerows([(a, '', b, c, '') for a, b, c in allun])
patch = {'schemaVersion': 1, 'id': 'calvin-script',
  'purpose': 'Put back the Hebrew and Greek script that our Isaiah and Acts replaced with plain letters, as CCEL has it. Only the stand-in word is swapped; every other character stays.',
  'source': {'comparedWith': 'CCEL, Calvin Translation Society commentaries (ThML), calcom13 to calcom16 and calcom36, calcom37', 'footnotes': 'left out, as in our copy'},
  'method': 'Each entry gives the whole new chapter text and the sha256 of our chapter before and the new text after. See tools/build-calvin-script-patch.py for how each paragraph is matched and checked.',
  'chapters': entries}
json.dump(patch, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('chapters changed', len(entries), '| unresolved paragraphs', len(allun))
