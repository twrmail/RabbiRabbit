#!/usr/bin/env python3
"""Builds library/patches/easton-bios-fixes-2.json: seven more corrections to Easton bios in library/people/characters.json (Tom, 2026-11-05).
Text comes from the complete dictionary already in the library (library/dictionary/Easton), so no outside file is needed.   Run:  python3 tools/build-easton-bios-fixes-2.py [repo root]

replace-corrupted (6)       eber (a benjamite), ishmael (son of hagar), jonadab, judah (patriarch), pharez, shishak: the bio is Easton's text (a numbered sense, or the whole entry) with small damage
                            (a stray apostrophe, missing "(See X.)" pointers, "1 Chr." added before a bare reference, Ishmael cut at 1,200). New text = Easton's exact text.
replace-wrong-sense (1)     daniel (the prophet, Ezekiel 14): the bio was Easton's note on his Babylonian name Belteshazzar (88 characters). New text = Easton's sense (2.) of "Daniel", the prophet.
Each entry names the sha256 of the text it replaces (oldSha256); the apply tool and the scorecard refuse to write unless the file holds exactly that text.
"""
import re, json, sys, glob, hashlib, collections, difflib
root = sys.argv[1] if len(sys.argv) > 1 else '.'
ent = collections.defaultdict(list)
for f in sorted(glob.glob(f'{root}/library/dictionary/Easton/[A-Z_].json')):
    for e in json.load(open(f, encoding='utf8'))['entries']: ent[e['term']].append(e)
index = json.load(open(f'{root}/library/dictionary/Easton/_index.json', encoding='utf8'))
chars = json.load(open(f'{root}/library/people/characters.json', encoding='utf8'))['characters']
sha = lambda t: hashlib.sha256(t.encode('utf8')).hexdigest()
SENSE = re.compile(r'\s(?=\(\d+\.\)\s)')
def senses(text):
    return {int(re.match(r'\((\d+)\.\)', s).group(1)): re.sub(r'^\(\d+\.\)\s', '', s) for s in SENSE.split(text) if re.match(r'\(\d+\.\)', s)}
# character key -> (Easton headword, 'whole' or sense number, category)
PLAN = {'eber (a benjamite)': ('Eber', 3, 'replace-corrupted'), 'ishmael (son of hagar)': ('Ishmael', 1, 'replace-corrupted'),
        'jonadab': ('Jehonadab', 2, 'replace-corrupted'), 'judah (patriarch)': ('Judah', 'whole', 'replace-corrupted'),
        'pharez': ('Perez', 'whole', 'replace-corrupted'), 'shishak': ('Shishak I', 'whole', 'replace-corrupted'), 'daniel': ('Daniel', 2, 'replace-wrong-sense')}
entries = {}
for k, (term, part, cat) in PLAN.items():
    old = chars[k]['bio']; hits = ent[term]; assert len(hits) == 1, term
    new = hits[0]['text'] if part == 'whole' else senses(hits[0]['text'])[part]
    r = difflib.SequenceMatcher(None, old[:300], new[:300]).ratio()
    if cat == 'replace-corrupted': assert r >= 0.7, f'{k}: similarity {r:.2f}'
    entries[k] = {'category': cat, 'takenFrom': f'{term}' + ('' if part == 'whole' else f' sense ({part}.)') + f' [{hits[0]["id"]}]', 'oldLength': len(old), 'newLength': len(new),
                  'oldSha256': sha(old), 'bio': new, 'sha256': sha(new)}
counts = collections.Counter(e['category'] for e in entries.values())
out = {'note': 'More corrections to Easton bios in library/people/characters.json, decided by Tom 2026-11-05. Built by tools/build-easton-bios-fixes-2.py from library/dictionary/Easton.',
       'source': index['source'], 'counts': dict(counts), 'entries': dict(sorted(entries.items()))}
with open(f'{root}/library/patches/easton-bios-fixes-2.json', 'w', encoding='utf8') as f: json.dump(out, f, indent=1, ensure_ascii=False); f.write('\n')
print(dict(counts)); [print(' ', k, e['takenFrom'], e['oldLength'], '->', e['newLength']) for k, e in entries.items()]
