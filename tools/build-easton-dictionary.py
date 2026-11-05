#!/usr/bin/env python3
"""Builds library/dictionary/Easton/<LETTER>.json and _index.json: all of Easton's Bible Dictionary (M. G. Easton, 1897, public domain), one entry per headword.

Source: easton_ebd2.xml (CCEL ThML) as held in neuu-org/bible-dictionary-dataset data/00_raw/ccel/xml/ (sha256 recorded in _index.json).
Run:   python3 tools/build-easton-dictionary.py <path to easton_ebd2.xml> [repo root]

Text cleaning (the same used for the character bios, which it reproduces byte for byte for 537 of them): drop tags, decode entities, collapse white space, join paragraphs with one space.
Nothing is merged, split or reworded: every <term> in the file becomes one entry, in file order, keeping its CCEL id. The three headwords that appear twice stay as two entries.
"""
import re, html, json, sys, hashlib, collections, os
xml_path = sys.argv[1]; root = sys.argv[2] if len(sys.argv) > 2 else '.'
raw = open(xml_path, encoding='utf8').read(); xml_sha = hashlib.sha256(raw.encode('utf8')).hexdigest()
tidy = lambda x: re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', x))).strip()
sha = lambda t: hashlib.sha256(t.encode('utf8')).hexdigest()
parts = re.split(r'<term id="([^"]*)">', raw)
by_letter = collections.OrderedDict(); seen = set(); dup_terms = collections.Counter()
for i in range(1, len(parts), 2):
    tid, rest = parts[i], parts[i + 1]
    term, after = rest.split('</term>', 1)
    body = after.split('<term ', 1)[0].split('</def>')[0]
    term, text = tidy(term), tidy(body)
    assert term and text, f'empty entry {tid}'
    assert tid not in seen, f'repeated id {tid}'; seen.add(tid)
    first = term[0].upper(); letter = first if first.isalpha() else '_'
    by_letter.setdefault(letter, []).append({'id': tid, 'term': term, 'text': text, 'sha256': sha(text)})
    dup_terms[re.sub(r'[^a-z0-9]+', ' ', term.lower()).strip()] += 1
total = sum(len(v) for v in by_letter.values())
os.makedirs(f'{root}/library/dictionary/Easton', exist_ok=True)
source = {'work': "Easton's Bible Dictionary (M. G. Easton, 1897, public domain)", 'file': 'easton_ebd2.xml (CCEL ThML) as held in neuu-org/bible-dictionary-dataset data/00_raw/ccel/xml/', 'fileSha256': xml_sha}
for letter, entries in sorted(by_letter.items()):
    with open(f'{root}/library/dictionary/Easton/{letter}.json', 'w', encoding='utf8') as f:
        json.dump({'work': 'Easton', 'letter': letter, 'count': len(entries), 'entries': entries}, f, indent=1, ensure_ascii=False); f.write('\n')
# which character bios in library/people/characters.json are not found inside any entry (informational; the checker recomputes it)
alltext = [e['text'] for v in by_letter.values() for e in v]
chars = json.load(open(f'{root}/library/people/characters.json', encoding='utf8'))['characters']
not_found = sorted(k for k, v in chars.items() if v.get('bio') and not any(v['bio'] in t for t in alltext))
index = {'note': "Easton's Bible Dictionary, complete, one entry per headword, built by tools/build-easton-dictionary.py. Text only; no senses split, nothing merged.",
         'source': source, 'total': total, 'letters': {k: len(v) for k, v in sorted(by_letter.items())},
         'repeatedHeadwords': sorted(t for t, n in dup_terms.items() if n > 1), 'characterBiosNotFoundInAnyEntry': not_found}
with open(f'{root}/library/dictionary/Easton/_index.json', 'w', encoding='utf8') as f: json.dump(index, f, indent=1, ensure_ascii=False); f.write('\n')
print('entries', total, 'letters', len(by_letter), 'repeated headwords', index['repeatedHeadwords'], 'character bios not found:', not_found)
