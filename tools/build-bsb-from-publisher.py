#!/usr/bin/env python3
"""Builds library/patches/bsb-from-publisher.json: the list of BSB verses in library/bible/BSB whose text differs from the
publisher's file data/bsb/bsb.txt. Each entry records the sha256 of the text now in the library (oldSha256) and of the
publisher's line (newSha256); the text itself is NOT copied into the patch, it is read from data/bsb/bsb.txt when the rule is applied.
Usage (repo root, after the rules before this one are applied):  python3 tools/build-bsb-from-publisher.py"""
import json, glob, hashlib, re, os, sys
H = lambda s: hashlib.sha256(s.encode('utf8')).hexdigest()
PUB = 'data/bsb/bsb.txt'
raw = open(PUB, encoding='utf8').read()
ORDER = 'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAH HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV'.split()
pub = {}; names = []
for l in raw.split('\n')[3:]:
    if not l: continue
    m = re.match(r'^(.+?) (\d+):(\d+)\t(.*)$', l)
    if m.group(1) not in names: names.append(m.group(1))
    pub[(m.group(1), int(m.group(2)), int(m.group(3)))] = m.group(4)
assert len(names) == 66
code2name = dict(zip(ORDER, names))
ents = []
for f in sorted(glob.glob('library/bible/BSB/*.json')):
    d = json.load(open(f, encoding='utf8')); b = d['book']
    for c in d['chapters']:
        for k, t in c['verses'].items():
            p = pub.get((code2name[b], c['chapter'], int(k)))
            if p is None: raise SystemExit(f'{b} {c["chapter"]}:{k} is not in the publisher file')
            if p != t: ents.append({'book': b, 'chapter': c['chapter'], 'verse': int(k), 'oldSha256': H(t), 'newSha256': H(p)})
out = {'note': 'BSB verses to be set to the publisher text. The text is read from sourceFile; this file holds only hashes.',
       'sourceFile': PUB, 'sourceSha256': hashlib.sha256(open(PUB, 'rb').read()).hexdigest(), 'bookNames': code2name, 'verses': ents}
open('library/patches/bsb-from-publisher.json', 'w', encoding='utf8').write(json.dumps(out, indent=1, ensure_ascii=False) + '\n')
print(len(ents), 'verses differ;', sum(1 for _ in pub), 'publisher verses')
