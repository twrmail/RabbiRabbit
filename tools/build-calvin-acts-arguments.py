#!/usr/bin/env python3
# Builds library/patches/calvin-acts-arguments.json: Calvin's two chapter arguments in Acts (the paragraph printed after the chapter
# heading, before the first Scripture passage) that exist in CCEL and nowhere in our copy (checked in data/ and library/).
# The text is taken from CCEL's own paragraph (calcom36.xml, element xi-p2 and xv-p2), tags removed, white space collapsed. A footnote
# reference in it becomes the [n] marker our copy uses; the footnote text itself is already in our copy (Acts 4, [201]).
# Usage: python3 build-calvin-acts-arguments.py <repo root> <calcom36.xml> <out patch>
import re, json, sys, html, hashlib
root, xml, out = sys.argv[1:4]
H = lambda s: hashlib.sha256(s.encode('utf-8')).hexdigest()
x = open(xml, encoding='utf-8', errors='replace').read()
want = {4: ('xi-p2', 'In this narration we must consider'), 8: ('xv-p2', 'In this history we may first see')}
book = {c['chapter']: c['commentary'] for c in json.load(open(f'{root}/library/commentary/Calvin/ACT.json'))['chapters']}
orig = {c['chapter']: c['commentary'] for c in json.load(open(f'{root}/data/commentary/Calvin/ACT.json'))['chapters']}
chapters = []
for ch, (pid, start) in sorted(want.items()):
    i = x.index('<p id="%s">' % pid); j = x.index('<div2 type="Scripture"', i)
    seg = re.sub(r'<note\b[^>]*\bn="(\d+)"[^>]*>.*?</note>', r' [\1] ', x[i:j], flags=re.S)   # a footnote becomes its [n] marker, as in our copy
    text = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', seg))).strip()
    assert text.startswith(start), (ch, text[:60])
    probe = ' '.join(text.split()[:8])
    for name, d in (('library', book), ('data', orig)):
        assert not any(probe in re.sub(r'\s+', ' ', v) for v in d.values()), f'{name}: the argument of Acts {ch} is already in our copy'
    before = book[ch]
    after = text + '\n\n' + before
    chapters.append(dict(book='ACT', chapter=ch, beforeSha256=H(before), afterSha256=H(after), prepend=text, prependSha256=H(text), words=len(text.split()),
                         witness=dict(file='calcom36.xml', element=pid, note='CCEL is the only copy of this text; nothing in data/ or library/ contains it')))
json.dump(dict(schemaVersion=1, id='calvin-acts-arguments', source='calvin',
               purpose='Add the two chapter arguments of Calvin on Acts (4 and 8) that our copy never had. Each goes at the start of its chapter, followed by a blank line.',
               chapters=chapters), open(out, 'w'), indent=1, ensure_ascii=False)
print([(c['chapter'], c['words']) for c in chapters])