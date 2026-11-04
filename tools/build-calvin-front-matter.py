#!/usr/bin/env python3
# Builds four patches (move-blocks format), one category each, for text that sits in the wrong Calvin chapter:
#   calvin-col4-duplicate-table.json         the end of Colossians 4 repeats the opening table of 1 Thessalonians 1, which 1 Thessalonians 1 already holds (cut, verified)
#   calvin-1th-argument.json                 the Argument on 1 Thessalonians sits at the end of Colossians 4; it moves to the start of 1 Thessalonians 1
#   calvin-thessalonian-dedications.json     Calvin's dedication to Corderius (end of Colossians 4) moves to the start of 1 Thessalonians 1; his dedication to
#                                            Textor (end of 1 Thessalonians 5) moves to the start of 2 Thessalonians 1. In the CCEL volume each is the "front" division of
#                                            the commentary it opens (checked in calcom volumes: "Commentary on First/Second Thessalonians", front "Calvin's Dedication").
#   calvin-minor-prophet-tables.json         the English and Latin Scripture table that opens a chapter sits at the end of the chapter before it
#                                            (Jonah 2-4, Micah 2-7, Nahum 2-3); each moves to the start of its own chapter
# Each moved text is cut from one chapter and put at the start of another, and the patch records both ends (the cut's sha256 equals the moved text's sha256).
# Run it only on the library as it was BEFORE these rules were applied. Usage: python3 build-calvin-front-matter.py <repo root> [<output folder>]
import re, json, sys, hashlib, os
root = sys.argv[1]; out = sys.argv[2] if len(sys.argv) > 2 else root
H = lambda s: hashlib.sha256(s.encode('utf-8')).hexdigest()
R = re.compile(r"[^\W\d_]+")
def load(b): return {c['chapter']: c['commentary'] for c in json.load(open(f'{root}/library/commentary/Calvin/{b}.json'))['chapters']}
def share(tail, target):
    tw = [x.lower() for x in R.findall(tail)]; bw = [x.lower() for x in R.findall(target)]
    G = {tuple(bw[i:i + 12]) for i in range(len(bw) - 11)}; return sum(1 for i in range(len(tw) - 11) if tuple(tw[i:i + 12]) in G) / max(1, len(tw) - 11)
def gone(msg): sys.exit(msg + ' If these rules have already been applied, that is expected: this builder only runs on the library as it was before them.')
col, th, jon, mic, nah = load('COL'), load('1TH'), load('JON'), load('MIC'), load('NAH'); th2 = load('2TH')
cur = {('COL', 4): col[4], ('1TH', 1): th[1], ('1TH', 5): th[5], ('2TH', 1): th2[1]}
for b, d in (('JON', jon), ('MIC', mic), ('NAH', nah)):
    for n, t in d.items(): cur[(b, n)] = t
def once(text, pat, what):
    ms = [m.start() for m in re.finditer(pat, text)]
    if len(ms) != 1: gone(f'{what}: expected exactly one place, found {len(ms)}.')
    return ms[0]
def entry(key, ent_list, new_text, cut=None, prepend=None, **extra):
    before = cur[key]
    e = dict(book=key[0], chapter=key[1], beforeSha256=H(before), afterSha256=H(new_text), cut=cut, prepend=prepend, prependSha256=H(prepend) if prepend is not None else None)
    if cut is not None:   # the whitespace the cut removed between the kept text and the cut text, so the original chapter can be rebuilt exactly
        kept = new_text[len(prepend) + 2:] if prepend is not None else new_text
        e['gapBefore'] = before[len(kept):cut['offset']]
    e.update(extra); cur[key] = new_text; ent_list.append(e)
def cut_tail(key, start):
    t = cur[key]; tail = t[start:]; kept = t[:start].rstrip()
    return tail, kept, dict(offset=start, length=len(tail), sha256=H(tail))
patches = {}
# ---- R1: Colossians 4 repeats the opening table of 1 Thessalonians 1 ----
t = cur[('COL', 4)]; s = once(t, r"COMMENTARY ON THE FIRST EPISTLE OF PAUL TO THE THESSALONIANS\. CHAPTER 1 1 Thessalonians 1:1", 'COL 4 repeated table')
tail, kept, cut = cut_tail(('COL', 4), s); sh = share(tail, th[1]); assert sh >= 0.98, sh
p1 = []; entry(('COL', 4), p1, kept, cut=cut, duplicateOf=dict(book='1TH', chapter=1, shareOfTailFoundThere=round(sh, 4), tailWords=len(R.findall(tail))), contentClass='duplicate table', tailStartsWith=tail[:90], tailEndsWith=tail[-90:], keptEndsWith=kept[-90:])
patches['calvin-col4-duplicate-table'] = ('Cut the end of Colossians 4 that repeats the opening table of 1 Thessalonians 1.', p1)
# ---- R2: the Argument on 1 Thessalonians ----
assert not any('The greater part of this Epistle consists of exhortations' in x for x in th.values()), 'the Argument is already in 1 Thessalonians'
t = cur[('COL', 4)]; s = once(t, r"ARGUMENT ON THE FIRST EPISTLE TO THE THESSALONIANS\.", 'COL 4 Argument')
arg, kept, cut = cut_tail(('COL', 4), s)
p2 = []; entry(('COL', 4), p2, kept, cut=cut, movedTo=dict(book='1TH', chapter=1), contentClass='argument', tailStartsWith=arg[:90], tailEndsWith=arg[-90:], keptEndsWith=kept[-90:])
entry(('1TH', 1), p2, arg + '\n\n' + cur[('1TH', 1)], prepend=arg, movedFrom=dict(book='COL', chapter=4), contentClass='argument')
patches['calvin-1th-argument'] = ('Move the Argument on 1 Thessalonians from the end of Colossians 4 to the start of 1 Thessalonians 1.', p2)
# ---- R3: the two dedications ----
DED = "THE AUTHOR’S DEDICATORY EPISTLE."
assert not any('MATURINUS CORDERIUS' in x for x in th.values()) and not any('BENEDICT TEXTOR' in x for x in th2.values())
t = cur[('COL', 4)]; s = once(t, re.escape(DED + ' TO MATURINUS CORDERIUS'), 'COL 4 dedication')
ded1, kept, cut = cut_tail(('COL', 4), s); assert ded1.rstrip().endswith('Geneva, 17th February 1550.'), ded1[-60:]
p3 = []; entry(('COL', 4), p3, kept, cut=cut, movedTo=dict(book='1TH', chapter=1), contentClass='dedication', tailStartsWith=ded1[:90], tailEndsWith=ded1[-90:], keptEndsWith=kept[-90:])
entry(('1TH', 1), p3, ded1 + '\n\n' + cur[('1TH', 1)], prepend=ded1, movedFrom=dict(book='COL', chapter=4), contentClass='dedication')
t = cur[('1TH', 5)]; s = once(t, re.escape(DED + ' TO THAT DISTINGUISHED MAN BENEDICT TEXTOR'), '1TH 5 dedication')
ded2, kept, cut = cut_tail(('1TH', 5), s); assert ded2.rstrip().endswith('Geneva, 1st July 1550.'), ded2[-60:]
entry(('1TH', 5), p3, kept, cut=cut, movedTo=dict(book='2TH', chapter=1), contentClass='dedication', tailStartsWith=ded2[:90], tailEndsWith=ded2[-90:], keptEndsWith=kept[-90:])
entry(('2TH', 1), p3, ded2 + '\n\n' + cur[('2TH', 1)], prepend=ded2, movedFrom=dict(book='1TH', chapter=5), contentClass='dedication')
patches['calvin-thessalonian-dedications'] = ('Move Calvin\'s two dedications to the front of the commentaries they open (1 and 2 Thessalonians).', p3)
# ---- R4: chapter-opening tables of Jonah, Micah, Nahum ----
p4 = []; moves = []
for b, d, ns in (('JON', jon, [1, 2, 3]), ('MIC', mic, [1, 2, 3, 4, 5, 6]), ('NAH', nah, [1, 2])):
    for n in ns:
        t = d[n]; m = None
        for mm in re.finditer(r"(?:CHAPTER|Chapter)\s+%d\b[.\s]" % (n + 1), t):
            if len(t) - mm.start() < 3500: m = mm; break
        if not m: gone(f'{b} {n}: the table that opens chapter {n + 1} is not at the end of the chapter.')
        tbl = t[m.start():]; assert share(tbl, d[n + 1]) < 0.5 and tbl[:60] not in d[n + 1][:2000], (b, n, share(tbl, d[n + 1]));   # the table is not already at the start of the next chapter (a verse quoted in the commentary may share a few words)
        assert len(re.findall(r'(?<!\d)1\s?\.\s', tbl)) >= 2 and tbl.rstrip()[-1] in '.;:,)' and len(tbl.split()) < 200, (b, n, tbl[-40:])   # a verse 1 in English and again in Latin; ends like a verse; short
        moves.append((b, n, m.start(), tbl))
for b, d, ns in (('JON', jon, [1, 2, 3, 4]), ('MIC', mic, [1, 2, 3, 4, 5, 6, 7]), ('NAH', nah, [1, 2, 3])):
    for n in ns:
        key = (b, n); cutm = next((x for x in moves if x[0] == b and x[1] == n), None); prem = next((x for x in moves if x[0] == b and x[1] == n - 1), None)
        before = cur[key]; text = before; cutd = None
        if cutm:
            tail, text, cutd = cut_tail(key, cutm[2]); assert tail == cutm[3]
        if prem: text = prem[3] + '\n\n' + text
        extra = {}
        if cutm: extra.update(movedTo=dict(book=b, chapter=n + 1), contentClass='chapter-opening table', tailStartsWith=cutm[3][:90], tailEndsWith=cutm[3][-90:])
        if prem: extra.update(movedFrom=dict(book=b, chapter=n - 1))
        entry(key, p4, text, cut=cutd, prepend=prem[3] if prem else None, **extra)
patches['calvin-minor-prophet-tables'] = ('Move the English and Latin Scripture table that opens each chapter of Jonah, Micah and Nahum from the end of the chapter before to the start of its own chapter.', p4)
OUTS = []
for pid, (purpose, ents) in patches.items():
    OUTS.append((f'{out}/library/patches/{pid}.json', json.dumps(dict(schemaVersion=1, id=pid, source='calvin', purpose=purpose + ' Same format as calvin-moves.json; each cut entry names where its text goes (movedTo) and each prepend entry where it came from (movedFrom).', chapters=ents), indent=1, ensure_ascii=False)))
os.makedirs(f'{out}/library/patches', exist_ok=True)
for path, new in OUTS:   # nothing is written unless every target is either missing or already identical
    if os.path.exists(path) and open(path, encoding='utf-8').read() != new: sys.exit(f'STOP: {path} already exists and is different. This builder never overwrites an existing patch. Nothing was written.')
for path, new in OUTS: open(path, 'w', encoding='utf-8').write(new)
print({k: len(v[1]) for k, v in patches.items()}, 'entries;', len(moves), 'tables,', 'dedications 2, argument 1, duplicate 1')
