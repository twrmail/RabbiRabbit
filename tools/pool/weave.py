#!/usr/bin/env python3
"""Narrative weave (weave_v1): Scripture and teacher quotes printed by code, joined by short AI-written bridges.
The weave names pieces and sentence numbers; it never carries teacher or Scripture text. resolve() turns it into what the frame holds
(Scripture text, exact excerpt text and offsets), from the pool as it is now. validate() applies W1-W12 and E1, E4, E5.
E2 (visible "...") and E3 (whole passage one tap away) are renderer duties, tested in test_weave.py. No model calls.

 W1  plan_fp equals the pieces fingerprint of the study's approved plan
 W2  every quoted piece and every evidence id is in the plan
 W3  movements are exactly the unit's movements within the scope, in order; Scripture segments are exactly the scope's verses, in order
 W4  a quote sits in the movement where its first covered verse falls, after the Scripture of a verse it covers
 W5  AI text names a teacher only if that teacher's piece is in its evidence
 W6  AI text has no chapter:verse reference unless that string is in its evidence
 W7  every number and capitalized word in AI text appears in its evidence, the scope's Scripture, the allowed names, or the
     fixed word lists (closes the sentence-initial gap in check_say)
 W8  no quotation marks in AI text (only code prints quotations)
 W9  every plan piece is quoted exactly once
 W10 AI text is at most 35% of the printed teacher-plus-AI characters, and each bridge at most 600 characters
 W11 no claims about what teachers or a tradition hold in general
 W12 every content word of a bridge comes from its evidence pieces or the scope's Scripture, apart from fixed linking words
 E1  an excerpt is whole sentences: valid, ascending, unique sentence numbers from the fixed splitter
 E4  each excerpt part equals the piece text at its offsets
 E5  a chosen sentence that begins with a leaning connective brings the sentence before it"""
import re

SCHEMA = 'weave_v1'
_SPLIT = re.compile(r'([.!?]["”’*)]*)(\s+)(?=["“*(\[]*[A-Z\[])')
def sentences(t):
    """Fixed sentence splitter: [(start, end)] offsets into t. A sentence ends at . ! or ? (with any closing quote, asterisk or
    parenthesis) followed by space and a capital or opening mark. '[3.]' is not an ending."""
    out, s, end = [], 0, len(t.rstrip())
    for m in _SPLIT.finditer(t[:end]):
        out.append((s, m.end(1))); s = m.end(2)
    out.append((s, end)); return out

LEAN = ('but', 'yet', 'still', 'therefore', 'for', 'so', 'however', 'on the other hand', 'and', 'hence', 'thus', 'wherefore', 'nor')
def leans(sentence):
    w = re.sub(r'^[\s"“*(\[]+', '', sentence).lower()
    return any(w == c or w.startswith(c + ' ') or w.startswith(c + ',') for c in LEAN)

W11 = re.compile(r"\bagree|\ball (?:the |these )?(?:teachers|commentators|fathers)\b|\bthe church (?:has )?always\b|\btradition (?:holds|teaches)\b", re.I)
STOP = set('''a an the and or but nor so yet for of to in on at by with from into onto upon about as than then that this these those there here
it its it's he him his she her they them their we us our you your i me my who whom whose which what when where why how
is are was were be been being am do does did done has have had having will would shall should can could may might must
not no all any some each every both either neither one more most much many such own same other only also even just very
too again once if because while though although whether until unless before after over under up down out off away
own himself itself themselves ourselves yourself'''.split())
LINK = set('''begins begin turns turn measures measure explains explain pictures picture says say asks ask answers answer adds add
notes note writes write shows show points point next verse verses now first then teacher passage means mean sees see hears hear
reads read calls call puts put starts start ends end story line opens open closes close takes take goes go follows follow
gives give brings bring lets let way thing things kind part'''.split())
ALLOW = set('God Christ Jesus Son Lord Father Spirit John'.split())

IRREG = dict(sent='send', came='come', gave='give', given='give', went='go', gone='go', said='say', made='make', took='take', taken='take',
             saw='see', seen='see', knew='know', known='know', told='tell', brought='bring', thought='think', found='find', loved='love',
             died='die', dies='die', laid='lay', lain='lay', spoke='speak', spoken='speak', wrote='write', written='write', chose='choose', chosen='choose')
def stem(w):
    w = w.lower(); w = IRREG.get(w, w)
    for suf in ('ings', 'ing', 'eth', 'est', 'ed', 'es', 's', 'e', 'ly'):
        if w.endswith(suf) and len(w) - len(suf) >= 3: return w[:-len(suf)]
    return w
def words(t): return re.findall(r"[A-Za-z]+(?:'[a-z]+)?", t)

def unit_moves(movements, lo, hi): return [[max(a, lo), min(b, hi)] for a, b in movements if b >= lo and a <= hi]

def resolve(weave, by_id, scripture):
    """What the frame holds: Scripture text and exact excerpt parts with offsets, recomputed from the pool every time."""
    out = []
    for mv in weave['movements']:
        segs = []
        for s in mv['segments']:
            if s['kind'] == 'scripture': segs.append(dict(kind='scripture', verse=s['verse'], text=scripture.get(str(s['verse']))))
            elif s['kind'] == 'bridge': segs.append(dict(kind='bridge', text=s['text'], evidence=list(s['evidence'])))
            elif s['kind'] == 'quote':
                t = by_id[s['piece']]['text'] if s['piece'] in by_id else ''; sp = sentences(t); idx = s.get('sentences')
                if idx is None: parts = [dict(start=0, end=len(t), text=t, sentence=None)]; whole = True; lead = tail = False; gaps = [False]
                else:
                    ok = [i for i in idx if isinstance(i, int) and 0 <= i < len(sp)]
                    parts = [dict(start=sp[i][0], end=sp[i][1], text=t[sp[i][0]:sp[i][1]], sentence=i) for i in ok]
                    whole = ok == list(range(len(sp))); lead = bool(ok) and ok[0] > 0; tail = bool(ok) and ok[-1] < len(sp) - 1
                    gaps = [False] + [b - a > 1 for a, b in zip(ok, ok[1:])]
                for p, g in zip(parts, gaps): p['gap_before'] = g
                segs.append(dict(kind='quote', piece=s['piece'], whole=whole, cut_before=lead, cut_after=tail, parts=parts))
            else: segs.append(dict(kind=s.get('kind'), invalid=True))
        out.append(dict(span=list(mv['span']), segments=segs))
    return dict(schema=weave.get('schema'), plan_fp=weave.get('plan_fp'), movements=out)

def check_resolved(rw, by):
    """E4: every printed excerpt part equals the piece text at its offsets, in the pool as it is now."""
    R = []
    for m in rw['movements']:
        for s in m['segments']:
            if s.get('kind') != 'quote': continue
            t = by.get(s['piece'], {}).get('text')
            for p in s['parts']:
                if t is None or t[p['start']:p['end']] != p['text'] or not p['text'].strip():
                    R.append(('E4', f"{s['piece']} part at {p['start']}-{p['end']} does not equal the piece text at those offsets"))
    return R

def validate(weave, plan, pool, request, scripture, teacher_names, plan_fp):
    """Returns a list of (rule, message). Empty means the weave passes."""
    R = []; by = {p['id']: p for p in pool}; lo, hi = request['lo'], request['hi']
    picked = [x['id'] for v in plan['verses'].values() for x in v]; inplan = set(picked)
    if weave.get('schema') != SCHEMA: R.append(('W1', f'schema is {weave.get("schema")!r}, expected {SCHEMA!r}'))
    if weave.get('plan_fp') != plan_fp: R.append(('W1', 'plan_fp does not match the pieces fingerprint of the approved plan'))
    want = unit_moves(request.get('movements') or [[lo, hi]], lo, hi)
    if [list(m['span']) for m in weave['movements']] != want: R.append(('W3', f'movements {[m["span"] for m in weave["movements"]]} are not the unit movements {want}'))
    sv = [s['verse'] for m in weave['movements'] for s in m['segments'] if s['kind'] == 'scripture']
    if sv != list(range(lo, hi + 1)): R.append(('W3', f'Scripture segments {sv} are not the verses {lo}-{hi} in order'))
    quoted = []; ai = []; teacher_chars = 0; scope_text = ' '.join(scripture.get(str(v), '') for v in range(lo, hi + 1))
    surnames = {}; nameparts = set()
    for k, n in teacher_names.items():
        for part in re.findall(r'[A-Z][a-z]+', n):
            nameparts.add(part)
            if part not in ('John', 'Matthew'): surnames.setdefault(part, set()).add(k)
    for mv in weave['movements']:
        a, b = mv['span']; seen_v = set()
        for s in mv['segments']:
            k = s.get('kind')
            if k == 'scripture': seen_v.add(s['verse'])
            elif k == 'quote':
                pid = s.get('piece'); quoted.append(pid)
                if pid not in inplan or pid not in by: R.append(('W2', f'quote {pid} is not in the plan')); continue
                cv = by[pid]['covers_verses']
                if not (a <= cv[0] <= b): R.append(('W4', f'{pid} starts at verse {cv[0]}, outside movement {a}-{b}'))
                if not (set(cv) & seen_v): R.append(('W4', f'{pid} is quoted before the Scripture of any verse it covers ({cv})'))
                t = by[pid]['text']; sp = sentences(t); idx = s.get('sentences')
                if idx is None: teacher_chars += len(t)
                else:
                    if not idx or any(not isinstance(i, int) or i < 0 or i >= len(sp) for i in idx) or idx != sorted(set(idx)):
                        R.append(('E1', f'{pid}: sentence numbers {idx} must be unique, ascending, within 0-{len(sp) - 1}')); continue
                    for i in idx:
                        st, en = sp[i]
                        if i > 0 and (i - 1) not in idx and leans(t[st:en]): R.append(('E5', f'{pid} sentence {i} begins with a leaning connective; include sentence {i - 1}'))
                        teacher_chars += en - st
            elif k == 'bridge':
                ev = s.get('evidence') or []
                if not ev: R.append(('W2', f'bridge without evidence: {s.get("text", "")[:50]!r}'))
                bad_ev = [e for e in ev if e not in inplan or e not in by]
                if bad_ev: R.append(('W2', f'bridge evidence {bad_ev} not in the plan')); continue
                ai.append((s['text'], ev, True))
            else: R.append(('W3', f'unknown segment kind {k!r}'))
    for blk in ('questions', 'takeaways'):
        for q in weave.get(blk) or []: ai.append((q['text'], q.get('evidence') or [], False))
    dup = sorted({p for p in quoted if quoted.count(p) > 1}); miss = [p for p in picked if p not in quoted]
    if dup: R.append(('W9', f'quoted more than once: {dup}'))
    if miss: R.append(('W9', f'plan pieces never quoted: {miss}'))
    ai_chars = 0
    for text, ev, is_bridge in ai:
        ai_chars += len(text); evt = ' '.join(by[e]['text'] for e in ev if e in by); evk = {by[e]['teacher_key'] for e in ev if e in by}
        if is_bridge and len(text) > 600: R.append(('W10', f'bridge is {len(text)} characters (max 600): {text[:50]!r}'))
        for sn, keys in surnames.items():
            if re.search(r'\b' + sn + r'\b', text) and not (keys & evk): R.append(('W5', f'names {sn} without that teacher in evidence: {text[:60]!r}'))
        for ref in re.findall(r'\b\d+:\d+\b', text):
            if ref not in evt: R.append(('W6', f'reference {ref} not in evidence: {text[:60]!r}'))
        pool_words = {w.lower() for w in words(evt + ' ' + scope_text)}
        for n in re.findall(r'\d+', text):
            if n not in evt and n not in scope_text: R.append(('W7', f'number {n} not in evidence or Scripture: {text[:60]!r}'))
        for w in words(text):
            if w[0].isupper() and w not in ALLOW and w.lower() not in pool_words and w.lower() not in STOP and w.lower() not in LINK and w not in nameparts:
                R.append(('W7', f'capitalized word {w!r} not in evidence or Scripture: {text[:60]!r}'))
        if '"' in text or '“' in text or '”' in text: R.append(('W8', f'quotation marks in AI text: {text[:60]!r}'))
        m = W11.search(text)
        if m: R.append(('W11', f'claim beyond the cited passages ({m.group(0)!r}): {text[:60]!r}'))
        if is_bridge:
            stems = {stem(w) for w in pool_words}
            extra = sorted({w for w in words(text) if w.lower() not in STOP and w.lower() not in LINK and w not in nameparts and w not in ALLOW and stem(w) not in stems})
            if extra: R.append(('W12', f'words not in the evidence or Scripture: {extra}: {text[:60]!r}'))
    if not any(r[0] in ('W2', 'E1') for r in R): R += check_resolved(resolve(weave, by, scripture), by)
    total = ai_chars + teacher_chars
    if total and ai_chars * 100 > total * 35: R.append(('W10', f'AI text is {100 * ai_chars // total}% of teacher-plus-AI characters (max 35%)'))
    return R
