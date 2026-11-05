#!/usr/bin/env python3
"""Builds library/bible-notes/WEB/<BOOK>.json: the World English Bible translators' notes that were removed from library/bible/WEB when it was converted.

Source: scrollmapper/bible_databases, branch 2024, csv/t_web.csv (sha256 recorded in each file). In that file a note is written {like this} inside the verse.
Run:   python3 tools/build-web-notes.py <path to t_web.csv> [repo root]

The notes never go into the verse text. Each note records where it stood in OUR verse text (character offset `at`), the words just before it (`after`), and its text.
Before writing anything the script proves, for every one of the 31,102 verses, that putting the notes back into our verse text at those offsets gives the source verse
(ignoring the leading "&gt; " markup the source puts on 117 Psalm verses and white space at the ends), and that taking the notes out of the source gives our verse text.
"""
import csv, json, re, sys, hashlib, collections
csv.field_size_limit(10**9)
csv_path = sys.argv[1]; root = sys.argv[2] if len(sys.argv) > 2 else '.'
raw = open(csv_path, 'rb').read(); sha = hashlib.sha256(raw).hexdigest()
BK = ['GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA','1KI','2KI','1CH','2CH','EZR','NEH','EST','JOB','PSA','PRO','ECC','SNG','ISA','JER','LAM','EZK','DAN','HOS','JOL','AMO','OBA','JON','MIC','NAH','HAB','ZEP','HAG','ZEC','MAL','MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV']
src = {(BK[int(r[1]) - 1], int(r[2]), int(r[3])): r[4] for r in list(csv.reader(open(csv_path, encoding='utf8')))[1:]}
ours = {}
for code in BK:
    d = json.load(open(f'{root}/library/bible/WEB/{code}.json', encoding='utf8'))
    for ch in d['chapters']:
        for v, t in ch['verses'].items(): ours[(code, ch['chapter'], int(v))] = t
assert set(src) == set(ours), 'verse lists differ'
NOTE = re.compile(r'\{([^}]*)\}')
by_book = collections.defaultdict(list); n_notes = 0; markup = 0; empty = 0
for k in sorted(src, key=lambda k: (BK.index(k[0]), k[1], k[2])):
    s = src[k]; mine = ours[k]
    if s.startswith('&gt; '): s = s[5:]; markup += 1
    # walk the source verse, tracking where we are in the text without notes
    out = []; notes = []; pos = 0; last = 0
    for m in NOTE.finditer(s):
        out.append(s[last:m.start()]); pos += m.start() - last
        notes.append((pos, m.group(1))); last = m.end()
    out.append(s[last:])
    stripped = ''.join(out)
    lead = len(stripped) - len(stripped.lstrip())          # white space the original build trimmed off the front
    assert stripped.strip() == mine, f'{k}: text without notes differs from our verse'
    for at, text in notes:
        if not text.strip(): empty += 1; continue      # a bare {} (Psalm 45:17): no note
        at2 = max(0, at - lead)
        at2 = min(at2, len(mine))
        n_notes += 1
        by_book[k[0]].append({'chapter': k[1], 'verse': k[2], 'at': at2, 'after': mine[max(0, at2 - 40):at2], 'text': text})
    # put the notes back and compare with the source (white space at the ends ignored)
    rebuilt = mine; add = 0
    for n in sorted([x for x in by_book[k[0]] if x['chapter'] == k[1] and x['verse'] == k[2]], key=lambda x: x['at']):
        i = n['at'] + add; rebuilt = rebuilt[:i] + '{' + n['text'] + '}' + rebuilt[i:]; add += len(n['text']) + 2
    assert re.sub(r'\s+', '', rebuilt) == re.sub(r'\s+', '', s.replace('{}', '')), f'{k}: putting the notes back does not give the source verse'
import os
os.makedirs(f'{root}/library/bible-notes/WEB', exist_ok=True)
source = {'work': 'World English Bible, translators\' notes', 'file': 'csv/t_web.csv, scrollmapper/bible_databases, branch 2024, commit 19e966337b1d27fc454d06d3d1d4a723e4760ca5', 'fileSha256': sha,
          'emptyBracesNotKept': empty, 'note': 'Notes were removed from library/bible/WEB at conversion (2026-06). They are kept here, apart from the verse text, as the translators wrote them. Built by tools/build-web-notes.py.'}
for code in BK:
    out = {'translation': 'WEB', 'layer': 'translators-notes', 'book': code, 'source': source, 'count': len(by_book[code]), 'notes': by_book[code]}
    with open(f'{root}/library/bible-notes/WEB/{code}.json', 'w', encoding='utf8') as f:
        json.dump(out, f, indent=1, ensure_ascii=False); f.write('\n')
print('notes', n_notes, 'empty {} skipped', empty, 'verses with notes', len({(n['chapter'], n['verse'], c) for c, l in by_book.items() for n in l}), 'markup prefixes dropped', markup, 'files', len(BK))
