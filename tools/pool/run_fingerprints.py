#!/usr/bin/env python3
"""Fingerprint self-tests and records. Usage: python3 run_fingerprints.py REPORTS_DIR PLANS_DIR OUT_DIR
PLANS_DIR holds validator-<passage>.json files (key 'plan'); a plan file named plan-<passage>-<who>.json is also accepted.
Records are written PENDING; nothing here approves a study. The tamper tests approve a COPY under the name 'TEST' to prove the check can say yes,
then break one thing at a time and prove it says no."""
import json, os, sys, glob, copy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import validator as V, fingerprints as F, run_validator as RV

def tamper_tests(plan, pool, gaps, req, rep):
    rec, _ = F.make_record(plan, pool, gaps, req, rep)
    ok0, why0 = F.is_servable(rec, plan, pool, gaps, req, rep)
    appr = F.approve(rec, 'TEST', '2000-01-01T00:00:00Z', [g['verse'] for g in gaps])
    ok1, _ = F.is_servable(appr, plan, pool, gaps, req, rep)
    out = [dict(case='pending record is not servable', expected=False, got=ok0), dict(case='approved record, nothing changed, is servable', expected=True, got=ok1)]
    def t(name, plan2=None, pool2=None, rep2=None, rec2=None, gaps2=None):
        ok, why = F.is_servable(rec2 or appr, plan2 or plan, pool2 or pool, gaps if gaps2 is None else gaps2, req, rep2 or rep)
        out.append(dict(case=name, expected=False, got=ok, why=why[:2]))
    p2 = copy.deepcopy(pool); first = F.ordered_pieces(plan, pool)[0]['id']
    for p in p2:
        if p['id'] == first: p['text'] = p['text'] + ' '
    t('one trailing space added to a picked piece', pool2=p2)
    p3 = copy.deepcopy(pool)
    for p in p3:
        if p['id'] == first: p['start'] += 1
    t('piece offset moved by one', pool2=p3)
    pl = copy.deepcopy(plan); vk = next(iter(pl['verses'])); pl['verses'][vk][0]['role'] = 'warning' if pl['verses'][vk][0]['role'] != 'warning' else 'context'
    t('a role changed (frame changes)', plan2=pl)
    pl = copy.deepcopy(plan); vk = next(k for k, l in pl['verses'].items() if len(l) > 1); pl['verses'][vk][0], pl['verses'][vk][1] = pl['verses'][vk][1], pl['verses'][vk][0]
    t('two pieces swapped in order', plan2=pl)
    pl = copy.deepcopy(plan); vk = next((k for k, l in pl['verses'].items() if len(l) > 2), None) or next(k for k, l in pl['verses'].items() if len(l) > 1); pl['verses'][vk].pop()  # a plan with two per verse: the removal also trips V11, still a block
    t('a piece removed', plan2=pl)
    r2 = copy.deepcopy(rep); r2['source_fingerprint_sha256'] = '0' * 64
    t('a source file hash changed', rep2=r2)
    rc = copy.deepcopy(appr); rc['status'] = 'pending'; t('status set back to pending', rec2=rc)
    rc = copy.deepcopy(appr); rc['approver'] = None; t('approval with no named reviewer', rec2=rc)
    rc = copy.deepcopy(appr); rc['fingerprints']['frame'] = rc['fingerprints']['frame'][:-1] + ('0' if rc['fingerprints']['frame'][-1] != '0' else '1'); t('stored frame fingerprint altered by one character', rec2=rc)
    rc = copy.deepcopy(appr); rc['frame_version'] = 'frame_v0'; t('frame version differs', rec2=rc)
    # a gap that was never accepted blocks serving
    fake = [dict(verse=req['lo'], reason='thin', explanation='x', usable=1, accepted_by='')]
    t('an unaccepted gap blocks serving', gaps2=fake)
    for c in out: c['pass_'] = (c['expected'] == c['got'])
    return rec, out

def main(rep_dir, plan_dir, out):
    os.makedirs(out, exist_ok=True); bad = 0
    for path in sorted(glob.glob(f'{rep_dir}/diagnostic-*.json')):
        name = os.path.basename(path)[11:-5]; rep, pool, cov, req = RV.load(path)
        gaps = V.make_gaps(pool, req, cov, 'public')
        plans = {}
        for pf in sorted(glob.glob(f'{plan_dir}/validator-{name}.json')): plans['standin'] = json.load(open(pf))['plan']
        for pf in sorted(glob.glob(f'{plan_dir}/plan-{name}-*.json')): plans[os.path.basename(pf)[len(f'plan-{name}-'):-5]] = json.load(open(pf))
        for who, plan in plans.items():
            val = V.validate(plan, pool, req, gaps, 'public', V.DEFAULT_BUDGET)
            rec, tests = tamper_tests(plan, pool, gaps, req, rep)
            fps, frame = F.fingerprints(plan, pool, gaps, req, rep)
            nb = [c for c in tests if not c['pass_']]; bad += len(nb)
            json.dump(dict(passage=rep['passage'], who=who, validator_ok=val['ok'], record=rec, frame=frame, tamper_tests=tests), open(f'{out}/fingerprints-{name}-{who}.json', 'w'), indent=1, ensure_ascii=False)
            print(f'{name} [{who}]: validator {"PASS" if val["ok"] else "REJECT"}; source {fps["source"][:12]}.. pieces {fps["pieces"][:12]}.. frame {fps["frame"][:12]}..; tamper tests {len(tests) - len(nb)}/{len(tests)}')
            for c in nb: print('   FAIL', c)
    return bad

if __name__ == '__main__': sys.exit(1 if main(*sys.argv[1:4]) else 0)
