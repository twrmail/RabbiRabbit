#!/usr/bin/env python3
"""Builds library/patches/easton-bios.json: the missing and cut-off Easton's Bible Dictionary bios for library/people/characters.json.

Source text: the CCEL ThML file easton_ebd2.xml (Easton's Bible Dictionary, 1897, public domain), as held in neuu-org/bible-dictionary-dataset
(data/00_raw/ccel/xml/easton_ebd2.xml). Run:   python3 tools/build-easton-bios.py <path to easton_ebd2.xml> [repo root]

This script only ADDS or EXTENDS text. It never shortens or rewrites a bio. Three kinds of change:
  add-missing-bio     the character has no bio and Easton has an entry under exactly that name  -> the whole entry
  extend-entry-prefix the bio is the start of the entry, cut short (47 of them cut at exactly 1,200 characters)  -> the whole entry
  extend-sense        the bio is one numbered sense of the entry (a person's own sense), cut at 1,200 characters
                      -> the same sense, carried on to the next numbered sense marker "(2.)" or to the end of the entry
Everything else is left alone and listed under "held" with the reason (see the report in the Project).

Text cleaning (checked: it reproduces 537 bios already in the file byte for byte): drop tags, decode entities, collapse whitespace, join paragraphs with one space.
"""
import re, html, json, sys, hashlib, collections

xml_path = sys.argv[1]
root = sys.argv[2] if len(sys.argv) > 2 else '.'
raw = open(xml_path, encoding='utf8').read()
xml_sha = hashlib.sha256(raw.encode('utf8')).hexdigest()


def tidy(x):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', x))).strip()


entries = collections.OrderedDict()
for part in re.split(r'<term id="[^"]*">', raw)[1:]:
    name, rest = part.split('</term>', 1)
    body = rest.split('<term ', 1)[0].split('</def>')[0]
    entries.setdefault(tidy(name), []).append(tidy(body))


def key(x):
    return re.sub(r'[^a-z0-9]+', ' ', x.lower()).strip()


by_key = collections.defaultdict(list)
for term, texts in entries.items():
    by_key[key(term)].append((term, texts))

chars_path = f'{root}/library/people/characters.json'
chars = json.load(open(chars_path, encoding='utf8'))['characters']
SENSE = re.compile(r'\s\(\d+\.\)\s')

patch, held = {}, collections.OrderedDict()
for k, v in chars.items():
    kk = key(v['name'])
    old = v.get('bio') or ''
    hits = by_key.get(kk)
    if not hits:
        if old:
            held[k] = 'no Easton entry under exactly this name'
        continue
    if len(hits) > 1 or len(hits[0][1]) > 1:
        held[k] = 'Easton has this term more than once; not merged automatically'
        continue
    full = hits[0][1][0]
    if not old:
        cat, new = 'add-missing-bio', full
    elif old == full:
        continue
    elif full.startswith(old):
        cat, new = 'extend-entry-prefix', full
    elif len(old) == 1200 and full.count(old) == 1:
        p = full.index(old)
        m = SENSE.search(full, p + len(old))
        new = full[: m.start()] if m else full
        new = new[p:]
        cat = 'extend-sense'
        if not new.startswith(old) or len(new) < len(old):
            held[k] = 'sense extension did not start with the existing text'
            continue
        if new == old:
            continue
    else:
        if len(old) == 1200:
            held[k] = 'cut at 1,200 characters but not found inside the Easton entry of that name'
        elif old in full:
            pass   # a complete numbered sense of the entry: correct as it is
        else:
            held[k] = 'bio is not found inside the Easton entry of that name (different text); needs review'
        continue
    patch[k] = {'category': cat, 'oldLength': len(old), 'newLength': len(new), 'bio': new,
                'sha256': hashlib.sha256(new.encode('utf8')).hexdigest()}

counts = collections.Counter(e['category'] for e in patch.values())
out = {
    'note': 'Easton bios for library/people/characters.json: missing bios added and cut-off bios completed from the CCEL text. Built by tools/build-easton-bios.py. Only adds or extends.',
    'source': {'work': "Easton's Bible Dictionary (M. G. Easton, 1897, public domain)", 'file': 'easton_ebd2.xml (CCEL ThML) as held in neuu-org/bible-dictionary-dataset data/00_raw/ccel/xml/',
               'fileSha256': xml_sha},
    'counts': dict(counts),
    'heldNotChanged': held,
    'entries': dict(sorted(patch.items())),
}
dest = f'{root}/library/patches/easton-bios.json'
with open(dest, 'w', encoding='utf8') as f:
    json.dump(out, f, indent=1, ensure_ascii=False)
    f.write('\n')
print(dest, dict(counts), 'held:', len(held))
