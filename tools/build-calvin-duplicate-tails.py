#!/usr/bin/env python3
# Builds library/patches/calvin-duplicate-tails.json: the end of a chapter repeats text that is also in the next chapter, because an
# earlier restore put the next chapter's opening table (or, in Amos, the whole of chapter 2) at the end of this one while the next
# chapter already held it. Each tail is cut from the chapter it does not belong to; nothing is lost, because the same text stays in
# the next chapter. The cut point is a marker in the text, and the tool refuses a case unless the cut tail is found in the next chapter
# (at least 98% of its 12-word runs). Usage: python3 build-calvin-duplicate-tails.py <repo root> <out patch>
# Run it only on the library as it was BEFORE the rule was applied; the patch it produces is already in library/patches/.
import re, json, sys, hashlib
root, out = sys.argv[1:3]
H = lambda s: hashlib.sha256(s.encode('utf-8')).hexdigest()
R = re.compile(r"[^\W\d_]+")
CASES = [('GEN', 1, 2, r'CHAPTER 2\.\s+Genesis 2:1'), ('GEN', 24, 25, r'CHAPTER 25\.\s+Genesis 25:1'), ('JOS', 1, 2, r'CHAPTER 2\s+Joshua 2:1'),
         ('2TH', 1, 2, r'CHAPTER 2\s+2 Thessalonians 2:1'), ('EPH', 1, 2, r'CHAPTER 2\s+Ephesians 2:1'),
         ('AMO', 1, 2, r'Lecture Fifty-first\s+Amos 2:1'), ('AMO', 2, 3, r'Chapter 3\.\s+Amos 3:1')]
def load(b): return {c['chapter']: c['commentary'] for c in json.load(open(f'{root}/library/commentary/Calvin/{b}.json'))['chapters']}
def share(tail, target):
    tw = [x.lower() for x in R.findall(tail)]; bw = [x.lower() for x in R.findall(target)]
    G = {tuple(bw[i:i + 12]) for i in range(len(bw) - 11)}
    n = max(1, len(tw) - 11); return sum(1 for i in range(len(tw) - 11) if tuple(tw[i:i + 12]) in G) / n, len(tw)
chapters = []
for b, n, m, pat in CASES:
    c = load(b); t = c[n]; ms = list(re.finditer(pat, t))
    if not ms: sys.exit(f'{b} {n}: the repeated tail is not there. If rule calvin-duplicate-chapter-tails has already been applied, that is expected: this builder only runs on the library as it was before that rule, and the patch it makes is already in library/patches.')
    assert len(ms) == 1, (b, n, pat, len(ms))
    off = ms[0].start(); tail = t[off:]; sh, words = share(tail, c[m]); assert sh >= 0.98, (b, n, round(sh, 3))
    after = t[:off].rstrip()
    chapters.append(dict(book=b, chapter=n, beforeSha256=H(t), afterSha256=H(after), cut=dict(offset=off, length=len(tail), sha256=H(tail)), prepend=None, prependSha256=None,
                         duplicateOf=dict(book=b, chapter=m, shareOfTailFoundThere=round(sh, 4), tailWords=words), tailStartsWith=tail[:90], tailEndsWith=tail[-90:], keptEndsWith=after[-90:]))
    print(b, n, '->', m, 'tail words', words, 'share', round(sh, 4))
json.dump(dict(schemaVersion=1, id='calvin-duplicate-tails', source='calvin',
               purpose='Cut text that sits at the end of a chapter and is repeated in the next chapter. Same format as calvin-moves.json with no text added (prepend null).',
               chapters=chapters), open(out, 'w'), indent=1, ensure_ascii=False)
