#!/usr/bin/env python3
"""Record Rabbit's approval of one study. Only run on Tom's own word ("approve ET"); the PR that carries it is merged by Tom.
usage: approve_study.py <study-set folder> <key> --by "Tom Robinson" [--at 2026-11-28T12:47:00Z]
It refuses unless the study is built, pending, and servable apart from the approval (fingerprints match the stored page)."""
import json, os, sys, time, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fingerprints as F

def main(a):
    folder, key = a[0], a[1]; by = a[a.index('--by') + 1]; at = a[a.index('--at') + 1] if '--at' in a else time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    rp = glob.glob(os.path.join(folder, 'approval-records-*.json'))[0]; recs = json.load(open(rp))
    if key not in recs: raise SystemExit(f'{key}: no record (is the study built?)')
    if recs[key].get('status') == 'approved': raise SystemExit(f"{key}: already approved by {recs[key]['approver']}")
    recs[key] = F.approve(recs[key], by, at)
    json.dump(recs, open(rp, 'w'), indent=1); print(f'{key} approved by {by} at {at}')

if __name__ == '__main__': main(sys.argv[1:])
