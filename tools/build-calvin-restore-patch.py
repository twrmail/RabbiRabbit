#!/usr/bin/env python3
# Builds library/patches/calvin-restore-text.json: Calvin text our copy lost, taken word for word from CCEL.
# Usage (repo root):  CCEL_DIR=/tmp/ccel python3 tools/build-calvin-restore-patch.py library library/patches/calvin-restore-text.json
# Found by tools/calvin-ccel-audit (report of 2026-11-09). Four chapters:
#   GEN 1  : the commentary on verse 1 (2 paragraphs) is missing; our chapter starts at verse 2.            -> prepend
#   ISA 19 : the commentary on verse 1 (4 paragraphs) is missing; our chapter starts at verse 2.            -> prepend
#   LAM 5  : the last 5 paragraphs (verse 22 and the closing note) are missing.                              -> append
#   DEU 16 : one paragraph stops mid-sentence ("... without a gift, was a"); CCEL has the rest.            -> replace that paragraph
# Footnotes (the editors' notes) are left out, as everywhere else in our Calvin. The only edit to CCEL's wording is the verse number
# "l." (a lower-case L, a scanning slip in CCEL) which is written "1." like every other verse number.
import re, json, html, os, sys, hashlib, unicodedata
lib, out = sys.argv[1:3]
CCEL = os.environ.get('CCEL_DIR', '/tmp/ccel')
H = lambda s: hashlib.sha256(s.encode('utf-8')).hexdigest()
def norm(s):
    s = html.unescape(s).lower().replace('’', "'").replace('‘', "'")
    s = ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]', '', s)
def block(vol, ref):
    t = open(os.path.join(CCEL, f'calcom{vol:02d}.xml'), encoding='utf-8').read()
    m = re.search(r'<scripCom[^>]*osisRef="Bible:%s"[^>]*/>(?:</p>)?\s*(?:<a [^>]*/>)?\s*(?:</p>)?\s*<div class="Commentary"[^>]*>' % re.escape(ref), t)
    assert m, ref
    i = m.end(); depth = 1; end = None
    for k in re.finditer(r'<div\b|</div>', t[i:]):
        depth += 1 if k.group(0) == '<div' else -1
        if depth == 0: end = i + k.start(); break
    nxt = re.search(r'<scripCom', t[i:]); nxt = i + nxt.start() if nxt else len(t)
    body = t[i:min(end or nxt, nxt)]
    body = re.sub(r'<note.*?</note>', '', body, flags=re.S)
    paras = []
    for p in re.findall(r'<p[ >].*?</p>', body, re.S):
        x = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', p))).strip()
        if len(norm(x)) >= 20: paras.append(re.sub(r'^l\. ', '1. ', x))
    return paras
def load(code):
    return json.load(open(os.path.join(lib, 'commentary/Calvin', code + '.json'), encoding='utf-8'))
TARGETS = [('GEN', 1, 1, 'Gen.1.1', 'prepend'), ('ISA', 19, 14, 'Isa.19.1', 'prepend'), ('LAM', 5, 21, 'Lam.5.22', 'append'), ('DEU', 16, 4, 'Deut.16.16', 'fix-tail')]
entries = []
for code, ch, vol, ref, mode in TARGETS:
    d = load(code); ent = next(c for c in d['chapters'] if int(c['chapter']) == ch)
    cur = ent['commentary']; nc = norm(cur); paras = block(vol, ref)
    absent = [p for p in paras if norm(p)[:200] not in nc]
    print(code, ch, mode, 'CCEL paragraphs', len(paras), 'absent', len(absent))
    if mode == 'prepend':
        assert absent == paras[:len(absent)] and len(absent) >= 1 and all(norm(p)[:200] in nc for p in paras[len(absent):])
        new = '\n\n'.join(absent) + '\n\n' + cur
    elif mode == 'append':
        assert absent == paras[len(paras) - len(absent):] and len(absent) >= 1 and all(norm(p)[:200] in nc for p in paras[:len(paras) - len(absent)])
        new = cur.rstrip() + '\n\n' + '\n\n'.join(absent)
    else:
        # one CCEL paragraph is in our chapter, but our copy stops part-way through it (mid-sentence). Find where it starts in our text;
        # what we have from there to the next blank line must be an exact start of CCEL's paragraph (same words), then it is replaced whole.
        done = False
        for p in paras:
            k = cur.find(p[:60])
            if k < 0: continue
            e = cur.find('\n\n', k); e = len(cur) if e < 0 else e
            ours = cur[k:e]
            if len(ours) < len(p) and norm(p).startswith(norm(ours)) and len(norm(ours)) > 200:
                new = cur[:k] + p + cur[e:]; done = True
                print('   tail restored: our', len(ours), 'chars ->', len(p), 'chars; ours ended:', repr(ours[-50:]))
        assert done
    # check: every CCEL paragraph is now present, in CCEL's order
    nn = norm(new); pos = -1
    for p in paras:
        k = nn.find(norm(p)[:200]); assert k > pos or (mode == 'fix-tail'), (code, p[:60]); pos = max(pos, k)
    entries.append({'book': code, 'chapter': str(ent['chapter']) if isinstance(ent['chapter'], str) else ent['chapter'], 'ref': ref, 'mode': mode, 'beforeSha256': H(cur), 'afterSha256': H(new), 'oursChars': len(cur), 'newChars': len(new), 'text': new})
patch = {'schemaVersion': 1, 'id': 'calvin-restore-text',
  'purpose': 'Restore Calvin text our copy lost: the commentary on Genesis 1:1 (2 paragraphs) and Isaiah 19:1 (4), the last 5 paragraphs of Lamentations 5, and the end of one paragraph in Deuteronomy 16:16. Taken word for word from CCEL.',
  'source': {'comparedWith': 'CCEL, Calvin Translation Society commentaries (ThML), calcom01, calcom04, calcom14, calcom21', 'footnotes': 'left out, as in our copy', 'edit': 'the verse number "l." (scanning slip in CCEL) is written "1."'},
  'method': 'Each entry gives the whole new chapter text, the sha256 of our chapter before and of the new text after. Found by tools/calvin-ccel-audit; see tools/calvin-ccel-audit/REPORT-2026-11-09.md.',
  'chapters': entries}
json.dump(patch, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('wrote', out, len(entries), 'chapters')
