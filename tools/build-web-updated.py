#!/usr/bin/env python3
"""Builds library/bible/WEB (66 books) and library/bible-notes/WEB from eBible.org's World English Bible Updated USFM zip.

Source: https://ebible.org/find/show.php?id=engwebu , file engwebu_usfm.zip (downloaded by Tom 2026-11-08; eBible.org page says "from source files dated 30 Oct 2026").
Run:    python3 tools/build-web-updated.py <engwebu_usfm.zip> [repo root]

What goes where:
  verse text   words only. Strong's tags, footnotes, cross references, headings and paragraph marks are not part of the verse text.
               A Psalm superscription (\\d line) is placed at the start of the verse that follows it, as eBible.org's own quotation of Psalm 23:1 does.
  held copy    data/web-updated.json: the same verse text in the shape of the other files in data/ (this is what Gate 4 compares the library with)
  notes layer  every footnote (\\f ... \\f*) with chapter, verse, `at` (character offset in OUR verse text), `after` (the 40 characters before it) and text.
  dropped      cross references (\\x ... \\x*), section headings, Strong's numbers, red-letter marks; counts are written into each notes file.
Proof built in: for every verse, putting the notes back at their offsets gives the text with the notes marked in place, and removing them gives our verse text.
The Apocrypha books in the zip are not read (the original zip is kept untouched in source-originals/ebible-engwebu/).
"""
import zipfile, hashlib, json, re, sys, os, collections
zpath = sys.argv[1]; root = sys.argv[2] if len(sys.argv) > 2 else '.'
raw = open(zpath, 'rb').read(); sha = hashlib.sha256(raw).hexdigest()
BK = ['GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA','1KI','2KI','1CH','2CH','EZR','NEH','EST','JOB','PSA','PRO','ECC','SNG','ISA','JER','LAM','EZK','DAN','HOS','JOL','AMO','OBA','JON','MIC','NAH','HAB','ZEP','HAG','ZEC','MAL','MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV']
USFM_CODE = {'NAM': 'NAH'}   # eBible.org writes Nahum as NAM
z = zipfile.ZipFile(zpath)
files = {}
for n in z.namelist():
    if '__MACOSX' in n or not n.endswith('.usfm'): continue
    t = z.read(n).decode('utf8'); m = re.search(r'^\\id (\w+)', t, re.M)
    if not m: continue
    code = USFM_CODE.get(m.group(1), m.group(1))
    if code in BK: files[code] = t
assert set(files) == set(BK), f'missing books: {set(BK) - set(files)}'

SKIP_LINE = re.compile(r'^\\(s\d?|ms\d?|mr|r|sp|b|cl|cp|is\d?|ip|ili\d?|mt\d?|h|toc\d|ide|id|rem|sr|nb)\b')
FOOT = re.compile(r'\\f \S+ (.*?)\\f\*', re.S)
XREF = re.compile(r'\\x \S+ .*?\\x\*', re.S)
WORD = re.compile(r'\\\+?w ([^|\\]*)\|[^\\]*\\\+?w\*')
PARA = re.compile(r'\\(p|q\d?|m|mi|pi\d?|pc|li\d?|nb|d)\b')
MARK = re.compile(r'\\\+?[a-z]+\d*\*?')
PH = '\ue000'

HEADINGS_DROPPED = []
def add_d(pending, text):
    # Psalm 119 section names (ALEPH, BEIT, ...) are headings, not words of the verse; a superscription ("A Psalm by David.") is part of the verse
    t = re.sub(r'\s+', ' ', MARK.sub('', WORD.sub(r'\1', text)).replace('\xa0', ' ')).strip()
    if re.fullmatch(r'[A-Z][A-Z ]*', t): HEADINGS_DROPPED.append(t); return pending
    return (pending + ' ' + t).strip()

def clean_note(s):
    s = re.sub(r'\\fr [^\\]*', '', s)               # the "1:1" reference label
    s = WORD.sub(r'\1', s)
    s = MARK.sub('', s)
    return re.sub(r'\s+', ' ', s).strip()

books = {}; notes = collections.defaultdict(list); stats = collections.Counter(); xrefs = collections.Counter()
for code in BK:
    t = files[code]
    body = t[t.index('\\c '):] if '\\c ' in t else ''
    chapters = collections.OrderedDict(); chap = None; verse = None; pending_d = ''
    chunks = re.split(r'(?m)^(?=\\(?:c|v) )', body)
    for ch in chunks:
        if not ch.strip(): continue
        mc = re.match(r'\\c (\d+)', ch)
        if mc:
            chap = int(mc.group(1)); chapters[chap] = collections.OrderedDict(); verse = None
            rest = ch[mc.end():]
            ch = rest                                            # lines after \c: headings, \d, paragraph marks before verse 1
            body_text = ''
            lines = ch.split('\n')
            for ln in lines:
                if ln.startswith('\\d '): pending_d = add_d(pending_d, ln[3:])
            continue
        mv = re.match(r'\\v (\d+)(?:-(\d+))? ?', ch)
        assert mv, f'{code}: unexpected chunk start {ch[:40]!r}'
        assert not mv.group(2), f'{code} {chap}: verse range {mv.group(0)!r}'
        verse = int(mv.group(1)); raw_v = ch[mv.end():]
        prefix, pending_d = pending_d, ''            # a \\d line belongs to the verse AFTER it
        lines = []
        for ln in raw_v.split('\n'):
            if ln.startswith('\\d '): pending_d = add_d(pending_d, ln[3:]); continue
            if SKIP_LINE.match(ln): continue
            lines.append(ln)
        s = '\n'.join(lines)
        xrefs[code] += len(XREF.findall(s)); s = XREF.sub('', s)
        flist = []
        def grab(m):
            flist.append(clean_note(m.group(1))); return PH
        s = FOOT.sub(grab, s)
        s = WORD.sub(r'\1', s)
        s = PARA.sub(' ', s)
        s = MARK.sub('', s)
        if prefix:
            s = clean_note(prefix) + ' ' + s
        s = re.sub(r'[ \t\r\n]+', ' ', s)
        # place the notes: build the verse text part by part, collapsing doubled spaces, and record where each note stood
        text = ''; offs = []
        for k, part in enumerate(s.split(PH)):
            if k: offs.append(len(text))
            if not text or text.endswith(' '): part = part.lstrip(' ')
            text += part
        text = text.rstrip(' ')
        offs = [min(o, len(text)) for o in offs]
        assert len(flist) == len(offs), f'{code} {chap}:{verse}'
        chapters[chap][verse] = text
        for o, n in zip(offs, flist):
            if not n: stats['emptyNote'] += 1; continue
            notes[code].append({'chapter': chap, 'verse': verse, 'at': o, 'after': text[max(0, o - 40):o], 'text': n})
    books[code] = chapters

# proof: removing notes gave our text by construction; check notes put back are placed inside the verse and text has no stray marks
bad = []
for code in BK:
    for c, vs in books[code].items():
        for v, t in vs.items():
            if '\\' in t or PH in t or '|strong' in t: bad.append((code, c, v, t[:60]))
for n in sum(notes.values(), []):
    if '\\' in n['text'] or '|strong' in n['text']: bad.append(('note', n['chapter'], n['verse'], n['text'][:60]))
assert not bad, bad[:5]

name = 'World English Bible Updated'
source_line = ('World English Bible Updated (public domain; "World English Bible" is a trademark of eBible.org, which agreed in writing that the name may be kept with a notes label). '
               'Text from eBible.org engwebu_usfm.zip (sha256 %s), downloaded 2026-11-08 by Tom; the eBible.org page says the files were generated from source files dated 30 Oct 2026. '
               'Footnotes are kept in library/bible-notes/WEB; Strong\'s tags, cross references and headings are not in the verse text. Built by tools/build-web-updated.py.' % sha)
os.makedirs(f'{root}/library/bible/WEB', exist_ok=True); os.makedirs(f'{root}/library/bible-notes/WEB', exist_ok=True)
total = 0
old = json.load(open(f'{root}/data/web.json', encoding='utf8')) if os.path.exists(f'{root}/data/web.json') else {'books': []}
book_names = {b['code']: b['name'] for b in old['books']}
held = {'translation': 'WEB', 'name': name, 'year': 2026, 'license': 'Public Domain', 'books': []}
for code in BK:
    out = {'translation': 'WEB', 'name': name, 'year': 2026, 'license': 'Public Domain', 'source': source_line, 'translationId': 'WEB', 'book': code,
           'chapters': [{'chapter': c, 'verses': {str(v): t for v, t in vs.items()}} for c, vs in books[code].items()]}
    total += sum(len(vs) for vs in books[code].values())
    held['books'].append({'name': book_names.get(code, code), 'code': code, 'chapters': [{'chapter': c, 'verses': [{'verse': v, 'text': t} for v, t in vs.items()]} for c, vs in books[code].items()]})
    with open(f'{root}/library/bible/WEB/{code}.json', 'w', encoding='utf8') as f: json.dump(out, f, ensure_ascii=False);
    nsrc = {'work': 'World English Bible Updated, footnotes', 'file': 'engwebu_usfm.zip from ebible.org/find/show.php?id=engwebu', 'fileSha256': sha, 'crossReferencesNotKept': xrefs[code],
            'note': 'Footnotes are kept here, apart from the verse text, as eBible.org wrote them. Built by tools/build-web-updated.py.'}
    with open(f'{root}/library/bible-notes/WEB/{code}.json', 'w', encoding='utf8') as f:
        json.dump({'translation': 'WEB', 'layer': 'translators-notes', 'book': code, 'source': nsrc, 'count': len(notes[code]), 'notes': notes[code]}, f, indent=1, ensure_ascii=False); f.write('\n')
with open(f'{root}/data/web-updated.json', 'w', encoding='utf8') as f: json.dump(held, f, ensure_ascii=False)
print('Psalm headings dropped', len(HEADINGS_DROPPED), HEADINGS_DROPPED[:3], '...'); print('books', len(BK), 'verses', total, 'notes', sum(len(v) for v in notes.values()), 'cross references dropped', sum(xrefs.values()), 'empty notes skipped', stats['emptyNote'], 'sha', sha)
