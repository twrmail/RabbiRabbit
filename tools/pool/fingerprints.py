#!/usr/bin/env python3
"""Fingerprints, printed frame and approval record (brief section 8). No model calls.

Serialization for hashed objects: canonical JSON, UTF-8, keys sorted, no insignificant whitespace, LF line endings, no Unicode normalization.
Three full 64-character SHA-256 fingerprints, never truncated:
  source: hash over the sorted list of (file_sha256, text_sha256) for every source file used  (computed by run_diagnostic.py, read from the report)
  pieces: hash over the ordered selected pieces (id, source offsets, text)
  frame:  hash over the printed frame (frame_v1, defined below; or frame_v2 when the page content is supplied)
frame_v2 holds every word the reader sees (teacher text, Scripture text, AI summaries and headings, Rabbit's own text, labels, credits,
note); the page is rendered from it alone (study_render.py), so an approval covers the whole page. See FRAME_V2_PROPOSAL.md.
A study is servable only when an APPROVED record exists whose three fingerprints match the frame as stored, recomputed from the data now.
A status field alone is not sufficient."""
import hashlib, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import validator as V
FRAME_VERSION = 'frame_v1'
FRAME_V2 = 'frame_v2'

def canon(obj):
    return json.dumps(obj, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')

def sha(obj): return hashlib.sha256(canon(obj)).hexdigest()

def ordered_pieces(plan, pool):
    by = {p['id']: p for p in pool}
    return [by[i['id']] for v in sorted(plan['verses'], key=int) for i in plan['verses'][v] if i['id'] in by]

def pieces_fp(plan, pool):
    return sha([dict(id=p['id'], source_file=p['source_file'], start=p['start'], end=p['end'], text=p['text']) for p in ordered_pieces(plan, pool)])

def label(p):
    """Teacher name as code renders it: the original author, never the compiler."""
    return dict(teacher=p['original_author'], compiler=p.get('compiler') or None, container=p.get('container_id') or None, work=p.get('work_title') or None)

def build_frame(plan, pool, gaps, request, pointers=None):
    """The printed frame: exactly what the reader will be shown around the weave. Text is the pieces' exact text; names come from piece fields;
    gap lines come from gap records; pointer lines (e.g. 'Calvin treats 11-14 together') come from coverage and are passed in."""
    by = {p['id']: p for p in pool}; verses = {}
    gap_by = {g['verse']: g for g in gaps}
    for v in range(request['lo'], request['hi'] + 1):
        items = []
        for it in plan['verses'].get(str(v), []):
            p = by[it['id']]
            items.append(dict(id=p['id'], role=it['role'], reference=p['reference'], text=p['text'], **label(p)))
        g = gap_by.get(v)
        verses[str(v)] = dict(items=items,
                              gap_line=(f'Not enough commentary in this pool for {request["scope"].rsplit(" ", 1)[0]} {v} ({g["reason"]}).' if g else None),
                              pointers=sorted((pointers or {}).get(str(v), [])))
    return dict(frame_version=FRAME_VERSION, scope=request['scope'], edition=request['edition'], verses=verses)

def build_frame_v2(plan, pool, gaps, request, page, pointers=None):
    """frame_v1 plus everything else the reader sees. `page` holds the non-piece content: renderer id, study text (focus, take,
    question, closing), Scripture text per verse, per-verse questions, AI headings and summaries keyed by piece id, the fixed labels,
    the stats line, credits and note. Piece data (text, names, citations, verses covered) comes from the pool as it is now."""
    by = {p['id']: p for p in pool}; base = build_frame(plan, pool, gaps, request, pointers)
    for v, vd in base['verses'].items():
        vd['scripture_text'] = page['scripture'].get(v)
        vd['question'] = (page.get('verse_questions') or {}).get(v)
        for it in vd['items']:
            p = by[it['id']]
            it.update(teacher_key=p.get('teacher_key'), covers_verses=p.get('covers_verses'), citations=p.get('citations') or None,
                      jewish_source=bool(p.get('jewish_source')), heading=(page.get('headings') or {}).get(it['id']),
                      summary=(page.get('summaries') or {}).get(it['id']))
    return dict(frame_version=FRAME_V2, renderer=page['renderer'], scope=base['scope'], edition=base['edition'], study=page['study'],
                verses=base['verses'], labels=page['labels'], stats_line=page.get('stats_line'), credits=page['credits'], note=page['note'])

def frame_fp(frame): return sha(frame)

def pointers_from_report(report, lo, hi):
    """Pointer lines for notes present but excluded by range policy, per verse, from the diagnostic coverage."""
    out = {}
    for src, e in report['sources'].items():
        for v, c in e['coverage'].items():
            if c.get('state') == 'present but excluded by range policy' and c.get('pointer') and lo <= int(v) <= hi:
                out.setdefault(v, set()).add(c['pointer'])
    return {k: sorted(s) for k, s in out.items()}

def validation_of(plan, pool, gaps, request, build):
    return V.validate(plan, pool, request, gaps, build, request.get('budget', V.DEFAULT_BUDGET))

def fingerprints(plan, pool, gaps, request, report, page=None):
    if report.get('source_problems') or not report.get('source_fingerprint_sha256'):
        raise ValueError('no source fingerprint: some source failed to load (' + '; '.join(report.get('source_problems') or ['fingerprint missing']) + ')')
    ptr = pointers_from_report(report, request['lo'], request['hi'])
    fr = build_frame_v2(plan, pool, gaps, request, page, ptr) if page is not None else build_frame(plan, pool, gaps, request, ptr)
    return dict(source=report['source_fingerprint_sha256'], pieces=pieces_fp(plan, pool), frame=frame_fp(fr)), fr

def make_record(plan, pool, gaps, request, report, build='public', note='', page=None):
    """A record is created PENDING. Only a human reviewer approves it (approve())."""
    vr = validation_of(plan, pool, gaps, request, build)
    if not vr['ok']: raise ValueError('the validator rejects this plan, so no approval record is made: ' + '; '.join(f"{r['rule']} {r['msg']}" for r in vr['rejections'][:5]))
    fps, fr = fingerprints(plan, pool, gaps, request, report, page)
    return dict(approver=None, timestamp=None, status='pending', fingerprints=fps, frame_version=FRAME_V2 if page is not None else FRAME_VERSION, build=build, validator=dict(passed=True, build=build),
                accepted_gaps=[], gaps_at_creation=[dict(verse=g['verse'], reason=g['reason']) for g in gaps], note=note), fr

def approve(record, approver, timestamp, accepted_gap_verses=()):
    """Human action. Returns a new record; never called by the builder or sorter."""
    r = json.loads(json.dumps(record)); r.update(approver=approver, timestamp=timestamp, status='approved')
    r['accepted_gaps'] = [dict(g, accepted_by=approver) for g in record['gaps_at_creation'] if g['verse'] in set(accepted_gap_verses)]
    return r

def is_servable(record, plan, pool, gaps, request, report, page=None):
    """Recompute all three fingerprints from the data as it is now and compare with the record."""
    why = []
    if record.get('status') != 'approved' or not record.get('approver') or not record.get('timestamp'): why.append('no approval by a named reviewer')
    if record.get('frame_version') != (FRAME_V2 if page is not None else FRAME_VERSION): why.append('frame version differs')
    vr = validation_of(plan, pool, gaps, request, record.get('build', 'public'))
    if not vr['ok']: return False, why + ['the validator rejects this plan now: ' + ', '.join(vr['stats']['rules_failed'])]
    try: fps, _ = fingerprints(plan, pool, gaps, request, report, page)
    except (ValueError, KeyError) as e: return False, why + [str(e)]
    if not (record.get('validator') or {}).get('passed'): why.append('the record has no passing validator result')
    for k in ('source', 'pieces', 'frame'):
        if record.get('fingerprints', {}).get(k) != fps[k]: why.append(f'{k} fingerprint does not match')
    accepted = {g['verse'] for g in record.get('accepted_gaps', [])}
    for g in gaps:
        if g['verse'] not in accepted: why.append(f'gap at verse {g["verse"]} ({g["reason"]}) not accepted by a reviewer')
    return not why, why
