#!/usr/bin/env python3
"""Builds library/patches/wesley-word-fixes.json: 29 wording repairs in our Wesley where CCEL's copy has the right word and ours has a
typo or a broken word. Each repair is one row of FIXES: book, chapter, the word(s) as ours has them, the replacement, and the five words
either side (lowercase, punctuation ignored) so the place is unambiguous. The place is found by matching those words in the chapter text;
a row that does not match exactly once stops the build. Case of the first letter is kept. Usage from the repo root:
    python3 tools/build-wesley-word-fixes.py
The rows were chosen by comparing our Wesley with CCEL (source-originals/ccel-wesley/notes.xml) word by word; the ruling for every
disagreement, including the ones left alone, is in the project doc claude/wesley-word-rulings-nov25.md."""
import json, re, hashlib
LIB = 'library/commentary/Wesley'
OUT = 'library/patches/wesley-word-fixes.json'
FIXES = [
    ('MAT', '3', 'camels', "camel's", 'john had his raiment of', 'hair coarse and rough suiting', "'"),
    ('MAT', '5', 'roman', 'romans', 'money men employed by the', 'to gather the taxes and'),
    ('MAT', '6', 'he', 'be', 'name mayest thou o father', 'truly known by all intelligent'),
    ('MAT', '6', 'not', 'no', 'careful for nothing therefore take', 'thought that is be not'),
    ('MAT', '6', 'he', 'be', 'thought for itself that is', 'careful for the morrow when'),
    ('MAT', '12', 'thin', 'this', 'not that subtle spirit know', 'is not the way to'),
    ('MAT', '12', 'judg', 'judge', 'satan let even them be', 'in this matter and they', '.'),
    ('MAT', '16', 'tb', 'to', 'his apostles but left them', 'infer it from his doctrine'),
    ('MAT', '16', 'snore', 'more', 'not believe them would the', 'vehemently have rejected and opposed'),
    ('MAT', '16', 'tho', 'the', 'who shall live to see', 'messiah coming to set up'),
    ('MAT', '17', 'bat', 'but', 'not contest it with them', 'rather yield to their demand'),
    ('MAT', '19', 'ali', 'an', 'of us it would be', 'absolute sin the young man'),
    ('MRK', '11', 'hollowing', 'following', 'in a parenthesis translate the', 'words for where he was'),
    ('LUK', '6', 'al', 'all', 'literally ye who have left', 'for me matt v miserable', ']'),
    ('LUK', '7', 'am', 'an', 'thee so tender and courteous', 'address does our lord use'),
    ('LUK', '8', 'ho', 'he', 'lighted a candle as if', 'had said and let your'),
    ('LUK', '24', 'ho', 'he', 'the same manner as when', 'instituted his last supper their'),
    ('JHN', '5', 'in', 'is', 'in your judgment his testimony', 'beyond exception he bare testimony'),
    ('ACT', '3', 'bear', 'hear', 'death those who could not', 'the voice of god yet'),
    ('ACT', '5', 'wits', "wit's", 'they were even at their', 'end the world in persecuting', "'"),
    ('ACT', '6', 'in', '', 'used the greek as their', 'other tongue in this partiality'),
    ('ACT', '14', 'the in', 'them', 'so we should have heard', 'from our fathers suffered an'),
    ('1TI', '6', 'doatinglyy', 'doatingly', 'to know sick of questions', 'fond of dispute an evil'),
    ('REV', '1', 'hook', 'book', 'where the scope of the', 'is shown it is only'),
    ('REV', '1', 'aa', 'and', 'they differed in magnitude brightness', 'other circumstances the seven stars', '&'),
    ('REV', '6', 'he', 'be', 'scarcity of everything let there', 'some provision left to supply'),
    ('REV', '6', 'rom', 'rome', 'fourth seal do not concern', 'in particular and they cried'),
    ('REV', '13', 'daneil', 'daniel', 'is comprehended under that of', 'and upon his heads a'),
    ('REV', '18', 'whereever', 'wherever', 'orders and edicts given and', 'the blood of holy men')
]
H = lambda s: hashlib.sha256(s.encode('utf-8')).hexdigest()
TOK = re.compile(r"[a-z]+(?:'[a-z]+)?")
def toks(t):
    low = t.lower().replace('\u2019', "'")
    return [(m.group(0), m.start(), m.end()) for m in TOK.finditer(low)]
by = {}
for f in FIXES: by.setdefault((f[0], f[1]), []).append(f)
chapters = []; n = 0
for (book, ch), fs in sorted(by.items()):
    text = json.load(open(f'{LIB}/{book}.json'))['chapters'][ch]
    T = toks(text); words = [w for w, _, _ in T]; edits = []
    for row in fs:
        _, _, old, new, bef, aft = row[:6]; tail = row[6] if len(row) > 6 else ''
        o, b, a = old.split(), bef.split(), aft.split()
        hits = [i for i in range(len(words)) if words[i:i+len(o)] == o and words[max(0, i-len(b)):i] == b and words[i+len(o):i+len(o)+len(a)] == a]
        if len(hits) != 1: raise SystemExit(f'{book} {ch} "{old}": {len(hits)} places match, expected 1')
        i = hits[0]; s, e = T[i][1], T[i + len(o) - 1][2]
        if new == '':   # delete the word and one space
            e2 = e + 1 if text[e:e+1] == ' ' else e
            edits.append({'off': s, 'old': text[s:e2], 'new': '', 'kind': 'stray word'})
        else:
            if tail:   # punctuation printed right after the word that belongs to the damage (wits' / aa& / al] / Judg.)
                if text[e:e+len(tail)] != tail: raise SystemExit(f'{book} {ch} "{old}": expected "{tail}" after the word')
                e += len(tail)
            rep = new[0].upper() + new[1:] if text[s].isupper() else new
            edits.append({'off': s, 'old': text[s:e], 'new': rep, 'kind': 'typo'})
    out = text
    for e in sorted(edits, key=lambda x: -x['off']): out = out[:e['off']] + e['new'] + out[e['off'] + len(e['old']):]
    chapters.append({'book': book, 'chapter': ch, 'beforeSha256': H(text), 'afterSha256': H(out), 'edits': sorted(edits, key=lambda x: x['off'])}); n += len(edits)
json.dump({'schemaVersion': 1, 'note': "Wording repairs in our Wesley, changed to CCEL's reading where ours is the damaged one (a letter wrong, a lost apostrophe, a stray word). off = place in the text before the change; old must be found there. The chapter sha256 before and after is recorded.", 'chapters': chapters}, open(OUT, 'w'), indent=1, ensure_ascii=False)
print(n, 'edits in', len(chapters), 'chapters ->', OUT)
