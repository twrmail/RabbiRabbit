#!/usr/bin/env python3
"""Fail-closed tests (no network, no model). Usage: python3 tools/pool/run_failclosed_tests.py REPORTS_DIR
Each case must fail closed: the build stops or the piece is withheld; nothing passes by default."""
import os, sys, json, glob, tempfile, copy, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pool_sources as P, fingerprints as F, validator as V, run_validator as RV
out = []
def case(name, ok, why=''): out.append((name, bool(ok), why))
def raises(fn, exc):
    try: fn(); return False
    except exc: return True
GOOD = dict(status='exact', against=dict(ccel_rights='Public Domain'))
case('public: exact + Public Domain', P.fathers_public_ok(GOOD)[0])
case('public: gap + Public Domain', P.fathers_public_ok(dict(GOOD, status='gap'))[0])
case('withheld: no record', not P.fathers_public_ok(None)[0])
case('withheld: unchecked', not P.fathers_public_ok(dict(GOOD, status='unchecked'))[0])
case('withheld: other (needs a person)', not P.fathers_public_ok(dict(GOOD, status='other'))[0])
case('withheld: rights not stated', not P.fathers_public_ok(dict(status='exact', against=dict(ccel_rights='not stated in the file')))[0])
case('public: rights_status Public Domain with a basis', P.fathers_public_ok(dict(status='exact', against=dict(rights_status='Public Domain', rights_basis='x')))[0])
case('withheld: rights field absent (DCO PDF)', not P.fathers_public_ok(dict(status='exact', against=dict(rights='not stated by the source')))[0])
os.environ.pop('HCF_LOCAL', None)
case('no HCF_LOCAL: stops, no network fallback', raises(lambda: P.hcf_get('John Chrysostom', 'x.toml'), SystemExit))
with tempfile.TemporaryDirectory() as d:
    os.environ['HCF_LOCAL'] = d; P._PIN_OK.clear()
    case('unpinned HCF copy: stops', raises(lambda: P.hcf_get('John Chrysostom', 'x.toml'), SystemExit))
    open(os.path.join(d, '.pinned-commit'), 'w').write('0000000000')
    case('wrong pinned commit: stops', raises(lambda: P.hcf_get('John Chrysostom', 'x.toml'), SystemExit))
    open(os.path.join(d, '.pinned-commit'), 'w').write(P.HCF_PIN + 'ffff\n'); P._PIN_OK.clear()
    case('right pinned commit: reads', P.hcf_get('John Chrysostom', 'absent.toml') is None)
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fathers_check_registry.py')).read()
ns = {}; exec(src[src.index('HCF_PIN = '):src.index('res = {}')], ns)
r = {}; ns['put'](r, 'k', dict(file='A/x.toml', entry=1))
case('registry: same entry again is fine', not raises(lambda: ns['put'](r, 'k', dict(file='A/x.toml', entry=1)), SystemExit))
case('registry: key collision between two entries stops', raises(lambda: ns['put'](r, 'k', dict(file='A/y.toml', entry=2)), SystemExit))
# approval and fingerprints
rep, pool, cov, req = RV.load(sorted(glob.glob(os.path.join(sys.argv[1], 'diagnostic-*.json')))[0])
gaps = V.make_gaps(pool, req, None, 'public'); plan = RV.standin(pool, req, 'public')
rec, _ = F.make_record(plan, pool, gaps, req, rep)
case('good plan: record is made', rec['validator']['passed'])
bad = copy.deepcopy(plan); k = next(iter(bad['verses'])); bad['verses'][k].append(dict(id='NO-SUCH-PIECE', role='meaning'))
case('bad plan (unknown id): no record is made', raises(lambda: F.make_record(bad, pool, gaps, req, rep), ValueError))
appr = F.approve(rec, 'TEST', '2000-01-01T00:00:00Z', [g['verse'] for g in gaps])
case('approved good record is servable', F.is_servable(appr, plan, pool, gaps, req, rep)[0])
nov = copy.deepcopy(appr); nov.pop('validator')
case('approved record without a validator result is not servable', not F.is_servable(nov, plan, pool, gaps, req, rep)[0])
case('approved record, plan now invalid, is not servable', not F.is_servable(appr, bad, pool, gaps, req, rep)[0])
rep2 = dict(rep, source_problems=['calvin: IndexError'], source_fingerprint_sha256=None)
case('failed source: no fingerprint, not servable', not F.is_servable(appr, plan, pool, gaps, req, rep2)[0] and raises(lambda: F.make_record(plan, pool, gaps, req, rep2), ValueError))
w = [o for o in out if not o[1]]
for n, ok, why in out: print(('PASS ' if ok else 'FAIL ') + n)
print(f'{len(out) - len(w)}/{len(out)} pass'); sys.exit(1 if w else 0)
