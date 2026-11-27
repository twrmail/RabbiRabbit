#!/usr/bin/env python3
"""The full Rabbit study (study_full_v1), written by a model inside the rails. Structure, as in the live study:
 Opening -> study body (verse by verse: Scripture, each teacher's heading and plain-language summary over his whole passage, a bridge
 to the next verse) -> Rabbi Road (to a destination chosen by code, destinations.py) -> What's Over the Hill (one hop further, chosen
 by code). No separate Rabbit Trail section.
Code supplies and prints: Scripture (WEB), every teacher's words (whole passages, from the pool), the destination references and their
Scripture, credits. The model writes only: title, opening, headings, summaries, bridges, the Rabbi Road teaching and its prompt, and
the Over the Hill paragraph, each naming its evidence. check() applies the rails; anything that fails is not used.

usage:
  full_study.py run [--model M] [--attempts 3] [--max-cost 1]      one real model call (needs ANTHROPIC_API_KEY; Tom's go-ahead)
  full_study.py check FILE                                         check a saved study_full_v1 JSON against the current pool
  full_study.py prompt                                             print the prompt that would be sent (no call)
Writes pool/studies/jhn3-16-21/full/EF.json when a run passes, and full/run-<UTC time>.json (every attempt, its problems, its cost)."""
import json, os, re, sys, time, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import weave as W, destinations as D, run_validator as RV, studies_jhn as S

REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
SDIR = os.path.join(REPO, 'pool', 'studies', 'jhn3-16-21'); FULL = os.path.join(SDIR, 'full')
SCHEMA = 'study_full_v1'
BOOK = dict(JHN='John', ROM='Romans')
LIMITS = dict(title=70, opening=450, heading=70, bridge=300, road=700, prompt=180, hill=450)
AI_SHARE = 45   # percent of printed teacher-plus-AI characters (Tom, Nov 27: a full study where AI brings the flesh; was 35% for bridges-only weaves)
ROAD_TEACHERS = ('matthew-henry', 'john-gill')
PRICE = {'claude-haiku-4-5': (1, 5)}   # dollars per million tokens (input, output); others are estimated at (3, 15)

def wv(book, ch):
    d = json.load(open(os.path.join(REPO, 'library', 'bible', 'WEB', f'{book}.json'))); return [c for c in d['chapters'] if c['chapter'] == ch][0]['verses']
def slug(d): return f"{d['book'].lower()}{d['chapter']}-{d['verse']}"
def label(d): return f"{BOOK.get(d['book'], d['book'])} {d['chapter']}:{d['verse']}"
def tok(d): return f"{d['book']}.{d['chapter']}.{d['verse']}"

def materials(st=None, report=None):
    """Everything the model is given and the page prints, rebuilt from the repo each time."""
    st = st or next(s for s in S.STUDIES if s['key'] == 'E'); report = report or os.path.join(SDIR, 'diagnostic-jhn3-16-21-public.json')
    _, pool, _, _ = RV.load(report); P = {p['id']: p for p in pool}; lo, hi = st['scope']; J3 = wv('JHN', 3)
    dst = D.choose('JHN', 3, lo, hi, 16, 21); dest = {}
    for part in ('road', 'hill'):
        d = dst[part]; f = os.path.join(SDIR, 'destinations', f'diagnostic-{slug(d)}-public.json')
        if not os.path.exists(f): raise SystemExit(f'{part} destination {label(d)} has no committed pool ({f}); build it with run_diagnostic.py and public_pool.py')
        _, dp, _, _ = RV.load(f)
        cands = [dict(id=p['id'], teacher_key=p['teacher_key'], teacher=S.TEACH.get(p['teacher_key'], p['teacher_key']), work=p.get('work_title'),
                      rights=p['rights'], text=p['text']) for p in dp if part == 'road' and p['teacher_key'] in ROAD_TEACHERS and p['standalone'] and p['rights'] in 'AB']
        dest[part] = dict(ref=label(d), token=tok(d), votes=d['votes'], scripture=wv(d['book'], d['chapter'])[str(d['verse'])], candidates=cands)
    body = []
    for sec in st['sections']:
        body.append(dict(verse=sec['verse'], token=f'JHN.3.{sec["verse"]}', scripture=J3[str(sec['verse'])],
                         pieces=[dict(id=i, role=r, teacher_key=P[i]['teacher_key'], teacher=S.TEACH[P[i]['teacher_key']], work=P[i].get('work_title'),
                                      covers=P[i]['covers_verses'], text=P[i]['text'], summary_cap=max(150, len(P[i]['text']) // 2)) for i, r in sec['ids']]))
    return dict(scope=dict(place='John 3', lo=lo, hi=hi, ref=f'John 3:{lo}-{hi}'), body=body, road=dest['road'], hill=dest['hill'],
                source=dst['source'])

SYSTEM = """You write a Bible study for RabbiRabbit. Scripture is the foundation, the old teachers are the bones, and you bring the flesh and life: you help a new believer see, in plain warm words, what the Scripture says and what each teacher says about it. A program prints the Scripture and every teacher's words exactly, so you never retype them. You write only the connecting and explaining text, and every piece of it names its evidence.

Reply with JSON only, in exactly this shape:
{"title": "...",
 "opening": {"text": "...", "evidence": [ids]},
 "body": [{"verse": 16, "pieces": [{"piece": "ID", "heading": "...", "summary": "..."}], "bridge": {"text": "...", "evidence": [ids]}}, ...],
 "rabbi_road": {"text": "...", "evidence": [ids], "quote": ["ID"], "prompt": "..."},
 "over_the_hill": {"text": "...", "evidence": [ids]}}

Evidence ids are teacher passage ids (like MHC3.16.05) or Scripture tokens (like JHN.3.16, ROM.5.8). Cite only what the text actually draws on.

THE STRUCTURE (the program prints it in this order):
1. title, then opening: 2-4 sentences that bring the reader into the passage. Evidence: the study's Scripture tokens and any teacher ids you draw on.
2. body: one entry per verse, in the order given, with every teacher passage listed for that verse, in the order given. For each passage: a heading (a few words naming what he says) and a summary (his point in plain modern language, at most the summary_cap characters given). Each verse except the last has a bridge: 1-2 sentences that carry the reader from this verse to the next. The last verse's bridge is null.
3. rabbi_road: the program prints "Returning by way of" the destination reference and its Scripture. You write 3-5 sentences showing what that verse reveals about the study passage that a straight reading would miss, drawing on the destination Scripture, the study Scripture, and one or two of the destination teacher passages offered (list their ids in "quote"; the program prints them whole). "prompt" is one discussion question for the reader.
4. over_the_hill: the program prints the next destination reference and its Scripture. You write 2-3 sentences: a short look ahead that invites the reader on, drawn only from that Scripture and the Rabbi Road Scripture.

RULES (a program checks every one; a study that breaks a rule is thrown away):
- Use only what the given Scripture and teacher passages say. Add no history, background, word meanings, Greek or Hebrew, other Bible references, or teaching of your own.
- Name a teacher only in text whose evidence includes that teacher's passage. Name no other people except God, Jesus, Christ, the Son, the Father, the Spirit, the Lord, or names that appear in the Scripture or passages cited as evidence.
- No numbers or chapter:verse references, except a reference you were given (like John 3:16 or Romans 5:8).
- Bridges use only words found in their evidence (Scripture and passages cited) plus ordinary linking words. Keep bridges simple.
- Never say what teachers, the church, or a tradition hold in general: no "agree", "all the teachers", "the church has always", "tradition holds". Speak only of the passages cited.
- No quotation marks anywhere in your text, no markdown, no emoji.
- Length limits (characters): title 70, opening 450, heading 70, summary its summary_cap, bridge 300, rabbi_road text 700, prompt 180, over_the_hill 450. Your text must be at most 45% of the printed teacher-plus-your-text characters, so be brief.
- Plain English, warm and direct, about 8th to 10th grade, for a new believer."""

def user_message(M):
    show = dict(study_scripture=dict(ref=M['scope']['ref'], verses=[dict(token=b['token'], text=b['scripture']) for b in M['body']]),
                body=[dict(verse=b['verse'], token=b['token'], pieces=[dict(id=p['id'], teacher=p['teacher'], covers_verses=p['covers'],
                           summary_cap=p['summary_cap'], text=p['text']) for p in b['pieces']]) for b in M['body']],
                rabbi_road=dict(ref=M['road']['ref'], token=M['road']['token'], scripture=M['road']['scripture'],
                                teacher_passages=[dict(id=c['id'], teacher=c['teacher'], text=c['text']) for c in M['road']['candidates']]),
                over_the_hill=dict(ref=M['hill']['ref'], token=M['hill']['token'], scripture=M['hill']['scripture']))
    return 'Write the study for this material.\n' + json.dumps(show, indent=1, ensure_ascii=False)

# ----------------------------------------------------------------------------------------------------------------- the rails
START = set('''here think today now notice look consider read imagine remember ask see hear come stop let slow
why what how where when who whose yes still even''' .split())

def _names(teacher_names):
    sur, parts = {}, set()
    for k, n in teacher_names.items():
        for w in re.findall(r'[A-Z][a-z]+', n):
            parts.add(w)
            if w not in ('John', 'Matthew'): sur.setdefault(w, set()).add(k)
    return sur, parts

def check_text(where, text, ev_text, ev_keys, refs_ok, limit, bridge=False, teacher_names=S.TEACH, title=False):
    """title=True: a title or heading, where any word may be capitalized; each capital is then judged like a sentence start."""
    R = []; sur, parts = _names(teacher_names)
    if not isinstance(text, str) or not text.strip(): return [('F1', f'{where}: empty')]
    if len(text) > limit: R.append(('F3', f'{where}: {len(text)} characters (max {limit})'))
    for sn, keys in sur.items():
        if re.search(r'\b' + sn + r'\b', text) and not (keys & ev_keys): R.append(('W5', f'{where}: names {sn} without his passage in evidence'))
    t2 = text
    for r in refs_ok: t2 = t2.replace(r, ' ')
    for ref in re.findall(r'\b\d+:\d+\b', t2): R.append(('W6', f'{where}: reference {ref} not given'))
    pw = {w.lower() for w in W.words(ev_text)}; stems = {W.stem(w) for w in pw}
    for n in re.findall(r'\d+', t2):
        if n not in ev_text: R.append(('W7', f'{where}: number {n} not in evidence'))
    for m in re.finditer(r"[A-Za-z]+(?:'[a-z]+)?", t2):
        w = m.group(0)
        if not w[0].isupper() or w in W.ALLOW or w in parts or w in ('Holy', 'Ghost', 'Rabbit', 'Rabbi', 'Road') or w.lower() in pw: continue
        lw = w.lower(); start = title or not t2[:m.start()].strip() or re.search(r'[.!?:]\s*$', t2[:m.start()])
        # a capital that only starts a sentence is an ordinary word if it is in the evidence (any form) or is a common word;
        # a capital mid-sentence must appear in the evidence as written (W7 closes the sentence-initial gap of check_say)
        if start and (lw in W.STOP or lw in W.LINK or lw in START or W.stem(lw) in stems): continue
        R.append(('W7', f'{where}: capitalized word {w!r} not in evidence'))
    if re.search(r'["“”]', text): R.append(('W8', f'{where}: quotation marks'))
    if re.search(r'[*#_`]|[\U0001F300-\U0001FAFF]', text): R.append(('W8', f'{where}: markdown or emoji'))
    m = W.W11.search(text)
    if m: R.append(('W11', f'{where}: claim beyond the cited passages ({m.group(0)!r})'))
    if bridge:
        stems = {W.stem(w) for w in pw}
        extra = sorted({w for w in W.words(t2) if w.lower() not in W.STOP and w.lower() not in W.LINK and w not in parts and w not in W.ALLOW and W.stem(w) not in stems})
        if extra: R.append(('W12', f'{where}: words not in its evidence: {extra}'))
    return R

def check(F, M, teacher_names=S.TEACH):
    """The rails for a full study. Returns (problems, stats). Empty problems means it may be used (still PENDING Tom's approval)."""
    R = []
    if not isinstance(F, dict): return [('F1', 'not a JSON object')], {}
    for k in ('title', 'opening', 'body', 'rabbi_road', 'over_the_hill'):
        if k not in F: R.append(('F1', f'missing {k}'))
    if R: return R, {}
    scope_tok = {b['token']: b['scripture'] for b in M['body']}
    pieces = {p['id']: p for b in M['body'] for p in b['pieces']}; cands = {c['id']: c for c in M['road']['candidates']}
    texts = dict(scope_tok); texts.update({i: p['text'] for i, p in pieces.items()}); texts.update({i: c['text'] for i, c in cands.items()})
    texts[M['road']['token']] = M['road']['scripture']; texts[M['hill']['token']] = M['hill']['scripture']
    keys = {i: p['teacher_key'] for i, p in pieces.items()}; keys.update({i: c['teacher_key'] for i, c in cands.items()})
    scope_refs = [M['scope']['ref']] + [f"John 3:{b['verse']}" for b in M['body']]
    ai = 0
    def ev(where, e, allowed):
        bad = [x for x in (e or []) if x not in allowed]
        if not e: R.append(('W2', f'{where}: no evidence'))
        if bad: R.append(('W2', f'{where}: evidence {bad} not allowed here'))
        ok = [x for x in (e or []) if x in allowed]
        return ' '.join(texts[x] for x in ok), {keys[x] for x in ok if x in keys}
    def txt(where, s, e, allowed, refs, limit, bridge=False):
        nonlocal ai
        et, ek = ev(where, e, allowed); R.extend(check_text(where, s, et, ek, refs, limit, bridge, teacher_names)); ai += len(s) if isinstance(s, str) else 0
    allscope = set(scope_tok) | set(pieces)
    # title and opening
    R.extend(check_text('title', F['title'], ' '.join(scope_tok.values()) + ' ' + ' '.join(p['text'] for p in pieces.values()), set(), scope_refs, LIMITS['title'], teacher_names=teacher_names, title=True))
    ai += len(F['title']) if isinstance(F['title'], str) else 0
    o = F['opening'] if isinstance(F['opening'], dict) else {}
    txt('opening', o.get('text'), o.get('evidence'), allscope, scope_refs, LIMITS['opening'])
    # body: the verses in order, every plan passage exactly once in its own verse
    body = F['body'] if isinstance(F['body'], list) else []
    if [b.get('verse') for b in body] != [b['verse'] for b in M['body']]: R.append(('W3', f"body verses {[b.get('verse') for b in body]} are not {[b['verse'] for b in M['body']]}"))
    for mb, fb in zip(M['body'], body):
        v = mb['verse']; got = [p.get('piece') for p in fb.get('pieces') or []]
        if got != [p['id'] for p in mb['pieces']]: R.append(('W9', f'verse {v}: passages {got}, expected {[p["id"] for p in mb["pieces"]]} in that order'))
        for p in fb.get('pieces') or []:
            pid = p.get('piece')
            if pid not in pieces: continue
            allowed = {pid, mb['token']}
            R.extend(check_text(f'{pid} heading', p.get('heading'), texts[pid] + ' ' + mb['scripture'], {keys[pid]}, scope_refs, LIMITS['heading'], teacher_names=teacher_names, title=True))
            R.extend(check_text(f'{pid} summary', p.get('summary'), texts[pid] + ' ' + mb['scripture'], {keys[pid]}, scope_refs, pieces[pid]['summary_cap'], teacher_names=teacher_names))
            ai += len(p.get('heading') or '') + len(p.get('summary') or '')
        last = mb is M['body'][-1]
        br = fb.get('bridge')
        if last:
            if br: R.append(('F1', f'verse {v}: the last verse has no bridge'))
        elif not isinstance(br, dict): R.append(('F1', f'verse {v}: missing bridge'))
        else:
            nxt = M['body'][M['body'].index(mb) + 1]
            allowed = {mb['token'], nxt['token']} | {p['id'] for p in mb['pieces'] + nxt['pieces']}
            txt(f'bridge after verse {v}', br.get('text'), br.get('evidence'), allowed, scope_refs, LIMITS['bridge'], bridge=True)
    # Rabbi Road
    rr = F['rabbi_road'] if isinstance(F['rabbi_road'], dict) else {}
    q = rr.get('quote') or []
    if not (1 <= len(q) <= 2) or any(x not in cands for x in q) or len(set(q)) != len(q):
        R.append(('W2', f'rabbi_road quote {q}: one or two of {sorted(cands)}'))
    road_allowed = set(scope_tok) | {M['road']['token']} | set(cands)
    road_refs = scope_refs + [M['road']['ref']]
    txt('rabbi_road', rr.get('text'), rr.get('evidence'), road_allowed, road_refs, LIMITS['road'])
    R.extend(check_text('rabbi_road prompt', rr.get('prompt'), ' '.join(texts[x] for x in road_allowed), {keys[x] for x in road_allowed if x in keys}, road_refs, LIMITS['prompt'], teacher_names=teacher_names))
    ai += len(rr.get('prompt') or '')
    # Over the Hill
    oh = F['over_the_hill'] if isinstance(F['over_the_hill'], dict) else {}
    txt('over_the_hill', oh.get('text'), oh.get('evidence'), {M['road']['token'], M['hill']['token']}, road_refs + [M['hill']['ref']], LIMITS['hill'])
    # budget
    teacher = sum(len(p['text']) for p in pieces.values()) + sum(len(cands[x]['text']) for x in q if x in cands)
    share = 100 * ai // max(1, ai + teacher)
    if share > AI_SHARE: R.append(('W10', f'AI text is {share}% of teacher-plus-AI characters (max {AI_SHARE}%)'))
    return R, dict(ai_chars=ai, teacher_chars=teacher, ai_share=share)

# ----------------------------------------------------------------------------------------------------------------- one model call
class ApiError(Exception): pass

def _post(payload, key):
    req = urllib.request.Request('https://api.anthropic.com/v1/messages', data=json.dumps(payload).encode(), method='POST',
                                 headers={'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01'})
    try:
        with urllib.request.urlopen(req, timeout=300) as r: return json.load(r)
    except urllib.error.HTTPError as e:   # keep the API's own explanation; a bare 'HTTP Error 400' tells us nothing
        raise ApiError(f'Anthropic API {e.code}: {e.read().decode("utf-8", "replace")[:600]}')

def ask(model, system, user, max_tokens=4000):
    key = os.environ.get('ANTHROPIC_API_KEY')
    if not key: raise SystemExit('ANTHROPIC_API_KEY is not set')
    payload = dict(model=model, max_tokens=max_tokens, temperature=0, system=system, messages=[dict(role='user', content=user)])
    try: j = _post(payload, key)
    except ApiError as e:
        if 'temperature' not in str(e): raise
        payload.pop('temperature'); j = _post(payload, key)   # some models do not take a temperature setting
    u = j.get('usage') or {}; pin, pout = PRICE.get(model, (3, 15))
    return ''.join(c.get('text', '') for c in j.get('content') or []).strip(), ((u.get('input_tokens') or 0) * pin + (u.get('output_tokens') or 0) * pout) / 1e6, u

def parse(s):
    m = re.search(r'\{[\s\S]*\}', s or '')
    try: return json.loads(m.group(0)) if m else None
    except json.JSONDecodeError: return None

def run(model, attempts, max_cost):
    M = materials(); user = user_message(M); log = dict(schema='full_study_run_v1', model=model, started=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                                                        destinations=dict(road=M['road']['ref'], hill=M['hill']['ref']), attempts=[], spent=0.0, result='failed')
    msg = user; os.makedirs(FULL, exist_ok=True)
    for n in range(attempts):
        if log['spent'] >= max_cost: log['stopped'] = f'cost cap ${max_cost}'; break
        try: text, cost, usage = ask(model, SYSTEM, msg)
        except ApiError as e:
            log['attempts'].append(dict(n=n + 1, error=str(e))); print(f'attempt {n + 1}: {e}'); log['stopped'] = 'API error'; break
        log['spent'] += cost; F = parse(text)
        probs, stats = check(F, M) if F is not None else ([('F1', 'reply was not JSON')], {})
        log['attempts'].append(dict(n=n + 1, cost=round(cost, 4), usage=usage, problems=probs, stats=stats, reply=text))
        print(f'attempt {n + 1}: {len(probs)} problems, ${cost:.4f}', *[f'  {r}: {m}' for r, m in probs[:12]], sep='\n')
        if not probs:
            out = dict(schema=SCHEMA, model=model, built=log['started'], destinations=log['destinations'], study=F)
            json.dump(out, open(os.path.join(FULL, 'EF.json'), 'w'), indent=1, ensure_ascii=False); log['result'] = 'passed'; break
        msg = (user + '\n\nYour previous reply broke these rules. Write the whole study again, fixing them:\n' +
               '\n'.join(f'- {r}: {m}' for r, m in probs[:40]) + '\n\nPrevious reply:\n' + text)
    log['spent'] = round(log['spent'], 4)
    json.dump(log, open(os.path.join(FULL, f"run-{log['started'].replace(':', '')}.json"), 'w'), indent=1, ensure_ascii=False)
    print('result', log['result'], f"spent about ${log['spent']}")
    return log['result'] == 'passed'

if __name__ == '__main__':
    a = sys.argv[1:]; opt = lambda k, d: a[a.index(k) + 1] if k in a else d
    if not a or a[0] == 'prompt': print(SYSTEM, '\n\n', user_message(materials()))
    elif a[0] == 'check':
        p, s = check(json.load(open(a[1]))['study'], materials()); print(s); [print(' ', r, m) for r, m in p]; sys.exit(1 if p else 0)
    elif a[0] == 'run': sys.exit(0 if run(opt('--model', 'claude-sonnet-5-5'), int(opt('--attempts', 3)), float(opt('--max-cost', 1))) else 1)
