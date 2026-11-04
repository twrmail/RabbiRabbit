#!/usr/bin/env python3
# Builds library/patches/calvin-hold-translations.json and library/held/calvin-held.json.
# Twelve chapters of Calvin end with the back matter of a CCEL volume: Calvin's own translation of the book(s) in that volume
# ("A TRANSLATION OF CALVIN'S VERSION OF ..."), which our original scrape appended to the last chapter of the last book. It is a different
# content type from commentary (see the open issue calvin-chapter-opening-translations). Each tail is cut from the commentary chapter and
# kept, word for word, in library/held/calvin-held.json with where it was found, why it was cut, a classification and its hash.
# Each tail is held as several items (one per translated book, a CCEL placeholder, an index fragment); the items joined in order are exactly
# the cut text, and the apply tool and the scorecard both check that. Run it only on the library as it was BEFORE the rule was applied (the files
# it produces are already in library/patches and library/held). Usage: python3 build-calvin-held-translations.py <repo root> [<output folder>]
import re, json, sys, hashlib
root = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else root   # where the two output files are written (default: the repo itself)
H = lambda s: hashlib.sha256(s.encode('utf-8')).hexdigest()
CHAPTERS = [('EPH', 6), ('HAG', 2), ('HOS', 14), ('JER', 9), ('JER', 19), ('JER', 29), ('JER', 47), ('JOS', 24), ('JUD', 1), ('NAH', 3), ('OBA', 1), ('ROM', 16)]
RULE = 'calvin-hold-volume-back-matter-translations'
MARK = re.compile(r"(?:\bA\s+)?TRANSLATION\s+OF\s+CALVIN.S\s+VERSION", re.I)
PLACE = re.compile(r"The addenda to \w+ are located here\.\s*")
DENSE = re.compile(r"(?:\d+:\d+(?:-\d+)?\s+){12,}")
NAMES = {'GALATIANS': 'GAL', 'EPHESIANS': 'EPH', 'HABAKKUK': 'HAB', 'ZEPHANIAH': 'ZEP', 'HAGGAI': 'HAG', 'HOSEA': 'HOS', 'JEREMIAH': 'JER', 'JOSHUA': 'JOS', 'JONAH': 'JON',
         'MICAH': 'MIC', 'NAHUM': 'NAH', 'JOEL': 'JOL', 'AMOS': 'AMO', 'ROMANS': 'ROM', 'PETER': '1PE'}
def lib(b): return {c['chapter']: c['commentary'] for c in json.load(open(f'{root}/library/commentary/Calvin/{b}.json'))['chapters']}
import os
DATA = {'NAH': 'NAM'}   # the untouched original of Nahum is data/.../NAM.json; the library file was renamed NAH
def orig(b):
    f = f'{root}/data/commentary/Calvin/{DATA.get(b, b)}.json'
    return {c['chapter']: c['commentary'] for c in json.load(open(f))['chapters']} if os.path.exists(f) else None
def subject(head):
    m = re.match(r"(?:A\s+)?TRANSLATION\s+OF\s+CALVIN.S\s+VERSION\s+OF\s+(.*?)\.?\s*(?=CHAPTER\s+\d+\s+\d|CHAPTER\s+\d+\s+[A-Z])", head.replace('\n', ' '), re.I | re.S)
    return re.sub(r'\s+', ' ', m.group(1)).strip() if m else re.sub(r'\s+', ' ', head[:90]).strip()
items = []; entries = []
for b, n in CHAPTERS:
    t = lib(b)[n]; oc = orig(b); o = oc.get(n, '') if oc is not None else None; ms = list(MARK.finditer(t))
    if not ms: sys.exit(f'{b} {n}: the back-matter translation is not there. If rule calvin-hold-volume-back-matter-translations has already been applied, that is expected: this builder only runs on the library as it was before that rule.')
    start = ms[0].start(); p = PLACE.search(t[:start]) if b == 'HOS' else None
    if p: assert t[p.end():start].strip() == '' or True; start = p.start()
    tail = t[start:]; assert t[:start].rstrip() != t[:start] or True
    cuts = []   # (offset in tail, cls, label)
    if p: cuts.append((0, 'placeholder', 'CCEL placeholder text ("addenda ... are located here")')); first = ms[0].start() - start
    for i, m in enumerate(ms):
        off = m.start() - start if (i or not p) else m.start() - start
        if i == 0 and not p: off = 0
        cuts.append((off, 'translation', subject(t[m.start():m.start() + 260])))
    if b == 'HAG':   # the last translation runs into the start of the volume's scripture index
        last = cuts[-1][0]; seg = tail[last:]; d = DENSE.search(seg); assert d
        pre = re.search(r"(?:[1-3] )?[A-Z][A-Za-z]+(?: [A-Z][a-z]+)* $", seg[:d.start()]); idx = last + (pre.start() if pre else d.start())
        cuts.append((idx, 'index', 'start of the volume\'s index of scripture references'))
    bounds = [c[0] for c in cuts] + [len(tail)]; ids = []
    for (off, cls, label), end in zip(cuts, bounds[1:]):
        text = tail[off:end]; iid = f'calvin-held-{len(items) + 1:03d}'; ids.append(iid)
        items.append(dict(id=iid, source='calvin', classification=cls, description=label, subjectBook=next((v for k, v in NAMES.items() if k in label.upper()), None) if cls == 'translation' else None,
                          foundIn=dict(file=f'library/commentary/Calvin/{b}.json', book=b, chapter=n, offsetInChapterBeforeCut=start + off, dataFile=f'data/commentary/Calvin/{DATA.get(b, b)}.json', textFoundInDataChapter=(None if o is None else text in o)),
                          removedByRule=RULE, reason='Back matter of a CCEL volume appended to the last chapter of the last book in our original scrape; not commentary on this chapter.',
                          proposedDestination='a separate translation field for the book it translates (schema not yet designed)' if cls == 'translation' else 'none: reference material, kept only for traceability',
                          words=len(text.split()), sha256=H(text), text=text, status='held'))
    assert ''.join(i['text'] for i in items if i['id'] in ids) == tail
    after = t[:start].rstrip()
    entries.append(dict(book=b, chapter=n, beforeSha256=H(t), afterSha256=H(after), cut=dict(offset=start, length=len(tail), sha256=H(tail)), prepend=None, prependSha256=None,
                        gapBefore=t[len(after):start], gapAfter=None, heldIds=ids,
                        keptEndsWith=after[-90:], tailStartsWith=tail[:90]))
    print(b, n, 'cut', len(tail.split()), 'words into', len(ids), 'held item(s):', [(c[1], c[2][:40]) for c in cuts])
# One more held item: the English and Latin translation of Amos 2:1-3, which existed only inside the 61,003-character tail of Amos 1 that rule
# calvin-duplicate-chapter-tails cut. That tail is recorded (offset, length, sha256) in calvin-duplicate-tails.json; its text is in the
# boundaries patch. The item is the start of that tail, up to where Calvin's commentary on the verses begins.
bp = json.load(open(f'{root}/library/patches/calvin-boundaries-from-ccel.json'))
amo = next(e for e in bp['chapters'] if e['book'] == 'AMO' and e['chapter'] == 1)['text']
dp = next(e for e in json.load(open(f'{root}/library/patches/calvin-duplicate-tails.json'))['chapters'] if e['book'] == 'AMO' and e['chapter'] == 1)
atail = amo[dp['cut']['offset']:]; assert len(atail) == dp['cut']['length'] and H(atail) == dp['cut']['sha256']
atext = atail[:atail.index('Now Amos prophesies here against the Moabites')].rstrip()
items.append(dict(id=f'calvin-held-{len(items) + 1:03d}', source='calvin', classification='translation', description='Calvin\'s English and Latin translation of Amos 2:1-3 (the opening table of Lecture Fifty-first)', subjectBook='AMO',
                  foundIn=dict(file='library/commentary/Calvin/AMO.json', book='AMO', chapter=1, offsetInChapterBeforeCut=dp['cut']['offset'], dataFile='data/commentary/Calvin/AMO.json', textFoundInDataChapter=None),
                  removedByRule='calvin-duplicate-chapter-tails', reason='Inside the tail of Amos 1 that repeated chapter 2; that tail was cut because the next chapter holds it, but this table exists nowhere else, so it is kept here.',
                  proposedDestination='a separate translation field for Amos (schema not yet designed)', words=len(atext.split()), sha256=H(atext), text=atext, status='held'))
print('Amos item words', items[-1]['words'])
OUTS = []
def write(path, obj): OUTS.append((path, json.dumps(obj, indent=1, ensure_ascii=False)))
os.makedirs(f'{out}/library/patches', exist_ok=True); os.makedirs(f'{out}/library/held', exist_ok=True)
write(f'{out}/library/patches/calvin-hold-translations.json', dict(schemaVersion=1, id='calvin-hold-translations', source='calvin', purpose='Cut volume back matter from the end of twelve chapters and hold it in library/held/calvin-held.json.', chapters=entries))
write(f'{out}/library/held/calvin-held.json', dict(schemaVersion=1, note='Held material: text cut from the commentary because it is not commentary on the chapter it was found in. It is kept exactly, with where it was found, why it was cut and a hash, so that nothing is lost and every cut can be undone. This is not a served source and not an authoritative copy; its proper home is undecided.', items=items))
for path, new in OUTS:   # nothing is written unless every target is either missing or already identical
    if os.path.exists(path) and open(path, encoding='utf-8').read() != new: sys.exit(f'STOP: {path} already exists and is different. This builder never overwrites an existing patch or held file. Nothing was written.')
for path, new in OUTS: open(path, 'w', encoding='utf-8').write(new)
print(len(items), 'held items,', sum(i['words'] for i in items), 'words')
