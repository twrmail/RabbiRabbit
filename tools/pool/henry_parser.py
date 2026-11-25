#!/usr/bin/env python3
"""Henry (MHC) parser for the pool builder. Brief v1.1 sections 4-6, 8.

Usage: python3 -I henry_parser.py LIBRARY_DIR BOOK CHAPTER LO HI [OUT.json]

Offsets: zero-based, end-exclusive, code points of the decoded UTF-8 chapter text.
No model calls. No network. Reads library files only.
"""
import json, re, sys, hashlib

ABBR = {'Ro','Joh','Ge','Ec','Mal','St','Mr','Dr','vs','ver','cf','Mt','Lu','Isa','Ps','Heb','Eph','Col','Re','Rev','Ac','Jer','Eze','Da','Ex','Le','Nu','De','Jos','Jud','Ru','Sa','Ki','Ch','Ne','Es','Job','Pr','So','Ho','Joe','Am','Ob','Jon','Mic','Na','Hab','Zep','Hag','Zec','Mk','Ga','Php','Th','Ti','Tit','Phm','Jas','Pe','Jude','Co','Cor','Matt','Mark','Luke','John','Rom','Gen','Deut','Num','Lev','1Jo','1Co','2Co','1Pe','2Pe','1Th','2Th','1Ti','2Ti','2Jo','3Jo','Mt','Lk','Jn','Eph'}
REF_RE = re.compile(r'\b(1Jo|2Jo|3Jo|Joh|Ro|Mt|Mr|Lu|Ac|Ge|Ex|Le|Nu|De|Ps|Isa|Jer|Eze|Da|Eph|Col|Heb|Jas|1Pe|2Pe|1Co|2Co|Ga|Php|1Th|2Th|1Ti|2Ti|Re|Mal|Pr|Ec|Job|Zec|Hos?|Joe|Am|Mic)\s*(\d+):(\d+)(?:[-,]\s*(\d+))?')
OUTLINE_RE = re.compile(r'(?m)^\s*(?:\(?\d+\.\)?|[IVX]+\.|[a-z]\))\s')

def sha(b): return hashlib.sha256(b).hexdigest()

def load(lib, book, ch):
    fp = f'{lib}/commentary/MHC/{book}.json'
    raw = open(fp, 'rb').read()
    d = json.loads(raw.decode('utf-8'))
    text = [c for c in d['chapters'] if c['chapter'] == ch][0]['commentary']
    ip = f'{lib}/commentary-index/MHC/{book}.json'
    iraw = open(ip, 'rb').read()
    idx = [c for c in json.loads(iraw)['chapters'] if c['chapter'] == ch][0]
    return dict(text=text, idx=idx, file=fp, idx_file=ip, file_sha256=sha(raw), idx_file_sha256=sha(iraw),
                text_sha256=sha(text.encode('utf-8')))

def note_span(vk, e):
    """Return (lo,hi,how) verse span the index says the note covers."""
    v = int(vk); rel = e['relation']
    if rel == 'own': return v, v, 'own'
    if rel == 'together':
        w = [v] + list(e.get('with', [])); return min(w), max(w), 'together'
    if rel == 'under-earlier':
        w = list(e.get('with', [v])); return min(w), max(w + [v]), 'under-earlier'
    return None, None, rel

# ---- splitting -------------------------------------------------------------
LISTMARK = re.compile(r'(?:^|(?<=\s))(?:\d{1,2}|[a-z])\)')
def paren_open(seg):
    """Unclosed real parentheses in seg. A ')' with nothing open (a list marker such as "1)") is ignored."""
    d = 0
    for ch in seg:
        if ch == '(': d += 1
        elif ch == ')' and d > 0: d -= 1
    return d

def pair_depth(t, pos):
    """True when position pos lies inside an open *...* pair or ( ... ) in t[:pos]."""
    seg = t[:pos]
    return seg.count('*') % 2 == 1 or paren_open(seg) > 0

def sentence_cuts(t):
    """Candidate cut offsets (end of sentence, relative to t)."""
    cuts = []
    for m in re.finditer(r'[.?!]["”’\)\*\]]*\s+(?=[A-Z“"\*\[\(\d])', t):
        before = t[:m.start() + 1]
        last = (re.findall(r'(\S+)$', before) or [''])[0]
        lw = re.sub(r'[^A-Za-z&.0-9]', '', last).rstrip('.')
        if last.endswith('&c.') or lw in ABBR or re.fullmatch(r'[A-Z]', lw) or re.fullmatch(r'\d', lw):
            continue
        end = m.start() + len(m.group(0).rstrip())
        if pair_depth(t, end):
            continue
        cuts.append(end)
    return cuts

def make_spans(text, a, b, target=420, maxc=650):
    seg = text[a:b]
    paras, p0 = [], 0
    for m in re.finditer(r'\n\s*\n', seg):
        paras.append((p0, m.start())); p0 = m.end()
    paras.append((p0, len(seg.rstrip())))
    out = []
    for ps, pe in paras:
        ptxt = seg[ps:pe]
        if not ptxt.strip(): continue
        cuts = sentence_cuts(ptxt) + [len(ptxt.rstrip())]
        sents, s = [], 0
        for c in sorted(set(cuts)):
            if c > s:
                # skip leading whitespace
                x = s
                while x < c and ptxt[x].isspace(): x += 1
                sents.append((a + ps + x, a + ps + c)); s = c
        cur = None
        for (x, y) in sents:
            if cur is None: cur = [x, y]
            elif (cur[1] - cur[0]) < target and (y - cur[0]) <= maxc: cur[1] = y
            else: out.append(tuple(cur)); cur = [x, y]
        if cur: out.append(tuple(cur))
    merged = []
    for p in out:
        if merged and (p[1] - p[0]) < 150 and (p[0] - merged[-1][1]) < 4: merged[-1] = (merged[-1][0], p[1])
        else: merged.append(p)
    return merged

def tiling_check(text, a, b, spans):
    """Pieces must cover text[a:b] exactly, whitespace only between, no overlap, no split markup pair."""
    problems = []
    pos = a
    for (x, y) in spans:
        if x < pos: problems.append(f'overlap at {x}')
        if text[pos:x].strip(): problems.append(f'gap of non-whitespace {pos}-{x}: {text[pos:x][:40]!r}')
        pos = y
    if text[pos:b].strip(): problems.append(f'uncovered tail {pos}-{b}: {text[pos:b][:40]!r}')
    if spans and text[a:spans[0][0]].strip(): problems.append('uncovered head')
    # a markup pair is split only if it is open at a cut and closes later in the same note
    for (x, y) in spans[:-1]:
        pre = text[a:y]; post = text[y:b]
        if pre.count('*') % 2 == 1 and '*' in post: problems.append(f'split asterisk pair at cut {y}')
        if paren_open(pre) > 0 and ')' in post: problems.append(f'split parenthesis at cut {y}')
    return problems

PRON_RE = re.compile(r'^(?:\*?\[?\(?\d?\.?\)?\]?\s*)?(This|That|These|Those|He|She|It|They|Thus|Hence|Therefore|And|But|For|So|Now|Then|Such|Here|Hereby|Wherefore)\b')
LEAD_OUTLINE_RE = re.compile(r'^\s*(?:\(?\d+\.\)?|[IVX]+\.|[a-z]\))\s')

MARK_RE = re.compile(r'^\s*(\(?)(\d+|[IVX]+)\.(\)?)(?=\s)')
ROMAN = {'I':1,'II':2,'III':3,'IV':4,'V':5,'VI':6,'VII':7,'VIII':8,'IX':9,'X':10}
def marker_at(t):
    """(label, kind, number, start, end) for an outline marker at the start of t, else None. Offsets relative to t."""
    m = MARK_RE.match(t)
    if not m: return None
    g = m.group(2)
    if g.isdigit(): kind, n = 'arabic', int(g)
    elif g in ROMAN: kind, n = 'roman', ROMAN[g]
    else: return None
    st = m.start(2) - len(m.group(1)); en = m.end(3) if m.group(3) else m.end(2) + 1
    return t[st:m.end()], kind, n, st, m.end()
def markers_in(t):
    out = []
    for m in re.finditer(r'(?m)^(?:\(?)(\d+|[IVX]+)\.\)?(?=\s)', t):
        mk = marker_at(t[m.start():])
        if mk: out.append(mk[1:3])
    return out

SENT_END = re.compile(r'[.?!]["\u201d\u2019\)\*\]]*\s+(?=[A-Z\u201c"\*\[\(\d])')
def outline_heads(t, anchor=None):
    """The opening sentence of every outline-marked line in t (an outline marker, not a bare verse number)."""
    heads = []
    for m in OUTLINE_RE.finditer(t):
        seg = t[m.start():m.start() + 500]
        mk = marker_at(seg.lstrip())
        if mk and mk[1] == 'arabic' and anchor is not None and mk[2] == anchor and m.start() <= 2: continue
        mm = SENT_END.search(seg, 8)
        heads.append(seg[:mm.start() + 1] if mm else seg)
    return heads

def cross_refs(t, book_abbr, ch):
    refs = []
    for m in REF_RE.finditer(t):
        lo = int(m.group(3)); hi = int(m.group(4) or lo)
        refs.append(dict(raw=m.group(0), book=m.group(1), chapter=int(m.group(2)), lo=lo, hi=max(lo, hi)))
    return refs

def build(lib, book, ch, lo, hi, abbr):
    S = load(lib, book, ch); text = S['text']; idx = S['idx']
    findings, coverage, notes, pieces = [], {}, [], []
    prov = json.load(open(f'{lib}/provenance.json'))
    tier = [x for x in prov['sources'] if x.get('sourceId') == 'mhc'][0]['tier']
    # fingerprints / conventions
    maxcp = max(map(ord, text))
    findings.append(dict(kind='convention', status='verified',
        msg=f'text_sha256 matches index: {S["text_sha256"] == idx["textSha256"]}; length {len(text)} vs index {idx["textLength"]}; max code point U+{maxcp:04X} ({"inside" if maxcp < 0x10000 else "OUTSIDE"} BMP)'))
    if S['text_sha256'] != idx['textSha256'] or len(text) != idx['textLength']:
        raise SystemExit('index does not match text: state undetermined')
    seen, under = {}, []
    for v in range(lo, hi + 1):
        e = idx['verses'].get(str(v))
        if e is None:
            # scan the text for a cited note (index absence vs source absence)
            cited = [m.start() for m in re.finditer(rf'\b{abbr}\s*{ch}:{v}\b', text)]
            coverage[v] = dict(state='index absence' if cited else 'source absence',
                               detail=f'no index entry; {len(cited)} text citations of {abbr} {ch}:{v}')
            continue
        nlo, nhi, how = note_span(str(v), e)
        if how == 'none':
            coverage[v] = dict(state='undetermined', detail='relation none (before first placed verse)', index=e); continue
        a, b = e['at'], e['end']
        if how == 'under-earlier':
            # the text belongs to an earlier verse's note; locate it
            if nlo < lo:
                coverage[v] = dict(state='present but excluded by range policy', detail=f'under-earlier: no comment of its own, falls under verse {nlo} ({nlo}-{nhi})', index=e, pointer=f'Henry treats {nlo}-{nhi} together')
            else: under.append((v, nlo, nhi, e))
            continue
        if nlo < lo or nhi > hi:
            coverage[v] = dict(state='present but excluded by range policy', index=e, note_span=[nlo, nhi],
                               pointer=f'Henry treats {nlo}-{nhi} together'); continue
        nid = f'MHC.{ch}.{nlo}' + (f'-{nhi}' if nhi != nlo else '')
        if nid in seen:
            coverage[v] = dict(state=coverage[seen[nid]]['state'], note_id=nid, detail=f'same note as verse {seen[nid]} (together {nlo}-{nhi})', index=e); continue
        seen[nid] = v
        spans = make_spans(text, a, b)
        probs = tiling_check(text, a, b, spans)
        mine = markers_in(text[a:b]); first = marker_at(text[a:b])
        nxt = idx['verses'].get(str(nhi + 1)); nm = marker_at(text[nxt['at']:nxt['end']]) if nxt and nxt['relation'] == 'own' else None
        last_same = [n for k, n in mine if nm and k == nm[1]]
        opens_mid = bool(first and first[2] != 1)
        cont_next = bool(nm and last_same and nm[2] == last_same[-1] + 1)
        note_flags = dict(opens_mid_outline=opens_mid, continues_in_next_note=cont_next)
        if opens_mid or cont_next:
            pointer = f'Henry\'s outline continues at {abbr} {ch}:{nhi + 1}' if cont_next else None
        else: pointer = None
        note = dict(note_id=nid, **note_flags, pointer=pointer, verse=v, note_span=[nlo, nhi], start=a, end=b, chars=b - a, relation=how,
                    evidence=e['evidence'], pieces=len(spans), tiling_problems=probs)
        notes.append(note)
        if probs:
            coverage[v] = dict(state='extraction failure', detail=probs, index=e); continue
        coverage[v] = dict(state='confirmed', index=e, note_id=nid)
        prev_id = None
        for n, (x, y) in enumerate(spans, 1):
            t = text[x:y]
            refs = cross_refs(t, abbr, ch)
            outside = [r for r in refs if r['chapter'] == ch and r['book'] == abbr and (r['lo'] < lo or r['hi'] > hi)]
            has_outline = bool(OUTLINE_RE.search(t))
            mk = marker_at(t)
            body = t[mk[4]:] if mk else t
            standalone = not PRON_RE.match(body.strip())   # outline numbering never counts against a piece
            # boundary_suspect (brief section 4): outline marker or heading pointing at same-chapter verses outside the request
            head_out = [r for h in outline_heads(t, nlo) for r in cross_refs(h, abbr, ch) if r['chapter'] == ch and r['book'] == abbr and (r['lo'] < lo or r['hi'] > hi)]
            suspect = bool(head_out)
            pid = f'MHC{ch}.{nlo}{("-" + str(nhi)) if nhi != nlo else ""}.{n:02d}'
            fl = []
            if not standalone and prev_id is None: fl.append('non-standalone but first piece of note (back-reference to text outside the note)')
            if outside and not suspect: fl.append('cites same-chapter verses outside the request (ordinary cross-reference)')
            pieces.append(dict(id=pid, note_id=nid, source_id='mhc', container_id='mhc', original_author='Matthew Henry',
                teacher_key='matthew-henry', compiler=None, work_title="Matthew Henry's Commentary on the Whole Bible",
                edition='lyteword/mhenry-complete (CC0); printed edition not identified', reference=f'{abbr} {ch}:{nlo}' + (f'-{nhi}' if nhi != nlo else ''),
                note_span=[nlo, nhi], subject_span=[nlo, nhi], anchor_verse=nlo, text=t,
                outline_label=(mk[0] if mk else None), marker_span=([x + mk[3], x + mk[4]] if mk else None),
                source_file=S['file'].split('/library/')[-1], start=x, end=y, rights=tier,
                standalone=standalone, predecessor_ids=[] if standalone or prev_id is None else [prev_id],
                markup_valid=t.count('*') % 2 == 0, boundary_suspect=suspect,
                contains_cross_refs=[r['raw'] for r in refs], flags=fl))
            prev_id = pid
    for v, nlo, nhi, e in under:
        owner = coverage.get(nlo)
        if owner and owner['state'] == 'confirmed':
            coverage[v] = dict(state='confirmed', note_id=owner['note_id'], detail=f'under-earlier: falls under the note of verse {nlo}', index=e)
        else: coverage[v] = dict(state='undetermined', detail=f'under-earlier, owner verse {nlo} state {owner["state"] if owner else "unknown"}', index=e)
    return S, coverage, notes, pieces, findings

if __name__ == '__main__':
    lib, book, ch, lo, hi = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
    out = sys.argv[6] if len(sys.argv) > 6 else None
    abbr = {'1JN': '1Jo'}.get(book, book)
    S, cov, notes, pieces, findings = build(lib, book, ch, lo, hi, abbr)
    res = dict(source='mhc', book=book, chapter=ch, scope=[lo, hi], file_sha256=S['file_sha256'], text_sha256=S['text_sha256'],
               index_file_sha256=S['idx_file_sha256'], coverage=cov, notes=notes, pieces=pieces, findings=findings)
    if out: json.dump(res, open(out, 'w'), indent=1, ensure_ascii=False)
    for v, c in cov.items(): print('verse', v, c['state'], c.get('detail', ''))
    for n in notes: print(n)
    for p in pieces: print(p['id'], p['start'], p['end'], len(p['text']), 'S' if p['standalone'] else '-', p['flags'], p['contains_cross_refs'], '|', p['text'][:70].replace('\n', ' '))
    for f in findings: print('FINDING', f)
