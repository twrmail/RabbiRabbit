#!/usr/bin/env python3
"""Calvin, JFB, Gill and Fathers parsers for the pool builder (brief v1.1 sections 4-6, 8).
Each returns (coverage, notes, pieces, findings) like henry_parser.build().
No model calls. No network: the Fathers read a pinned local copy of the HCF repo (HCF_LOCAL)."""
import json, re, os, sys, hashlib, urllib.request, urllib.parse, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import henry_parser as H
from pool_common import *
from pool_common import sha, tier_of, refs_in, make_piece, cut_note
from adapter_jfb import jfb
from adapter_gill import gill

from adapter_calvin import calvin
from adapter_wesley import wesley
from adapter_verse import barnes, tyndale
from adapter_scofield import scofield

# ============================ Fathers =======================================
HCF_PIN = 'a88dc031b9a1'  # Commentaries-Database commit every Fathers check was made against
_PIN_OK = []
def hcf_pin_check(loc):
    """The HCF copy must be the pinned commit: a git checkout whose HEAD starts with HCF_PIN, or a copy holding a file `.pinned-commit` with it.
    There is no network fallback: a build that cannot prove its HCF copy is the pinned one stops."""
    if _PIN_OK: return
    head = None
    pc = os.path.join(loc, '.pinned-commit')
    if os.path.exists(pc): head = open(pc).read().strip()
    elif os.path.exists(os.path.join(loc, '.git')):
        import subprocess
        head = subprocess.run(['git', '-C', loc, 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
    if not head or not head.startswith(HCF_PIN):
        raise SystemExit(f'HCF copy at {loc} is not proven to be the pinned commit {HCF_PIN} (found {head!r}). Put the pinned commit in {pc} or use a git checkout of it.')
    _PIN_OK.append(1)

def hcf_get(dirn, fname, cache=None):
    loc = os.environ.get('HCF_LOCAL')  # pinned local copy of the HCF repo. No network fallback.
    if not loc: raise SystemExit('Fathers need HCF_LOCAL (path to the pinned Commentaries-Database copy). There is no network fallback.')
    hcf_pin_check(loc)
    lp = os.path.join(loc, dirn, fname)
    return open(lp, 'rb').read() if os.path.exists(lp) else None

def candidate_names(book, ch, lo, hi, nverses, nextch=True):
    B = HCF_BOOK[book]; names = []
    for v in range(lo, hi + 1): names.append((f'{B} {ch}_{v}.toml', (ch, v, ch, v)))
    for a in range(max(1, lo - 6), hi + 1):
        for b in range(max(a + 1, lo), min(nverses, hi + 6) + 1):
            names.append((f'{B} {ch}_{a}-{b}.toml', (ch, a, ch, b)))
        if a >= nverses - 3 and nextch:
            for b in range(1, 4): names.append((f'{B} {ch}_{a}-{ch + 1}_{b}.toml', (ch, a, ch + 1, b)))
    return names

_CHECKS = {}
def fathers_checks():
    """Record of each Chrysostom excerpt checked against the CCEL (or, for Matthew Homily 79, DCO) full text: pool/fathers-source-checks.json,
    keyed by the sha256 of the HCF entry quote. See fathers_check_registry.py. Missing file = nothing is marked (pieces simply carry no check)."""
    if not _CHECKS:
        pth = os.environ.get('FATHERS_CHECKS') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'pool', 'fathers-source-checks.json')
        _CHECKS['x'] = json.load(open(pth))['entries'] if os.path.exists(pth) else {}
    return _CHECKS['x']

def fathers_corrected(q):
    """Apply the recorded one-word corrections to an HCF quote. Returns (corrected text, check record or None, function mapping an offset in the
    original text to the corrected text). The original is never changed on disk; the correction is recorded and visible on the piece."""
    rec = fathers_checks().get(hashlib.sha256(q.encode()).hexdigest())
    cors = sorted((rec or {}).get('corrections', []), key=lambda c: c['off'])
    out, last = [], 0
    for c in cors:
        if q[c['off']:c['off'] + len(c['old'])] != c['old']: raise SystemExit(f'fathers correction at {c["off"]}: expected {c["old"]!r}')
        out += [q[last:c['off']], c['new']]; last = c['off'] + len(c['old'])
    out.append(q[last:])
    shift = lambda off: off + sum(len(c['new']) - len(c['old']) for c in cors if c['off'] < off)
    return ''.join(out), rec, shift

PUBLIC_CHECK_STATUSES = ('exact', 'editors-marks', 'typo', 'gap')
def fathers_public_ok(chk):
    """A Fathers excerpt may be public (tier B) only with a registry record that (1) matches the excerpt's text hash, (2) has a status showing the words
    match a full text, and (3) names a full text whose rights statement is Public Domain. Anything else is withheld (tier U), never defaulted to B."""
    if not chk: return False, 'no source-check record matches this excerpt (missing, or the upstream text changed): not verified against a full text'
    if chk.get('status') not in PUBLIC_CHECK_STATUSES: return False, f'source check status is {chk.get("status")!r}, not a word match against a full text'
    if (chk.get('against') or {}).get('ccel_rights') != 'Public Domain': return False, 'the full text it was checked against does not state Public Domain rights'
    return True, ''

def fathers(lib, book, ch, lo, hi, abbr=None, cache=None, nverses=None):
    import tomllib
    findings, cov, notes, pieces, srcs = [], {v: dict(state=None, by_father={}) for v in range(lo, hi + 1)}, [], [], {}
    web = json.load(open(f'{lib}/bible/WEB/{book}.json')); nverses = nverses or len(
        [c for c in web['chapters'] if c['chapter'] == ch][0]['verses'])
    cands = candidate_names(book, ch, lo, hi, nverses)
    found = {}
    for dirn, fkey, fname in FATHERS:
        with cf.ThreadPoolExecutor(16) as ex:
            res = list(ex.map(lambda c: (c, hcf_get(dirn, c[0], cache)), cands))
        found[dirn] = [(c, b) for c, b in res if b is not None]
        findings.append(dict(kind='fathers-files', father=dirn, msg=f'probed {len(cands)} file-name variants; found {[c[0][0] for c in found[dirn]]}'))
    for dirn, fkey, fname in FATHERS:
        tier = 'B'  # HCF tier looked up below
        for (name, (c1, a, c2, b)), raw in found[dirn]:
            srcs[f'{dirn}/{name}'] = sha(raw)
            fspan = (a, b) if c1 == c2 else (a, 10 ** 3)
            inside = c1 == c2 == ch and lo <= a and b <= hi
            ents = tomllib.loads(raw.decode('utf-8')).get('commentary', [])
            for i, e in enumerate(ents, 1):
                title = e.get('source_title', ''); q0 = e.get('quote', ''); q, chk, shift = fathers_corrected(q0)
                nid = f'HCF.{fkey}.{name[:-5].replace(" ", "")}.{i}'
                cat = 'catena' in title.lower() or 'catena' in q[:200].lower()
                app = e.get('append_to_author_name', '') or ''
                mq = re.search(r'as quoted by ([A-Za-z ]+?)(?:,|\)|$)', app)
                compiler = mq.group(1).strip() if mq else None
                container = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-') if cat else f'hcf:{fkey}'
                other = re.search(r'Gospel of (Matthew|Mark|Luke|John)', title)
                parallel = bool(other and book in ('MAT', 'MRK', 'LUK', 'JHN') and other.group(1) != HCF_BOOK.get(book))
                rec = dict(father=dirn, file=name, entry=i, title=title, chars=len(q), file_span=[a, b], inside=inside and not parallel,
                           compiler=compiler, append_to_author_name=app or None, **({'reason': 'parallel'} if parallel else {}))
                for v in range(max(lo, a), min(hi, b) + 1) if c1 == c2 == ch else []:
                    cov[v]['by_father'].setdefault(dirn, []).append(rec)
                if parallel:
                    findings.append(dict(kind='parallel-excluded', msg=f'{dirn}/{name} entry {i}: work titled "{title}" is filed under {HCF_BOOK[book]} {a}-{b} but names {other.group(1)}; excluded as a Gospel parallel (D2), reported only')); continue
                if not inside: continue
                if cat: findings.append(dict(kind='attribution', msg=f'{dirn}/{name} entry {i} "{title}": compilation; original_author={dirn} (from the database directory), compiler={compiler or "unstated"}, append_to_author_name={app!r}'))
                if (b - a) > 0 and a != b:
                    pass
                direct_aq = (fkey == 'aquinas' and not cat)
                fok, fwhy = fathers_public_ok(chk)
                # tier U: translation unidentified or not the public-domain edition (fathers-translation-table, Tom nov24: 'tier u is fine')
                unk = bool(re.match(r'(LETTER|SERMONS|Sermon \d|Exposition of Certain Propositions|CATENA$)', title))
                if inside and not unk and not direct_aq and not fok: findings.append(dict(kind='fathers-withheld', msg=f'{dirn}/{name} entry {i} "{title}": withheld (fail closed): {fwhy}'))
                def mk(k, t, x, y, prev, nid=nid, name=name, dirn=dirn, fkey=fkey, title=title, a=a, b=b, i=i, e=e):
                    p = make_piece(f'{fkey[:3].upper()}{ch}.{a}{"-" + str(b) if b != a else ""}.{i}.{k:02d}', nid, f'hcf:{fkey}', container, dirn, fkey, compiler,
                                   title, 'Historical Christian Faith Commentaries-Database (see provenance)', f'{abbr or book} {ch}:{a}' + (f'-{b}' if b != a else ''),
                                   [a, b], a, t, f'{dirn}/{name} [entry {i}]', x, y, ('C' if direct_aq else ('U' if (unk or not fok) else 'B')), prev, book, ch, lo, hi)
                    if unk: p['public_build'] = False; p['flags'].append('Tier U: translation not identified as public domain (see fathers-translation-table); withheld from public builds')
                    if not unk and not direct_aq and not fok: p['public_build'] = False; p['flags'].append('Withheld from public builds (fail closed): ' + fwhy)
                    if direct_aq: p['public_build'] = False; p['flags'].append('Aquinas direct commentary: modern translation, rights unconfirmed; withheld from public builds (Tom nov22: allow B, hold C)')
                    p['source_url'] = e.get('source_url'); p['source_text_sha256'] = sha(q0.encode()); p['container_title'] = title
                    if chk:
                        p['source_check'] = dict(status=chk['status'], against=(chk.get('against') or {}).get('volume'), homily=chk.get('homily'))
                        fixed = [c for c in chk.get('corrections', []) if x <= shift(c['off']) and shift(c['off']) + len(c['new']) <= y]
                        if fixed: p['corrected'] = True; p['flags'].append('one-word correction applied from the CCEL text: ' + '; '.join(f'"{c["old"]}" to "{c["new"]}"' for c in fixed) + ' (recorded in pool/fathers-source-checks.json)')
                        for g in chk.get('gaps', []):
                            go = shift(g['off']); tag = f'{sha(q0.encode())[:8]}@{go}'
                            if x < go < y and q[x:go].strip() and q[go:y].strip(): p['gap_inside'] = tag; p['flags'].append(f'excerpt skips {g["skipped_words"]} words of the homily inside this piece, with no mark')
                            elif q[x:go].strip() == '' and x <= go <= y: p['gap_before'] = tag
                            elif y <= go and q[y:go].strip() == '': p['gap_after'] = tag
                    return p
                spans, probs, ps = cut_note(q, 0, len(q.rstrip()), mk)
                notes.append(dict(note_id=nid, verse=a, note_span=[a, b], start=0, end=len(q), chars=len(q), pieces=len(spans), tiling_problems=probs, title=title, file=f'{dirn}/{name}'))
                if probs: findings.append(dict(kind='extraction-failure', msg=f'{nid}: {probs}')); continue
                pieces += ps
    for v, c in cov.items():
        allrec = [r for L in c['by_father'].values() for r in L]
        ok = [r for r in allrec if r['inside']]; ex = [r for r in allrec if not r['inside'] and r.get('reason', 'range') == 'range']
        c['state'] = 'confirmed' if ok else ('present but excluded by range policy' if ex else 'source absence')
        c['detail'] = 'entries inside request: %d; entries in range files excluded: %d' % (len(ok), len(ex))
        if ex: c['pointer'] = '; '.join(sorted({f'{r["father"]} treats {r["file_span"][0]}-{r["file_span"][1]} together' for r in ex}))
        c['absent_fathers'] = [d for d, _, _ in FATHERS if d not in c['by_father']]
    return dict(files_sha256=srcs), cov, notes, pieces, findings
