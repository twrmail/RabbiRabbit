#!/usr/bin/env python3
"""Builds library/patches/easton-bios-fixes-3.json: Jesus and David in library/people/characters.json (Tom approved 2026-11-08).
Run:  python3 tools/build-easton-bios-fixes-3.py [repo root]

jesus  bio    Easton's entry "Jesus" is numbered: (1.) Joshua, (2.) a Jewish Christian surnamed Justus (Col. 4:11), then the long unnumbered entry on our Lord.
               The character's bio opened with sense (2.), a different man. New bio = the entry on our Lord only (Easton's exact text from "Je'sus, the proper ..." to the end).
               The old bio is replaced only if it is exactly the text named by oldSha256.
jesus  passage COL 4 (where the Justus sense was found) -> MAT 1 (the genealogy and birth of Jesus). Old value must match exactly.
david  passage RUTH 4 (a first mention, the genealogy that ends with David) -> 1SAM 16 (David anointed, where his own story begins). Bio unchanged. Old value must match exactly.
Passage choices are Tom's to change; a one-line edit of this script and a rebuild does it.
"""
import json, sys, hashlib, collections
root = sys.argv[1] if len(sys.argv) > 1 else '.'
sha = lambda t: hashlib.sha256(t.encode('utf8')).hexdigest()
chars = json.load(open(f'{root}/library/people/characters.json', encoding='utf8'))['characters']
index = json.load(open(f'{root}/library/dictionary/Easton/_index.json', encoding='utf8'))
hits = [e for e in json.load(open(f'{root}/library/dictionary/Easton/J.json', encoding='utf8'))['entries'] if e['term'] == 'Jesus']
assert len(hits) == 1
text = hits[0]['text']; marker = 'Je’sus, the proper'
assert text.count(marker) == 1 and '(2.) A Jewish Christian surnamed Justus (Col. 4:11). ' + marker in text
new = text[text.index(marker):]
old = chars['jesus']['bio']
assert old.startswith('A Jewish Christian surnamed Justus (Col. 4:11). ' + marker)
assert old[len('A Jewish Christian surnamed Justus (Col. 4:11). '):] == new[:len(old) - len('A Jewish Christian surnamed Justus (Col. 4:11). ')], 'old bio is not Easton text'
entries = {
  'jesus': {'category': 'replace-wrong-sense', 'takenFrom': f'Jesus, the unnumbered entry on our Lord [{hits[0]["id"]}]', 'oldLength': len(old), 'newLength': len(new), 'oldSha256': sha(old), 'bio': new, 'sha256': sha(new),
            'oldPassage': chars['jesus']['passage'], 'passage': {'bookId': 'MAT', 'chapter': 1}},
  'david': {'category': 'set-passage', 'bio': chars['david']['bio'], 'sha256': sha(chars['david']['bio']),
            'oldPassage': chars['david']['passage'], 'passage': {'bookId': '1SAM', 'chapter': 16}},
}
out = {'note': 'Jesus and David corrections to library/people/characters.json, approved by Tom 2026-11-08. Built by tools/build-easton-bios-fixes-3.py from library/dictionary/Easton.',
       'source': index['source'], 'counts': {'replace-wrong-sense': 1, 'set-passage': 2}, 'entries': entries}
with open(f'{root}/library/patches/easton-bios-fixes-3.json', 'w', encoding='utf8') as f: json.dump(out, f, indent=1, ensure_ascii=False); f.write('\n')
print(len(old), '->', len(new), entries['jesus']['oldPassage'], '->', entries['jesus']['passage'], '|', entries['david']['oldPassage'], '->', entries['david']['passage'])
