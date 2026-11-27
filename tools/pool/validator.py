#!/usr/bin/env python3
"""Shared validator, contract v1.1 (brief section 7). One implementation; the builder and the demo page both call it.
No model calls. Pure functions over plain dicts (JSON in, JSON out).

validate(plan, pool, request, gaps=None, build='private', budget=12000) -> dict(ok, rejections, warnings, stats)
make_gaps(pool, request, coverage=None, build='private') -> list of gap records (generated from data, never from the plan)
request = dict(scope='1 John 2:15', edition='WEB', lo=15, hi=15)

Decisions applied (Tom, Nov 22): Option B (a piece may sit under any requested verse its note covers: V2 uses covers_verses),
Fathers tier B allowed in public builds, Aquinas direct commentaries (tier C) withheld in public builds.
ROLES is the fixed list from mockup316-18-sources/core.js (the John 3:16-18 trial page)."""
ROLES = ('overview', 'meaning', 'word', 'doctrine', 'tension', 'context', 'application', 'warning')   # from mockup316-18-sources/core.js
MIN_PER_VERSE, MAX_PER_VERSE, TEACHER_CAP, DEFAULT_BUDGET = 2, 9, 4, 12000
# Study shapes (Tom, Nov 26). A request may carry shape='short' or 'disagreement' and the unit's movements ([[lo, hi], ...]).
# Shaped studies replace the per-verse minimum (V6, V11 minimum) with coverage rules:
#   V15 size cap; V16 every verse in scope is covered by some picked piece's covers_verses; V17 each movement has pieces from at least
#   two teachers; V18 (short only) no role repeats within a verse. The "more on this verse" drawer is not a study and is not validated here.
SHAPES = {'short': dict(min_pieces=4, max_pieces=6, max_chars=3000, no_role_repeat=True),
          'disagreement': dict(min_pieces=4, max_pieces=10, max_chars=None, no_role_repeat=False),
          # themed (Nov 27): the AI-written themed study quotes whole sentences from up to 12 passages; how much teacher text is printed
          # is limited by themed_study.py (T5), so the plan's whole-passage characters are not capped here (its request carries a wider budget).
          'themed': dict(min_pieces=4, max_pieces=12, max_chars=None, no_role_repeat=False)}
TEACHER_WARN_MIN = 3   # 'fewer teachers than offered' warns only when fewer than 3 teacher_keys are picked and the pool offers at least that many (Tom, Nov 22)
PUBLIC_OK = ('A', 'B')
GAP_REASON_ORDER = ['withheld', 'extraction failure', 'present but excluded by range policy', 'index absence', 'undetermined', 'source absence']

def covers(p):
    c = p.get('covers_verses')
    return list(c) if c else [p['anchor_verse']]

def rights_ok(p, build):
    if p.get('rights') == 'W': return False
    if build == 'public': return p.get('rights') in PUBLIC_OK and p.get('public_build', True) is not False
    return True

def usable(p, build):
    """Eligible to be picked at all: markup intact, not boundary-suspect, rights cleared for this build."""
    return bool(p.get('markup_valid', True)) and not p.get('boundary_suspect') and rights_ok(p, build) and p.get('piece_kind') != 'citation_list' and not p.get('gap_inside')

def make_gaps(pool, request, coverage=None, build='private', min_n=MIN_PER_VERSE):
    gaps = []
    for v in range(request['lo'], request['hi'] + 1):
        here = [p for p in pool if v in covers(p)]
        ok = [p for p in here if usable(p, build)]
        if len(ok) >= min_n: continue
        if ok:
            reason, why = 'thin', f'{len(ok)} usable piece(s) for this verse (minimum {min_n}); material exists but is thin'
        else:
            states = {src: m.get(str(v)) for src, m in (coverage or {}).items() if m.get(str(v))}
            blocked = [p for p in here if not usable(p, build)]
            if blocked:
                reason = 'withheld' if any(not rights_ok(p, build) for p in blocked) else 'extraction failure'
                why = f'{len(blocked)} piece(s) exist but none usable in a {build} build'
            else:
                present = set(states.values())
                reason = next((r for r in GAP_REASON_ORDER if r in present), 'undetermined')
                why = 'no usable pieces; source states: ' + ', '.join(f'{s}: {t}' for s, t in sorted(states.items())) if states else 'no pieces for this verse'
        gaps.append(dict(verse=v, reason=reason, explanation=why, usable=len(ok), accepted_by=''))
    return gaps

def validate(plan, pool, request, gaps=None, build='private', budget=DEFAULT_BUDGET):
    rej, warn = [], []
    def R(rule, msg, verse=None, id=None): rej.append(dict(rule=rule, verse=verse, id=id, msg=msg))
    def W(kind, msg, verse=None): warn.append(dict(kind=kind, verse=verse, msg=msg))
    lo, hi = request['lo'], request['hi']; scope = range(lo, hi + 1)
    gaps = make_gaps(pool, request, None, build) if gaps is None else gaps
    gap_v = {g['verse'] for g in gaps}
    by_id = {p['id']: p for p in pool}
    shape = request.get('shape')
    if shape and shape not in SHAPES: R('V15', f'unknown study shape {shape!r}'); shape = None

    # V0 exact schema ---------------------------------------------------------------------------------------------
    if not isinstance(plan, dict):
        R('V0', 'plan is not an object'); return dict(ok=False, rejections=rej, warnings=warn, stats={})
    extra = sorted(set(plan) - {'scope', 'edition', 'verses'}); missing = sorted({'scope', 'edition', 'verses'} - set(plan))
    if extra: R('V0', f'unknown top-level field(s): {extra}')
    if missing: R('V0', f'missing top-level field(s): {missing}')
    if plan.get('scope') != request['scope']: R('V0', f'scope {plan.get("scope")!r} does not match request {request["scope"]!r}')
    if plan.get('edition') != request['edition']: R('V0', f'edition {plan.get("edition")!r} does not match request {request["edition"]!r}')
    verses = plan.get('verses')
    if not isinstance(verses, dict):
        R('V0', 'verses must be an object keyed by verse number'); verses = {}
    picks = {}   # verse -> [(item index, id, role)]
    for k, items in verses.items():
        try: kv = int(k); okk = str(kv) == k and kv in scope
        except (ValueError, TypeError): okk = False
        if not okk: R('V0', f'unknown verse key {k!r}'); continue
        if not isinstance(items, list): R('V0', f'verse {k}: items must be a list', int(k)); continue
        for it in items:
            if not isinstance(it, dict) or set(it) != {'id', 'role'} or not isinstance(it.get('id'), str) or not isinstance(it.get('role'), str):
                R('V0', f'verse {k}: each item must be exactly {{id, role}} (strings); got {it!r:.80}', int(k)); continue
            picks.setdefault(int(k), []).append((it['id'], it['role']))
    # per-item rules ---------------------------------------------------------------------------------------------
    seen = {}; order = {}; n = 0
    for v in sorted(picks):
        for pid, role in picks[v]:
            n += 1; order[pid] = order.get(pid, n)
            p = by_id.get(pid)
            if p is None: R('V1', f'id {pid!r} is not in the pool', v, pid); continue
            if v not in covers(p): R('V2', f'{pid} is filed under verse {v} but its note covers {covers(p)}', v, pid)
            ss = p.get('subject_span') or p.get('note_span') or [p['anchor_verse']] * 2
            if ss[0] < lo or ss[1] > hi: R('V3', f'{pid} subject_span {ss} is outside scope {lo}-{hi}', v, pid)
            if pid in seen: R('V4', f'{pid} picked twice (verses {seen[pid]} and {v})', v, pid)
            seen.setdefault(pid, v)
            if role not in ROLES: R('V5', f'role {role!r} is not in the fixed list {list(ROLES)}', v, pid)
            if not p.get('markup_valid', True): R('V9', f'{pid} has invalid markup', v, pid)
            if p.get('boundary_suspect'): R('V9', f'{pid} is boundary_suspect (points at verses outside the request)', v, pid)
            if p.get('gap_inside'): R('V14', f'{pid} skips text of the work inside the piece with no mark (excerpt gap {p["gap_inside"]}); it cannot be shown as continuous teaching', v, pid)
            if p.get('piece_kind') == 'citation_list': R('V13', f'{pid} is a footnote list; it can only travel inside the quotation it belongs to', v, pid)
            if p.get('piece_kind') == 'cited_quote' and not p.get('citations'): R('V13', f'{pid} quotes another work but carries no resolved citation', v, pid)
            if p.get('jewish_source'): W('later Jewish writing', f'{pid} is a quotation Gill gives from a Jewish work ({"; ".join(c["raw"][:40] for c in p["citations"])}); label it as a later writing Gill cites, not as the view of Jesus\'s day', v)
            if not rights_ok(p, build): R('V10', f'{pid} is withheld in a {build} build (rights {p.get("rights")})', v, pid)
    # V12 predecessors, in order ------------------------------------------------------------------------------------
    for v in sorted(picks):
        for pid, _ in picks[v]:
            p = by_id.get(pid)
            if not p: continue
            for q in p.get('predecessor_ids') or []:
                if q not in order: R('V12', f'{pid} depends on {q}, which is not picked', v, pid)
                elif order[q] > order[pid]: R('V12', f'{pid} is placed before its predecessor {q}', v, pid)
                else: W('dependent pair', f'{pid} is picked with its predecessor {q}; read the two together', v)
    # per verse: V6 / V7 / V11 -------------------------------------------------------------------------------------
    for v in scope:
        ids = [i for i, _ in picks.get(v, [])]; k = len(ids)
        avail = [p for p in pool if v in covers(p) and usable(p, build)]
        required = 0 if shape else min(MIN_PER_VERSE, len(avail))
        if k < required: R('V6', f'verse {v} has {k} piece(s) picked but {len(avail)} usable piece(s) are in the pool (minimum {MIN_PER_VERSE}) and no gap record covers the shortfall', v)
        if k > MAX_PER_VERSE: R('V11', f'verse {v} has {k} pieces (maximum {MAX_PER_VERSE})', v)
        if not shape and k < MIN_PER_VERSE and v not in gap_v: R('V11', f'verse {v} has {k} piece(s) (minimum {MIN_PER_VERSE}) and no gap record applies', v)
        tk = {}
        for i in ids:
            if i in by_id: tk.setdefault(by_id[i]['teacher_key'], []).append(i)
        for t, l in tk.items():
            if len(l) > TEACHER_CAP: R('V7', f'verse {v}: {len(l)} pieces from teacher_key {t!r} (maximum {TEACHER_CAP})', v)
        for t_, l_ in tk.items():
            dep = {d_ for i in l_ for d_ in (by_id[i].get('derived_from') or [])} & set(tk)
            if dep: W('not independent', f'verse {v}: {t_!r} is derived from {sorted(dep)} (its own preface) and both are picked; count them as one voice', v)
        if k and len(tk) == 1: W('one teacher', f'verse {v} is served by one teacher_key ({next(iter(tk))})', v)
        offered = {p['teacher_key'] for p in avail}
        if k and len(tk) < min(len(offered), TEACHER_WARN_MIN): W('fewer teachers than offered', f'verse {v}: {len(tk)} teacher_key(s) picked, {len(offered)} offered by the pool (warning below {TEACHER_WARN_MIN})', v)
    # V8 budget and concentration ------------------------------------------------------------------------------
    chars = {}; total = 0
    for pid in order:
        p = by_id.get(pid)
        if p: chars[p['teacher_key']] = chars.get(p['teacher_key'], 0) + len(p['text']); total += len(p['text'])
    qchars = sum(len(by_id[i]['text']) for i in order if i in by_id and by_id[i].get('piece_kind') == 'cited_quote')
    after_tags = {by_id[i]['gap_after'] for i in order if i in by_id and by_id[i].get('gap_after')}
    for i in order:
        if i in by_id and by_id[i].get('gap_before') in after_tags: W('gap between pieces', f'{i} follows a piece that ends where the excerpt skips text of the homily ({by_id[i]["gap_before"]}); do not present the two as continuous')
    if total and qchars * 10 > total * 4: W('quotation-heavy', f'{100 * qchars // total}% of picked characters are quotations Gill cites')
    if total > budget: R('V8', f'picked text is {total} characters; budget is {budget}')
    for t, c in chars.items():
        if total and c * 2 > total: W('concentration', f'teacher_key {t!r} supplies {100 * c // total}% of picked characters')
    # V15-V18 study shapes ---------------------------------------------------------------------------------------
    if shape:
        sp = SHAPES[shape]; n = len(order)
        if n < sp['min_pieces'] or n > sp['max_pieces']: R('V15', f'a {shape} study has {sp["min_pieces"]}-{sp["max_pieces"]} pieces; this plan has {n}')
        if sp['max_chars'] and total > sp['max_chars']: R('V15', f'a {shape} study has at most {sp["max_chars"]} characters of teacher text; this plan has {total}')
        touched = {c for i in order if i in by_id for c in covers(by_id[i])}
        for v in scope:
            if v not in touched: R('V16', f'verse {v} is not covered by any picked piece', v)
        moves = [m for m in (request.get('movements') or [[lo, hi]]) if m[1] >= lo and m[0] <= hi]
        for a, b in moves:
            tks = {by_id[i]['teacher_key'] for v in range(max(a, lo), min(b, hi) + 1) for i, _ in picks.get(v, []) if i in by_id}
            if len(tks) < 2: R('V17', f'movement {a}-{b} has pieces from {len(tks)} teacher(s); at least 2 are needed')
        if sp['no_role_repeat']:
            for v in scope:
                roles = [r for _, r in picks.get(v, [])]
                for r in sorted({r for r in roles if roles.count(r) > 1}): R('V18', f'verse {v}: role {r!r} is used {roles.count(r)} times; a short study gives each piece under a verse its own job', v)
    # gap records that were not accepted are a reviewer matter ----------------------------------------------------
    for g in gaps:
        if not g.get('accepted_by'): W('gap not yet accepted', f'verse {g["verse"]}: {g["reason"]}: {g["explanation"]}', g['verse'])
    return dict(ok=not rej, rejections=rej, warnings=warn, stats=dict(picked=len(order), chars=total, budget=budget, build=build,
                                                                         rules_failed=sorted({r['rule'] for r in rej})))
