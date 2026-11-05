#!/usr/bin/env python3
"""Builds library/patches/easton-bios-fixes.json: 15 corrections to Easton bios in library/people/characters.json (decided by Tom on 2026-11-05).
Source text: CCEL easton_ebd2.xml (Easton's Bible Dictionary, 1897, public domain). Run:   python3 tools/build-easton-bios-fixes.py <path to easton_ebd2.xml> [repo root]

replace-corrupted (11)         our bio is Easton's entry (or one numbered sense) of the same name with small damage (a stray apostrophe, a digit, missing "(See X.)" pointers,
                               and for four of them a cut at 1,200 characters). The new text is Easton's exact text. Each entry names the sha256 of the text it replaces (oldSha256);
                               the apply tool refuses to write if the file's bio is anything else.
extend-in-variant-entry (4)    our bio is Easton's text found under a variant spelling (Hadarezer in Hadadezer, Joram in Jehoram, Timotheus in Timothy, Pontius Pilate in "Pilate, Pontius") and cut at
                               1,200 characters. The new text carries the same sense on to the next numbered sense marker or the end of that entry. The old text must be the exact start of the new.
The other 27 bios from the review list are left as they are (correct Easton text under a variant spelling).
"""
import re, html, json, sys, hashlib, collections, difflib
xml_path = sys.argv[1]; root = sys.argv[2] if len(sys.argv) > 2 else '.'
raw = open(xml_path, encoding='utf8').read(); xml_sha = hashlib.sha256(raw.encode('utf8')).hexdigest()
tidy = lambda x: re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', x))).strip()
key = lambda x: re.sub(r'[^a-z0-9]+', ' ', x.lower()).strip()
terms = []
for part in re.split(r'<term id="[^"]*">', raw)[1:]:
    n, rest = part.split('</term>', 1); terms.append((tidy(n), tidy(rest.split('<term ', 1)[0].split('</def>')[0])))
by = collections.defaultdict(list)
for n, b in terms: by[key(n)].append(b)
chars = json.load(open(f'{root}/library/people/characters.json', encoding='utf8'))['characters']
SENSE = re.compile(r'\s(?=\(\d+\.\)\s)'); NEXT = re.compile(r'\s\(\d+\.\)\s')
sha = lambda t: hashlib.sha256(t.encode('utf8')).hexdigest()
A = 'Amon Amraphel Belshazzar Ehud Gershon Ham Isaac Jude Nebuchadnezzar Paul Rachab'.split()
C = {'Hadarezer': 'Hadadezer', 'Joram': 'Jehoram', 'Timotheus': 'Timothy', 'Pontius Pilate': 'Pilate, Pontius'}
entries = {}
def find(name): return [k for k, v in chars.items() if v['name'] == name][0]
for nm in A:
    k = find(nm); old = chars[k]['bio']; hits = by[key(nm)]; assert len(hits) == 1, nm
    e = hits[0]
    cands = [e] + [re.sub(r'^\(\d+\.\)\s', '', s) for s in SENSE.split(e) if re.match(r'\(\d+\.\)', s)]
    new = max(cands, key=lambda c: difflib.SequenceMatcher(None, old[:400], c[:400]).ratio())
    r = difflib.SequenceMatcher(None, old[:400], new[:400]).ratio()
    assert r >= 0.9, f'{nm}: similarity {r:.2f}'
    entries[k] = {'category': 'replace-corrupted', 'oldLength': len(old), 'newLength': len(new), 'oldSha256': sha(old), 'bio': new, 'sha256': sha(new)}
for nm, term in C.items():
    k = find(nm); old = chars[k]['bio']; assert len(old) == 1200, nm
    hits = by[key(term)]; assert len(hits) == 1, term
    full = hits[0]; assert full.count(old) == 1, f'{nm}: our text is not found exactly once in Easton "{term}"'
    p = full.index(old); m = NEXT.search(full, p + len(old))
    new = (full[:m.start()] if m else full)[p:]
    assert new.startswith(old) and len(new) > len(old), nm
    entries[k] = {'category': 'extend-in-variant-entry', 'foundUnder': term, 'oldLength': len(old), 'newLength': len(new), 'oldSha256': sha(old), 'bio': new, 'sha256': sha(new)}
counts = collections.Counter(e['category'] for e in entries.values())
out = {'note': 'Corrections to Easton bios in library/people/characters.json, decided by Tom 2026-11-05. Built by tools/build-easton-bios-fixes.py.',
       'source': {'work': "Easton's Bible Dictionary (M. G. Easton, 1897, public domain)", 'file': 'easton_ebd2.xml (CCEL ThML) as held in neuu-org/bible-dictionary-dataset data/00_raw/ccel/xml/', 'fileSha256': xml_sha},
       'counts': dict(counts), 'entries': dict(sorted(entries.items()))}
with open(f'{root}/library/patches/easton-bios-fixes.json', 'w', encoding='utf8') as f: json.dump(out, f, indent=1, ensure_ascii=False); f.write('\n')
print(dict(counts)); [print(' ', chars[k]['name'], e['category'], e['oldLength'], '->', e['newLength']) for k, e in entries.items()]
