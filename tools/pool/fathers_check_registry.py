#!/usr/bin/env python3
"""Checks every Chrysostom excerpt in the pinned HCF copy against the CCEL NPNF1 full text and writes pool/fathers-source-checks.json.
One record per HCF entry, keyed by the sha256 of the entry's quote (so it survives a change of piece ids). The pool builder reads the
record, applies the recorded corrections, and marks pieces that sit on a gap. Nothing here edits the HCF files.
Usage: python3 tools/fathers_check_registry.py HCF_DIR OUT.json  MATTHEW_XML ROMANS_XML EPHESIANS_XML
Method: lowercase letters only test (every word must match). An entry that fails is compared word by word with its homily and each
difference is sorted into: editors' marks (CCEL prints references or notes in the sentence that HCF leaves out), gap (CCEL has 8 or
more words that the entry silently skips), typo (one word differs), or other (listed for a person to read)."""
import sys, os, re, json, glob, html, hashlib, tomllib, urllib.parse, difflib, datetime
hcf, out, XM, XR, XE = sys.argv[1:6]
XD = sys.argv[6] if len(sys.argv) > 6 else None   # optional: pdftotext of the Documenta Catholica Omnia Matthew homilies (Homily 79 is not in CCEL's text)
sha = lambda b: hashlib.sha256(b).hexdigest()
ROM = {'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100}
def rn(t):
    t = t.strip('. '); 
    if t.isdigit(): return int(t)
    if not re.fullmatch(r'[IVXLC]+', t): return None
    v = 0
    for a, b in zip(t, t[1:] + ' '): v += -ROM[a] if b != ' ' and ROM[a] < ROM[b] else ROM[a]
    return v
def clean(x):
    x = re.sub(r'<note\b.*?</note>', '', x, flags=re.S); x = re.sub(r'<[^>]+>', ' ', x); return re.sub(r'\s+', ' ', html.unescape(x)).strip()
class Vol:
    def __init__(s, path, label, lo=0, hi=10**9):
        s.lo, s.hi = lo, hi
        s.raw = open(path, encoding='utf-8', errors='replace').read(); s.label = label; s.sha = sha(open(path, 'rb').read())
        s.divs = [(m.start(), int(m.group(1))) for m in re.finditer(r'<div([1-3])\b[^>]*>', s.raw)] + [(len(s.raw), 0)]
        s.title = re.search(r'<DC\.Title>(.*?)</DC\.Title>', s.raw, re.S).group(1).strip()
        s.rights = re.search(r'<DC\.Rights>(.*?)</DC\.Rights>', s.raw, re.S).group(1).strip()
    def homily(s, n, work):
        for i, (p, l) in enumerate(s.divs[:-1]):
            m = re.match(r'Homily\s+([IVXLC\d]+)\b', clean(s.raw[p:p + 1500]))
            if not m or rn(m.group(1)) != n or l == 3 and False: continue
            head = clean(s.raw[p:p + 1500])
            if not (s.lo <= p < s.hi): continue
            q = next(j for j in range(i + 1, len(s.divs)) if s.divs[j][1] and s.divs[j][1] <= l)
            return clean(s.raw[p:s.divs[q][0]]), head[:60]
        return None, None
def start_of(path, title):   # where a work begins inside a volume that holds several (Acts and Romans; Galatians to Philemon)
    raw = open(path, encoding='utf-8', errors='replace').read(); m = re.search(r'<div\d[^>]*title="[^"]*%s' % re.escape(title), raw); return m.start()
vols = {'On Matthew': Vol(XM, 'npnf110'),
        'On Romans': Vol(XR, 'npnf111', lo=start_of(XR, "Epistle to the Romans")),
        'On Ephesians': Vol(XE, 'npnf113', lo=start_of(XE, 'Homilies on Ephesians'), hi=start_of(XE, 'The Homilies of St. John Chrysostom on Philippians'))}
let = lambda t: re.sub(r'[^a-z]', '', t.lower())
TOK = re.compile(r"[a-zA-Z]+(?:['’][a-zA-Z]+)?")
REFWORDS = set('c and mss cat al punct a v ib cf cor ps acts john matt thess heb pet rom eph gal col tim tit titus phil gen ex lev num deut isa jer ezek dan hos joel amos luke mark rev lxx i ii iii iv v vi vii viii ix x xi xii xiii xiv xv xvi xvii xviii xix xx xxi xxii xxiii xxiv xxv xxvi xxvii xxviii honestly in this sense'.split())
def check(q, hom):
    if let(q) in let(hom): return dict(status='exact')
    ht = [(m.group(0), m.start(), m.end()) for m in TOK.finditer(hom)]; qt = [(m.group(0), m.start(), m.end()) for m in TOK.finditer(q)]
    hw = [w.lower().replace('’', "'") for w, _, _ in ht]; qw = [w.lower().replace('’', "'") for w, _, _ in qt]
    sm = difflib.SequenceMatcher(None, hw, qw, autojunk=False); blocks = [b for b in sm.get_matching_blocks() if b.size >= 8] or [b for b in sm.get_matching_blocks() if b.size >= 4]
    if not blocks: return dict(status='other', note='no stretch of 4 or more words matches the homily')
    lo = blocks[0].a; hi = blocks[-1].a + blocks[-1].size; sm2 = difflib.SequenceMatcher(None, hw[lo:hi], qw, autojunk=False)
    marks, gaps, typos, other = [], [], [], []
    for tag, i1, i2, j1, j2 in sm2.get_opcodes():
        if tag == 'equal': continue
        ccel = hw[lo + i1:lo + i2]; ours = qw[j1:j2]; at = qt[j1][1] if j1 < len(qt) else len(q)
        if tag == 'delete' and (len(ccel) <= 7 and all(w in REFWORDS for w in ccel)): marks.append(' '.join(ccel))
        elif tag == 'delete' and len(ccel) >= 8: gaps.append(dict(off=at, skipped_words=len(ccel), skipped_preview=' '.join(w for w, _, _ in ht[lo + i1:lo + i1 + 12]) + ' ...'))
        elif tag == 'replace' and len(ccel) == 1 and len(ours) == 1 and ours[0] not in ('ib',) and ccel[0] not in ('ib',):
            w = ht[lo + i1][0]; s_, e_ = qt[j1][1], qt[j1][2]
            typos.append(dict(off=s_, old=q[s_:e_], new=w))
        elif tag == 'replace' and ccel == ['ib'] : marks.append('Ib. written out in HCF as ' + ' '.join(ours))
        elif tag == 'replace' and ours == ['ib']: marks.append('Ib. written out in HCF as ' + ' '.join(ccel))
        else: other.append(dict(tag=tag, ccel=' '.join(ccel)[:200], hcf=' '.join(ours)[:200]))
    st = 'other' if other else ('gap' if gaps else ('typo' if typos else 'editors-marks'))
    r = dict(status=st)
    if marks: r['editors_marks'] = marks
    if gaps: r['gaps'] = gaps
    if typos: r['corrections'] = typos
    if other: r['other'] = other
    return r
HCF_PIN = 'a88dc031b9a1'
def put(res, key, rec):
    """Add a registry record. The key is the sha256 of the HCF quote. Two different source entries with the same quote text would share a key: stop, do not overwrite."""
    old = res.get(key)
    if old and (old.get('file'), old.get('entry')) != (rec.get('file'), rec.get('entry')): raise SystemExit(f'registry key collision: {old.get("file")} #{old.get("entry")} and {rec.get("file")} #{rec.get("entry")} have the same quote')
    rec['quote_sha256'] = key; rec['hcf_commit'] = HCF_PIN; res[key] = rec
res = {}
for f in sorted(glob.glob(f'{hcf}/John Chrysostom/*.toml')):
    for i, e in enumerate(tomllib.load(open(f, 'rb')).get('commentary', []), 1):
        u = urllib.parse.unquote(urllib.parse.unquote(e.get('source_url', ''))); m = re.search(r'Homilies/(On \w+)/Homily (\d+)\.html', u)
        if not m: continue
        work, n = m.group(1), int(m.group(2)); V = vols.get(work); hom, head = V.homily(n, work.split()[-1]) if V else (None, None)
        dco = False
        if hom is None and work == 'On Matthew' and XD:
            t = re.sub(r'(?m)^file:///.*$', '', open(XD, errors='replace').read()).replace('-\n', ''); R = {79: 'LXXIX'}.get(n)
            hs = [x.start() for x in re.finditer(r'HOMILY %s\.' % R, t)] if R else []
            if hs: a = hs[-1]; b = t.find('HOMILY LXXX.', a); hom = re.sub(r'St\.? John Chrysostom\s*HOMILIES ON THE GOSPEL OF MATTHEW\s*(C\b)?', ' ', re.sub(r'\s+', ' ', t[a:b])); head = f'HOMILY {R}.'; dco = True
        q = e['quote']; key = sha(q.encode())
        rec = dict(file=f'John Chrysostom/{os.path.basename(f)}', entry=i, homily=f'{work} {n}', against=dict(volume=V.title if V else None, ccel_file_sha256=V.sha if V else None, homily_heading=head, ccel_rights=V.rights if V else None))
        if dco: rec['against'] = dict(volume='Documenta Catholica Omnia, Homilies on the Gospel of Matthew (EN), PDF; translator not named; NOT CCEL (Homily 79 is not in CCEL NPNF1-10)', source_text_sha256=sha(hom.encode()), homily_heading=head, rights='not stated by the source')
        rec.update(check(q, hom) if hom else dict(status='unchecked', note='homily not found in the CCEL file'))
        put(res, key, rec)
summary = {}
for r in res.values(): summary[r['status']] = summary.get(r['status'], 0) + 1
json.dump(dict(schemaVersion=1, built=datetime.date.today().isoformat(), note='Chrysostom excerpts (HCF, pinned) checked against CCEL NPNF1 full text. Key = sha256 of the HCF entry quote.', summary=summary, entries=res), open(out, 'w'), indent=1, ensure_ascii=False)
print(len(res), 'entries', summary)
for k, r in res.items():
    if r['status'] != 'exact': print(r['file'], r['entry'], r['status'], json.dumps({x: r[x] for x in r if x in ('editors_marks', 'gaps', 'corrections', 'other')}, ensure_ascii=False)[:500])
