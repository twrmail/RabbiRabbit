#!/usr/bin/env python3
# Builds three patches and one held file for Calvin leftovers that are not commentary, one category per patch:
#   library/patches/calvin-ezk12-duplicate-table.json     Ezekiel 12 ends with chapter 13's opening table, which chapter 13 already holds (cut, verified)
#   library/patches/calvin-hold-volume-title-page.json    the title page of the Ezekiel volume, glued to the end of Ezekiel 12 (held)
#   library/patches/calvin-hold-volume-indexes.json       the volume's back-matter indexes in 13 chapters (held): scripture references, Greek, Hebrew and
#                                                         Latin/French word lists, and a CCEL placeholder sentence in Ezekiel 12
#   library/held/calvin-held-volume-matter.json           the held text, item by item, with where it was found, why it was cut and its hash
# The indexes sit at the end of 11 chapters and in the middle of 2 (Luke 19, Numbers 10), where Calvin's commentary carries on after them.
# Run it only on the library as it was BEFORE these rules were applied. Usage: python3 build-calvin-held-indexes.py <repo root> [<output folder>]
import re, json, sys, hashlib, os
root = sys.argv[1]; out = sys.argv[2] if len(sys.argv) > 2 else root
H = lambda s: hashlib.sha256(s.encode('utf-8')).hexdigest()
R = re.compile(r"[^\W\d_]+")
BOOKS = set("Genesis Exodus Leviticus Numbers Deuteronomy Joshua Judges Ruth Samuel Kings Chronicles Ezra Nehemiah Esther Job Psalms Proverbs Ecclesiastes Song Isaiah Jeremiah Lamentations Ezekiel Daniel Hosea Joel Amos Obadiah Jonah Micah Nahum Habakkuk Zephaniah Haggai Zechariah Malachi Matthew Mark Luke John Acts Romans Corinthians Galatians Ephesians Philippians Colossians Thessalonians Timothy Titus Philemon Hebrews James Peter Jude Revelation Solomon Wisdom Ecclesiasticus Tobit Judith Maccabees Baruch".split())
IDX = lambda w: bool(re.fullmatch(r"\d+(?::\d+)?(?:-\d+(?::\d+)?)?[;,.]?", w)) or w in BOOKS or w in ('of', 'Song', 'Solomon')
DENSE = re.compile(r"(?:\d+:\d+(?:-\d+)?\s+){12,}")
GREEK = re.compile(r"[Ͱ-Ͽἀ-῿]"); HEBREW = re.compile(r"[֐-׿]")
CH = [('2CO', 13), ('2TH', 3), ('DEU', 34), ('EZK', 12), ('GEN', 23), ('GEN', 50), ('JHN', 11), ('JHN', 21), ('LEV', 12), ('LUK', 19), ('MAT', 10), ('MRK', 16), ('NUM', 10)]
RULE_T, RULE_I, RULE_D = 'calvin-hold-volume-title-page', 'calvin-hold-volume-indexes', 'calvin-ezk12-duplicate-table'
def load(b): return json.load(open(f'{root}/library/commentary/Calvin/{b}.json'))['chapters']
def get(b, n): return next(c['commentary'] for c in load(b) if c['chapter'] == n)
def tokstart(t, i):
    while i > 0 and not t[i - 1].isspace(): i -= 1
    return i
def words(t): return [x.lower() for x in R.findall(t)]
def share(tail, target):
    tw, bw = words(tail), words(target); G = {tuple(bw[i:i + 12]) for i in range(len(bw) - 11)}
    return sum(1 for i in range(len(tw) - 11) if tuple(tw[i:i + 12]) in G) / max(1, len(tw) - 11)
texts = {(b, n): get(b, n) for b, n in CH}
# ---- Ezekiel 12: first the repeated chapter 13 table, then the title page (both are tails) ----
t = texts[('EZK', 12)]
dm = [m.start() for m in re.finditer(r"CHAPTER 13 Lecture Thirty-Fourth\.", t)]
if len(dm) != 1: sys.exit('EZK 12: the repeated chapter 13 table is not there. If these rules have already been applied, that is expected: this builder only runs on the library as it was before them.')
dup = t[dm[0]:]; sh = share(dup, get('EZK', 13)); assert sh >= 0.98, sh
ezk_a = t[:dm[0]].rstrip()
tp = ezk_a.index('COMMENTARIES ON THE FIRST TWENTY CHAPTERS OF THE BOOK OF THE PROPHET EZEKIEL'); title = ezk_a[tp:]
assert title.rstrip().endswith('http://www.ccel.org'), title[-80:]
ezk_b = ezk_a[:tp].rstrip()
texts_after_title = dict(texts); texts_after_title[('EZK', 12)] = ezk_b
patchD = [dict(book='EZK', chapter=12, beforeSha256=H(t), afterSha256=H(ezk_a), cut=dict(offset=dm[0], length=len(dup), sha256=H(dup)), prepend=None, prependSha256=None,
               duplicateOf=dict(book='EZK', chapter=13, shareOfTailFoundThere=round(sh, 4), tailWords=len(words(dup))), tailStartsWith=dup[:90], tailEndsWith=dup[-90:], keptEndsWith=ezk_a[-90:])]
items = []
def add(src_book, n, cls, desc, text, off, rule, reason, dest, extra=None):
    d = dict(id=f'calvin-held-{22 + len(items):03d}', source='calvin', classification=cls, description=desc, subjectBook=None,
             foundIn=dict(file=f'library/commentary/Calvin/{src_book}.json', book=src_book, chapter=n, offsetInChapterBeforeCut=off, dataFile=f'data/commentary/Calvin/{src_book}.json', textFoundInDataChapter=None),
             removedByRule=rule, reason=reason, proposedDestination=dest, words=len(text.split()), sha256=H(text), text=text, status='held')
    if extra: d.update(extra)
    items.append(d); return d['id']
tid = add('EZK', 12, 'title-page', 'Title page of "Commentaries on the First Twenty Chapters of the Book of the Prophet Ezekiel", volume second (CCEL)', title, tp, RULE_T,
          'The title page of the next CCEL volume, appended to the end of Ezekiel 12 in our original scrape; not commentary.', 'none: front matter of a CCEL volume, kept only for traceability')
patchT = [dict(book='EZK', chapter=12, beforeSha256=H(ezk_a), afterSha256=H(ezk_b), cut=dict(offset=tp, length=len(title), sha256=H(title)), prepend=None, prependSha256=None, gapBefore=ezk_a[len(ezk_b):tp], gapAfter=None, heldIds=[tid], keptEndsWith=ezk_b[-90:], tailStartsWith=title[:90])]
texts_after_title[('EZK', 12)] = ezk_b
# ---- the indexes ----
patchI = []
for b, n in CH:
    t = texts_after_title[(b, n)]; d = DENSE.search(t).start()
    toks = [(m.start(), m.group()) for m in re.finditer(r"\S+", t)]
    k = max(i for i, (o, w) in enumerate(toks) if o <= d)
    while k > 0 and IDX(toks[k - 1][1]): k -= 1
    s = toks[k][0]; place = None
    if (b, n) == ('EZK', 12):
        pm = re.search(r"The translation of Ezekiel 1-12 is located here\.\s*$", t[:s]); assert pm; place = pm.start()
    nn = t.find('\n\n', s); end = len(t) if nn < 0 else nn
    if nn >= 0: assert t[nn:].strip() and not DENSE.search(t[end:end + 600]), (b, n)
    region_start = place if place is not None else s
    region = t[region_start:end]; parts = []   # (offset in region, class, description, subject)
    if place is not None: parts.append((0, 'placeholder', 'CCEL placeholder sentence: "The translation of Ezekiel 1-12 is located here."'))
    parts.append((s - region_start, 'index', 'index of scripture references (CCEL volume back matter)'))
    g = GREEK.search(t, s); h = HEBREW.search(t, s)
    if g and g.start() < end:
        parts.append((tokstart(t, g.start()) - region_start, 'index', 'index of Greek words'))
        ih = t.find('Index of Hebrew', g.start(), end)
        if h and h.start() < end:
            ihs = tokstart(t, h.start())
            parts.append((ihs - region_start, 'index', 'index of Hebrew words'))
            lm = list(HEBREW.finditer(t, h.start(), end)); lastheb = lm[-1].end()
            nxt = re.compile(r"\s+\S").search(t, lastheb)   # the first word after the last Hebrew word begins the Latin and French lists
            lat = nxt.end() - 1; assert lat < end
            parts.append((lat - region_start, 'index', 'index of Latin and French words and phrases'))
        elif ih >= 0: parts.append((ih - region_start, 'index', 'heading of the index of Hebrew words (the list itself is not in our copy)'))
    offs = [p[0] for p in parts] + [len(region)]; ids = []
    for (o, cls, desc), e in zip(parts, offs[1:]):
        ids.append(add(b, n, cls, desc, region[o:e], region_start + o, RULE_I, 'Back matter of a CCEL volume (index) that our original scrape put inside this chapter; not commentary.', 'none: reference material (an index to a volume we do not hold in that form), kept only for traceability'))
    assert ''.join(i['text'] for i in items if i['id'] in ids) == region
    kept = t[:region_start].rstrip() + ('\n\n' + t[end:].lstrip() if nn >= 0 else '')
    patchI.append(dict(book=b, chapter=n, beforeSha256=H(t), afterSha256=H(kept), cut=dict(offset=region_start, length=len(region), sha256=H(region)), prepend=None, prependSha256=None,
                       gapBefore=t[len(t[:region_start].rstrip()):region_start], gapAfter=(t[end:][:len(t[end:]) - len(t[end:].lstrip())] if nn >= 0 else None), heldIds=ids,
                       keptEndsWith=t[:region_start].rstrip()[-90:], regionStartsWith=region[:90], resumesWith=(t[end:].lstrip()[:90] if nn >= 0 else None)))
    print(b, n, 'cut', len(region.split()), 'words in', len(ids), 'item(s):', [p[2][:28] for p in parts], '| mid-chapter' if nn >= 0 else '| end of chapter')
OUTS = []
def wr(path, obj): OUTS.append((path, json.dumps(obj, indent=1, ensure_ascii=False)))
os.makedirs(f'{out}/library/patches', exist_ok=True); os.makedirs(f'{out}/library/held', exist_ok=True)
wr(f'{out}/library/patches/calvin-ezk12-duplicate-table.json', dict(schemaVersion=1, id=RULE_D, source='calvin', purpose='Cut the end of Ezekiel 12 that repeats the opening table of Ezekiel 13 (same format as calvin-duplicate-tails.json).', chapters=patchD))
wr(f'{out}/library/patches/calvin-hold-volume-title-page.json', dict(schemaVersion=1, id=RULE_T, source='calvin', purpose='Cut the volume title page from the end of Ezekiel 12 and hold it.', chapters=patchT))
wr(f'{out}/library/patches/calvin-hold-volume-indexes.json', dict(schemaVersion=1, id=RULE_I, source='calvin', purpose='Cut volume back-matter indexes from 13 chapters (11 at the end, 2 in the middle) and hold them.', chapters=patchI))
wr(f'{out}/library/held/calvin-held-volume-matter.json', dict(schemaVersion=1, note='Held material: text cut from the commentary because it is not commentary on the chapter it was found in. It is kept exactly, with where it was found, why it was cut and a hash, so that nothing is lost and every cut can be undone. This is not a served source and not an authoritative copy.', items=items))
for path, new in OUTS:   # nothing is written unless every target is either missing or already identical
    if os.path.exists(path) and open(path, encoding='utf-8').read() != new: sys.exit(f'STOP: {path} already exists and is different. This builder never overwrites an existing patch or held file. Nothing was written.')
for path, new in OUTS: open(path, 'w', encoding='utf-8').write(new)
print(len(items), 'held items,', sum(i['words'] for i in items), 'words')
