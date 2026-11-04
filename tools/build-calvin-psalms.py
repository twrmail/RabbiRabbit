#!/usr/bin/env python3
# Builds library/patches/calvin-psalms-from-ccel.json: the full text of all 150 Calvin Psalms commentaries, taken from CCEL's copy.
# Our Calvin Psalms file is a shortened copy: each Psalm stops after roughly the first 1,000-2,500 words (about 126,000 words in all; CCEL has about 804,000).
# A Psalm is included only if at least 97% of every 6-word run in OUR chapter is found in CCEL's text of the same Psalm, so nothing of ours is lost and
# nothing is replaced by different wording. Psalm 119 also carries the title page and translator's preface of volume five, which CCEL keeps as separate
# front matter: they are set aside before the test, and the patch records their hash and where CCEL has them.
# CCEL layout: calcom08-12, <div1 type="Psalm" title="Psalm N"> (Psalm 119 is split over volumes 11 and 12: "Psalm 119" and "Psalm 119 (cont.)").
# CCEL's own file repeats the opening paragraph of Psalm 86 at the end of Psalm 85. That repeat is cut from Psalm 85 by a second patch,
# library/patches/calvin-psa85-duplicate-argument.json (checked by offset, length and sha256; at least 88% of its 6-word runs must be found at the start of Psalm 86; the copies differ only in one spelling, judgment/judgement, and in the word 'his').
# Run it only on the library as it was BEFORE this rule was applied. Usage: python3 build-calvin-psalms.py <repo root> <folder with calcom08-12.xml> [<output folder>]
import re, json, html, sys, os, hashlib
root, ccel = sys.argv[1:3]; out = sys.argv[3] if len(sys.argv) > 3 else root
H = lambda s: hashlib.sha256(s.encode('utf-8')).hexdigest()
tok = lambda s: re.findall(r"[^\W_]+", s.lower().replace('’', "'"))
T = lambda tag: (re.search(r'(?<![A-Za-z])title="([^"]*)"', tag) or [0, ''])[1]
Y = lambda tag: (re.search(r'(?<![A-Za-z])type="([^"]*)"', tag) or [0, ''])[1].lower()
def clean(x):                                   # the same cleaning as the earlier Calvin patches: tags and footnotes removed, whitespace collapsed
    x = re.sub(r'<note\b.*?</note>', '', x, flags=re.S); x = re.sub(r'<script.*?</script>', '', x, flags=re.S)
    x = re.sub(r'<[^>]+>', ' ', x); x = html.unescape(x)
    return re.sub(r'\s+', ' ', x).strip()
VOL = ['08', '09', '10', '11', '12']; vol_text = {}; psalms = {}; front12 = ''
for v in VOL:
    s = open(os.path.join(ccel, f'calcom{v}.xml'), encoding='utf-8', errors='replace').read(); s = s[s.index('</ThML.head>'):]
    vol_text[v] = hashlib.sha256(open(os.path.join(ccel, f'calcom{v}.xml'), 'rb').read()).hexdigest()
    d = [(m.start(), T(m.group(0)), Y(m.group(0))) for m in re.finditer(r'<div1\b[^>]*>', s)]
    for i, (p, t, y) in enumerate(d):
        e = d[i + 1][0] if i + 1 < len(d) else len(s); m = re.match(r'Psalm (\d+)(?: \(cont\.\))?$', t)
        if y == 'psalm' and m: psalms[int(m.group(1))] = (psalms.get(int(m.group(1)), '') + ' ' + clean(s[p:e])).strip()
        elif v == '12' and t == "Translator's Preface": front12 = clean(s[p:e])
if sorted(psalms) != list(range(1, 151)): sys.exit('CCEL volumes 08-12 do not give Psalms 1-150: ' + str(sorted(set(range(1, 151)) - set(psalms))))
doc = json.load(open(f'{root}/library/commentary/Calvin/PSA.json')); chs = doc['chapters']
complete = [c['chapter'] for c in chs if c['commentary'] == psalms[c['chapter']]]
if len(complete) > 10:
    sys.exit('The Calvin Psalms already hold the full CCEL text (or part of it). If this rule has already been applied, that is expected: this builder only runs on the library as it was before it.')
entries = []; low = []
for c in chs:
    n = c['chapter']; ours = c['commentary']; new = psalms[n]; extra = None; test = ours
    if ours == new: continue                       # already the full CCEL text; nothing to replace
    if n == 119:
        a = ours.index('COMMENTARY ON THE BOOK OF PSALMS BY JOHN CALVIN'); b = ours.index('EDINBURGH, April 1849.') + len('EDINBURGH, April 1849.')
        if not (a < b and ours[a:b].count('CHRISTIAN CLASSICS ETHEREAL LIBRARY') == 1): sys.exit('PSA 119: the volume-five title page and preface are not where expected')
        block = ours[a:b]; test = (ours[:a].rstrip() + ' ' + ours[b:].lstrip())
        F = set(tuple(tok(front12)[i:i + 6]) for i in range(len(tok(front12)) - 5)); bw = tok(block[block.index('TRANSLATOR'):]); share = sum(1 for i in range(len(bw) - 5) if tuple(bw[i:i + 6]) in F) / max(1, len(bw) - 5)
        extra = dict(setAsideFromOurs=dict(description="title page and translator's preface of volume five of the Psalms, found in the middle of our Psalm 119", words=len(block.split()), sha256=H(block), offsetInOurChapter=a, chars=len(block),
                     shareOfPrefaceFoundInCcelFront=round(share, 3), ccelFrontMatter='calcom12.xml, front division "Translator\'s Preface" (not part of any Psalm); also kept unchanged in the original file data/commentary/Calvin/PSA.json'))
        assert share >= 0.9, share
    O, C = tok(test), tok(new); sh = set(tuple(C[i:i + 6]) for i in range(len(C) - 5))
    cov = sum(1 for i in range(len(O) - 5) if tuple(O[i:i + 6]) in sh) / max(1, len(O) - 5)
    if cov < 0.97: low.append((n, round(cov, 3))); continue
    e = dict(book='PSA', chapter=n, beforeSha256=H(ours), afterSha256=H(new), oursChars=len(ours), ccelChars=len(new), coverage=round(cov, 3))
    if extra: e.update(extra)
    e['text'] = new; entries.append(e)
if low: sys.exit('These Psalms do not pass the 97% test and are NOT included: ' + str(low))
patch = dict(schemaVersion=1, id='calvin-psalms-from-ccel',
  purpose='All 150 Psalms in our Calvin copy are shortened (about 126,000 words of about 804,000). Every 6-word run of our text is found in CCEL, which has the whole commentary on each Psalm.',
  source=dict(comparedWith='CCEL, Calvin Translation Society commentaries (ThML), calcom08.xml to calcom12.xml (Psalms)', ccelFileSha256=vol_text, footnotes='left out, as in our copy',
              notTaken="front matter, Calvin's translation of the Psalms (back matter) and the indexes of each volume: separate divisions in CCEL, not commentary on a Psalm"),
  method='Each entry gives the Psalm text from CCEL (tags removed, footnotes removed, whitespace collapsed), the sha256 of our chapter before and of this text after, and the share of our 6-word runs found in CCEL.',
  chapters=entries)
# ---- second patch: the paragraph CCEL repeats at the end of Psalm 85 ----
new85 = psalms[85]; K = 'In this psalm prayers and holy meditations'
if new85.count(K) != 1 or psalms[86].count(K) != 1: sys.exit('Psalm 85/86: the repeated paragraph is not where expected in CCEL')
off = new85.index(K); tail = new85[off:]; kept = new85[:off].rstrip()
tw = tok(tail); tg = set(tuple(tw[i:i + 6]) for i in range(len(tw) - 5)); n86 = tok(psalms[86]); g86 = set(tuple(n86[i:i + 6]) for i in range(len(n86) - 5))
dshare = len([1 for g in tg if g in g86]) / max(1, len(tg)); assert dshare >= 0.88 and len(tw) < 120, (dshare, len(tw))
patch2 = dict(schemaVersion=1, id='calvin-psa85-duplicate-argument', source='calvin', purpose="Cut the paragraph at the end of Psalm 85 that repeats the opening paragraph of Psalm 86 (CCEL's own file has it in both places).",
  chapters=[dict(book='PSA', chapter=85, beforeSha256=H(new85), afterSha256=H(kept), cut=dict(offset=off, length=len(tail), sha256=H(tail)), prepend=None, prependSha256=None,
                 duplicateOf=dict(book='PSA', chapter=86, shareOfTailFoundThere=round(dshare, 4), tailWords=len(tw)), tailStartsWith=tail[:90], tailEndsWith=tail[-90:], keptEndsWith=kept[-90:])])
os.makedirs(f'{out}/library/patches', exist_ok=True)
json.dump(patch2, open(f'{out}/library/patches/calvin-psa85-duplicate-argument.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1); open(f'{out}/library/patches/calvin-psa85-duplicate-argument.json', 'a').write('\n')
os.makedirs(f'{out}/library/patches', exist_ok=True); path = f'{out}/library/patches/calvin-psalms-from-ccel.json'
with open(path, 'w', encoding='utf-8') as f:
    f.write(json.dumps({k: v for k, v in patch.items() if k != 'chapters'}, ensure_ascii=False)[:-1] + ',"chapters":[\n' + ',\n'.join(json.dumps(e, ensure_ascii=False, separators=(',', ':')) for e in entries) + '\n]}\n')
print('psalms replaced', len(entries), 'already complete', complete, 'bytes', os.path.getsize(path), 'words', sum(len(e['text'].split()) for e in entries))
