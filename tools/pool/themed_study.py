#!/usr/bin/env python3
"""The themed Rabbit study (study_themed_v1), Nov 27: the shape of the live v46 study, built the safe way.
The model groups the verses into themed sections, writes the narrative, and chooses which teachers to quote and which of their
sentences, from every usable public passage on the verses (not a hand-picked plan). Code then prints, exactly as stored:
the Scripture of each section, every quoted sentence (whole sentences only, with a visible ellipsis where a passage continues, and the
whole passage one tap away), the Rabbi Road and Over the Hill destinations (chosen by code, destinations.py) and the sources list.
The model never retypes a teacher's words: a quotation is {piece, from, to} sentence numbers.

Structure: title -> opening -> sections (heading, the section's verses, then narrative and quotations in the model's order)
-> Rabbi Road -> What's Over the Hill -> Sources consulted.

Rails (check): every verse in exactly one section, in order; every quotation is a real passage on that section's verses, whole
sentences, not too long, introduced by narrative that cites it and names its teacher; at least four teachers; no teacher quoted more
than twice; no quotation starts on a sentence that leans on the one before (But, For, Therefore...); no quotation marks in AI text (so a teacher's words cannot slip into the narrative unmarked); names only with evidence;
no references or numbers not given; no claims about what teachers hold in general. Meaning (including who is speaking) is judged by
the critic call and by Rabbit's review.

usage:
  themed_study.py run [--set jhn3-16-21] [--model M] [--attempts 3] [--max-cost 1] [--key ET]   real model calls (ANTHROPIC_API_KEY; Tom's go-ahead)
  themed_study.py check FILE [--set S]                                                       check a saved study_themed_v1 JSON
  themed_study.py prompt [--set S]                                                           print the prompt (no call)
A study set is pool/studies/<slug>/ (study-set.json: unit, report, optional scope). Prepare and build new sets with themed_set.py."""
import json, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import full_study as FS, run_validator as RV, validator as V, weave as W, studies_jhn as S, destinations as D, books as B

SCHEMA = 'study_themed_v1'
LIMITS = dict(title=80, opening=900, heading=80, text=900, road=1200, prompt=250, hill=700)
MIN_TEACHERS, MAX_PER_TEACHER, MAX_QUOTES = 4, 2, 12
QUOTE_SENTENCES, QUOTE_CHARS, QUOTED_TOTAL, AI_SHARE = 6, 1300, 7000, 60

def candidates(pool, lo, hi):
    """Every passage the model may quote: usable in a public build, standalone (no predecessor), not a footnote list or a quotation
    Gill cites, and about these verses only (subject span inside the scope)."""
    out = []
    for p in pool:
        ss = p.get('subject_span') or p.get('note_span') or [p['anchor_verse']] * 2
        if not (V.usable(p, 'public') and p['standalone'] and not p.get('predecessor_ids') and p.get('piece_kind') not in ('citation_list', 'cited_quote')
                and lo <= ss[0] and ss[1] <= hi and p['teacher_key'] in S.TEACH): continue
        sp = W.sentences(p['text'])
        out.append(dict(id=p['id'], teacher_key=p['teacher_key'], teacher=S.TEACH[p['teacher_key']], work=p.get('work_title'), rights=p['rights'],
                        covers=[c for c in V.covers(p) if lo <= c <= hi], text=p['text'], sentences=[p['text'][a:b] for a, b in sp], spans=sp))
    return out

STUDIES_DIR = os.path.join(FS.REPO, 'pool', 'studies')

def units():
    u = json.load(open(os.path.join(FS.REPO, 'pool', 'units.json'))); us = u['units'] if isinstance(u, dict) and 'units' in u else u
    return {x['id']: x for x in us}

def destination_material(sd, d, part):
    """Scripture and (for the Road) the Henry and Gill standalone passages on a destination verse, from its committed public pool."""
    f = os.path.join(sd, 'destinations', f'diagnostic-{FS.slug(d)}-public.json')
    if not os.path.exists(f): raise SystemExit(f'{part} destination {B.ref(d["book"], d["chapter"], d["verse"])} has no committed pool ({f}); run themed_set.py prepare')
    _, dp, _, _ = RV.load(f)
    cands = [dict(id=p['id'], teacher_key=p['teacher_key'], teacher=S.TEACH.get(p['teacher_key'], p['teacher_key']), work=p.get('work_title'),
                  rights=p['rights'], text=p['text']) for p in dp if part == 'road' and p['teacher_key'] in FS.ROAD_TEACHERS and p['standalone']
             and p['rights'] in 'AB' and not FS.DANGLING.search(p['text'])]
    return dict(ref=B.ref(d['book'], d['chapter'], d['verse']), token=FS.tok(d), votes=d['votes'],
                scripture=FS.wv(d['book'], d['chapter'])[str(d['verse'])], candidates=cands)

def materials(slug='jhn3-16-21'):
    """Everything the model is given and the page prints, for one study set (pool/studies/<slug>/): its unit, its scope (study-set.json
    'scope', else the whole unit), the public teacher pool, and the two destinations chosen by code."""
    sd = os.path.join(STUDIES_DIR, slug); meta = json.load(open(os.path.join(sd, 'study-set.json'))); un = units()[meta['unit']]
    book, ch = un['book'], un['chapter']; lo, hi = meta.get('scope') or [un['start'], un['end']]
    _, pool, _, _ = RV.load(os.path.join(sd, meta['report'])); CH = FS.wv(book, ch)
    dst = D.choose(book, ch, lo, hi, un['start'], un['end'])
    if not dst or not dst.get('hill'): raise SystemExit(f'{slug}: no Rabbi Road / Over the Hill destination in the cross references')
    return dict(slug=slug, dir=sd, unit=un, book=book, chapter=ch,
                scope=dict(place=f'{B.name(book)} {ch}', lo=lo, hi=hi, ref=B.ref(book, ch, lo, hi)),
                verses=[dict(verse=v, token=f'{book}.{ch}.{v}', scripture=CH[str(v)]) for v in range(lo, hi + 1)],
                passages=candidates(pool, lo, hi), road=destination_material(sd, dst['road'], 'road'), hill=destination_material(sd, dst['hill'], 'hill'),
                source=dst['source'])

def excerpt(c, a, b):
    """The exact text of sentences a..b of a passage, and whether text is left out before or after."""
    return c['text'][c['spans'][a][0]:c['spans'][b][1]], a > 0, b < len(c['spans']) - 1

SYSTEM = """You write a Bible study for RabbiRabbit, for a new believer. Scripture is the foundation, the old teachers are the bones, and you bring the flesh and life. A program prints the Scripture and every teacher's words exactly, so you never retype them: you choose which of their sentences to quote, by number, and the program prints them.

Write it as one flowing piece, organized by idea, not as notes on each verse. Group the verses into themed sections (each verse in exactly one section, in order; two to five sections; the last may hold no verses if it is a closing reflection). In each section, write narrative that walks the reader through the Scripture and introduces each teacher, then quote him, then carry on. Choose the strongest, clearest sentences from the teachers offered, so the reader hears several voices.

Reply with JSON only, in exactly this shape:
{"title": "...",
 "opening": {"text": "...", "evidence": [ids]},
 "sections": [{"heading": "...", "verses": [16], "flow": [
     {"text": "...", "evidence": [ids]},
     {"quote": "PASSAGE ID", "from": 0, "to": 2},
     {"text": "...", "evidence": [ids]}]}],
 "rabbi_road": {"text": "...", "evidence": [ids], "quote": ["ID"], "prompt": "..."},
 "over_the_hill": {"text": "...", "evidence": [ids]}}
Evidence ids are passage ids (like MHC3.16.05) or Scripture tokens (like JHN.3.16, ROM.5.8): list what each part draws on.
A quote prints sentences from..to (numbers as given, inclusive) of that passage. The program shows the reader the Scripture of each section's verses at the top of the section.

THE STUDY (the program prints it in this order):
1. title and opening: draw the reader in, and say plainly what the passage is about.
2. sections: as above. A quotation must come right after narrative that names its teacher and lists the passage in its evidence. Quote only passages on that section's verses (their covers list). Quote at least four different teachers, no teacher more than twice, at most 6 sentences per quotation.
3. rabbi_road: the program prints Returning by way of the destination reference, and its Scripture. Take the reader there and show what that verse reveals about the study passage that a straight reading would miss, then bring them back enriched. Draw on the destination Scripture, the study Scripture, and one or two of the destination teacher passages offered (list their ids in "quote"; the program prints them whole). "prompt" is one discussion question for the reader's own life.
4. over_the_hill: the program prints the next destination reference and its Scripture. A short, inviting look ahead.

FREEDOM AND ITS LIMITS:
- Write freely: plain images, everyday language, a word to the reader's life, warmth.
- Bring in no outside learning: no history, background, word studies, Greek or Hebrew, other Bible passages, or doctrines the given Scripture and passages do not state. Application to life is welcome; new teaching is not.
- Never put words in a teacher's mouth: say only what his passage says.
- Do not say who is speaking or writing a passage (for example, that Jesus or John says it) unless a cited teacher says so, and then say it as his reading: Henry hears these as Jesus' words. Otherwise write these verses tell us, or the passage says.
- No quotation marks anywhere in your text: every quotation goes through a quote item. No markdown or emoji. No chapter:verse references except those given.
- Never say what teachers, the church or a tradition hold in general (no "agree", "all the teachers", "the church has always", "tradition holds").
- Length (characters): title 80, opening 900, heading 80, each narrative text 900, rabbi_road text 1200, prompt 250, over_the_hill 700. Your text at most 60% of the printed teacher-plus-your-text characters."""

def user_message(M):
    show = dict(study_scripture=dict(ref=M['scope']['ref'], verses=[dict(token=v['token'], text=v['scripture']) for v in M['verses']]),
                passages=[dict(id=c['id'], teacher=c['teacher'], work=c['work'], covers=c['covers'],
                               sentences={str(i): s for i, s in enumerate(c['sentences'])}) for c in M['passages']],
                rabbi_road=dict(ref=M['road']['ref'], token=M['road']['token'], scripture=M['road']['scripture'],
                                teacher_passages=[dict(id=c['id'], teacher=c['teacher'], text=c['text']) for c in M['road']['candidates']]),
                over_the_hill=dict(ref=M['hill']['ref'], token=M['hill']['token'], scripture=M['hill']['scripture']))
    return 'Write the study for this material.\n' + json.dumps(show, indent=1, ensure_ascii=False)

def resolved(F, M):
    """The study as the reader will see it, quotations filled in by code (for the critic)."""
    C = {c['id']: c for c in M['passages']}; out = json.loads(json.dumps(F))
    for s in out.get('sections') or []:
        for it in s.get('flow') or []:
            if isinstance(it, dict) and it.get('quote') in C and isinstance(it.get('from'), int) and isinstance(it.get('to'), int):
                c = C[it['quote']]
                if 0 <= it['from'] <= it['to'] < len(c['spans']): it['printed_quote'] = dict(teacher=c['teacher'], text=excerpt(c, it['from'], it['to'])[0])
    return out

def critic_message(M, F):
    used = {it.get('quote') for s in F.get('sections') or [] for it in s.get('flow') or [] if isinstance(it, dict)}
    src = dict(scripture={v['token']: v['scripture'] for v in M['verses']} | {M['road']['token']: M['road']['scripture'], M['hill']['token']: M['hill']['scripture']},
               passages={c['id']: dict(teacher=c['teacher'], text=c['text']) for c in M['passages'] if c['id'] in used} |
                        {c['id']: dict(teacher=c['teacher'], text=c['text']) for c in M['road']['candidates']})
    return ('SOURCES\n' + json.dumps(src, indent=1, ensure_ascii=False) + '\n\nSTUDY WRITTEN BY AI (each printed_quote is printed by the program, '
            'exactly, from the passage named)\n' + json.dumps(resolved(F, M), indent=1, ensure_ascii=False))

CRITIC = FS.CRITIC + "\nAlso flag narrative that misdescribes the quotation printed right after it."

# ----------------------------------------------------------------------------------------------------------------- the rails
def _name_words(teacher):
    return [w for w in re.findall(r'[A-Z][a-z]+', teacher) if w not in ('John', 'Matthew', 'Albert')]

def check(F, M, teacher_names=S.TEACH):
    """Returns (problems, stats). Empty problems: the study may be built (PENDING Rabbit's approval)."""
    R = []
    if not isinstance(F, dict): return [('F1', 'not a JSON object')], {}
    for k in ('title', 'opening', 'sections', 'rabbi_road', 'over_the_hill'):
        if k not in F: R.append(('F1', f'missing {k}'))
    if R: return R, {}
    C = {c['id']: c for c in M['passages']}; scope_tok = {v['token']: v['scripture'] for v in M['verses']}
    cands = {c['id']: c for c in M['road']['candidates']}
    texts = dict(scope_tok); texts.update({i: c['text'] for i, c in C.items()}); texts.update({i: c['text'] for i, c in cands.items()})
    texts[M['road']['token']] = M['road']['scripture']; texts[M['hill']['token']] = M['hill']['scripture']
    keys = {i: c['teacher_key'] for i, c in C.items()}; keys.update({i: c['teacher_key'] for i, c in cands.items()})
    lo, hi = M['scope']['lo'], M['scope']['hi']
    scope_refs = [M['scope']['ref']] + [f"{M['scope']['place']}:{v}" for v in range(lo, hi + 1)]; TOK = {v['verse']: v['token'] for v in M['verses']}
    ai = 0; quoted = 0; per_teacher = {}; seen = set()
    def txt(where, s, e, allowed, refs, limit, title=False):
        nonlocal ai
        bad = [x for x in (e or []) if x not in allowed]
        if not title and not e: R.append(('W2', f'{where}: no evidence'))
        if bad: R.append(('W2', f'{where}: evidence {bad} not allowed here'))
        ok = [x for x in (e or []) if x in allowed]
        R.extend(FS.check_text(where, s, ' '.join(texts[x] for x in ok), {keys[x] for x in ok if x in keys}, refs, limit, teacher_names=teacher_names, title=title, w7=False))
        ai += len(s) if isinstance(s, str) else 0
    allscope = set(scope_tok) | set(C)
    txt('title', F['title'], list(allscope), allscope, scope_refs, LIMITS['title'], title=True)
    o = F['opening'] if isinstance(F['opening'], dict) else {}
    txt('opening', o.get('text'), o.get('evidence'), allscope, scope_refs, LIMITS['opening'])
    secs = F['sections'] if isinstance(F['sections'], list) else []
    if not 2 <= len(secs) <= 5: R.append(('T2', f'{len(secs)} sections (two to five)'))
    order = [v for s in secs for v in (s.get('verses') or [])]
    if order != list(range(lo, hi + 1)): R.append(('T2', f'section verses {order} are not {list(range(lo, hi + 1))}, each once, in order'))
    for n, s in enumerate(secs, 1):
        vs = [v for v in (s.get('verses') or []) if isinstance(v, int)]; flow = s.get('flow') if isinstance(s.get('flow'), list) else []
        if not flow: R.append(('F1', f'section {n}: no flow')); continue
        sec_ids = [it.get('quote') for it in flow if isinstance(it, dict) and it.get('quote') in C]
        txt(f'section {n} heading', s.get('heading'), [TOK[v] for v in vs if v in TOK] + sec_ids, allscope, scope_refs, LIMITS['heading'], title=True)
        if vs and not sec_ids: R.append(('T3', f'section {n}: no quotation'))
        prev = None
        for j, it in enumerate(flow, 1):
            where = f'section {n} item {j}'
            if not isinstance(it, dict): R.append(('F1', f'{where}: not an object')); prev = None; continue
            if 'quote' in it:
                pid, a, b = it.get('quote'), it.get('from'), it.get('to')
                if pid not in C: R.append(('T4', f'{where}: {pid!r} is not a passage offered')); prev = it; continue
                c = C[pid]
                if not (isinstance(a, int) and isinstance(b, int) and 0 <= a <= b < len(c['spans'])):
                    R.append(('T4', f'{where}: sentences {a}..{b} not in {pid} (0..{len(c["spans"]) - 1})')); prev = it; continue
                t, _, _ = excerpt(c, a, b); quoted += len(t)
                if b - a + 1 > QUOTE_SENTENCES or len(t) > QUOTE_CHARS: R.append(('T5', f'{where}: quotation of {b - a + 1} sentences, {len(t)} characters (max {QUOTE_SENTENCES}, {QUOTE_CHARS})'))
                if a > 0 and W.leans(c['sentences'][a]): R.append(('T7', f'{where}: the quotation starts mid-thought ({c["sentences"][a][:40]!r} leans on the sentence before)'))
                if pid in seen: R.append(('T4', f'{where}: {pid} quoted twice'))
                seen.add(pid); per_teacher[c['teacher_key']] = per_teacher.get(c['teacher_key'], 0) + 1
                if vs and not set(c['covers']) & set(vs): R.append(('T3', f'{where}: {pid} is on verses {c["covers"]}, not this section\'s {vs}'))
                intro = prev if isinstance(prev, dict) and 'text' in prev else None
                if not intro or pid not in (intro.get('evidence') or []) or not any(re.search(r'\b' + w + r'\b', intro.get('text') or '') for w in _name_words(c['teacher'])):
                    R.append(('T1', f'{where}: {pid} must follow narrative that names {c["teacher"]} and cites {pid}'))
            elif 'text' in it: txt(where, it.get('text'), it.get('evidence'), allscope, scope_refs, LIMITS['text'])
            else: R.append(('F1', f'{where}: neither text nor quote'))
            prev = it
    if len(per_teacher) < MIN_TEACHERS: R.append(('T6', f'{len(per_teacher)} teachers quoted (at least {MIN_TEACHERS})'))
    for t, k in per_teacher.items():
        if k > MAX_PER_TEACHER: R.append(('T6', f'{S.TEACH[t]} quoted {k} times (at most {MAX_PER_TEACHER})'))
    if len(seen) > MAX_QUOTES: R.append(('T6', f'{len(seen)} quotations (at most {MAX_QUOTES})'))
    if quoted > QUOTED_TOTAL: R.append(('T5', f'{quoted} characters quoted (at most {QUOTED_TOTAL})'))
    # Rabbi Road and Over the Hill, as in the full study
    rr = F['rabbi_road'] if isinstance(F['rabbi_road'], dict) else {}
    q = rr.get('quote') or []
    if not (1 <= len(q) <= 2) or any(x not in cands for x in q) or len(set(q)) != len(q): R.append(('W2', f'rabbi_road quote {q}: one or two of {sorted(cands)}'))
    road_allowed = set(scope_tok) | {M['road']['token']} | set(cands); road_refs = scope_refs + [M['road']['ref']]
    txt('rabbi_road', rr.get('text'), rr.get('evidence'), road_allowed, road_refs, LIMITS['road'])
    txt('rabbi_road prompt', rr.get('prompt'), list(road_allowed), road_allowed, road_refs, LIMITS['prompt'])
    oh = F['over_the_hill'] if isinstance(F['over_the_hill'], dict) else {}
    txt('over_the_hill', oh.get('text'), oh.get('evidence'), {M['road']['token'], M['hill']['token']}, road_refs + [M['hill']['ref']], LIMITS['hill'])
    teacher = quoted + sum(len(cands[x]['text']) for x in q if x in cands)
    share = 100 * ai // max(1, ai + teacher)
    if share > AI_SHARE: R.append(('W10', f'AI text is {share}% of teacher-plus-AI characters (max {AI_SHARE}%)'))
    return R, dict(ai_chars=ai, teacher_chars=teacher, ai_share=share, teachers=len(per_teacher), quotations=len(seen))

# ----------------------------------------------------------------------------------------------------------------- one model call
def run(model, attempts, max_cost, key='ET', slug='jhn3-16-21'):
    if not re.fullmatch(r'ET\d*', key): raise SystemExit(f'a themed study key is ET, ET2, ET3, ... (got {key!r})')
    M = materials(slug); user = user_message(M); FULL = os.path.join(M['dir'], 'full')
    if os.path.exists(os.path.join(FULL, f'{key}.json')): raise SystemExit(f'{slug} already has {key}; choose another key (ET2, ET3, ...)')
    log = dict(schema='themed_study_run_v1', model=model, started=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
               destinations=dict(road=M['road']['ref'], hill=M['hill']['ref']), key=key, set=slug, attempts=[], spent=0.0, result='failed')
    msg = user; os.makedirs(FULL, exist_ok=True)
    for n in range(attempts):
        if log['spent'] >= max_cost: log['stopped'] = f'cost cap ${max_cost}'; break
        try: text, cost, usage = FS.ask(model, SYSTEM, msg, max_tokens=8000)
        except FS.ApiError as e: log['attempts'].append(dict(n=n + 1, error=str(e))); print(f'attempt {n + 1}: {e}'); log['stopped'] = 'API error'; break
        log['spent'] += cost; F = FS.parse(text)
        probs, stats = check(F, M) if F is not None else ([('F1', 'reply was not JSON')], {})
        log['attempts'].append(dict(n=n + 1, cost=round(cost, 4), usage=usage, problems=probs, stats=stats, reply=text))
        print(f'attempt {n + 1}: {len(probs)} problems, ${cost:.4f}', *[f'  {r}: {m}' for r, m in probs[:12]], sep='\n')
        if not probs:
            out = dict(schema=SCHEMA, model=model, built=log['started'], destinations=log['destinations'], profile='free', study=F)
            try:
                ctext, ccost, cu = FS.ask(model, CRITIC, critic_message(M, F)); log['spent'] += ccost; cj = FS.parse(ctext)
                notes = cj.get('notes') if isinstance(cj, dict) and isinstance(cj.get('notes'), list) else None
                out['critic'] = dict(model=model, notes=notes if notes is not None else [], ok=notes is not None, raw=None if notes is not None else ctext)
                log['critic'] = dict(cost=round(ccost, 4), usage=cu, notes=out['critic']['notes'])
                print(f'critic: {len(out["critic"]["notes"])} notes, ${ccost:.4f}', *[f"  [{x.get('severity')}] {x.get('where')}: {x.get('issue')}" for x in out['critic']['notes']], sep='\n')
            except FS.ApiError as e: out['critic'] = dict(model=model, notes=[], ok=False, raw=str(e)); log['critic'] = dict(error=str(e))
            json.dump(out, open(os.path.join(FULL, f'{key}.json'), 'w'), indent=1, ensure_ascii=False); log['result'] = 'passed'; break
        msg = (user + '\n\nYour previous reply broke these rules. Write the whole study again, fixing them:\n' +
               '\n'.join(f'- {r}: {m}' for r, m in probs[:40]) + '\n\nPrevious reply:\n' + text)
    log['spent'] = round(log['spent'], 4)
    json.dump(log, open(os.path.join(FULL, f"run-{key}-{log['started'].replace(':', '')}.json"), 'w'), indent=1, ensure_ascii=False)
    print('result', log['result'], f"spent about ${log['spent']}")
    return log['result'] == 'passed'

if __name__ == '__main__':
    a = sys.argv[1:]; opt = lambda k, d: a[a.index(k) + 1] if k in a else d
    st = opt('--set', 'jhn3-16-21')
    if not a or a[0] == 'prompt': print(SYSTEM, '\n\n', user_message(materials(st)))
    elif a[0] == 'check':
        d = json.load(open(a[1])); p, s = check(d['study'], materials(st)); print(s); [print(' ', r, m) for r, m in p]; sys.exit(1 if p else 0)
    elif a[0] == 'run': sys.exit(0 if run(opt('--model', 'claude-sonnet-5-5'), int(opt('--attempts', 3)), float(opt('--max-cost', 1)), opt('--key', 'ET'), st) else 1)
