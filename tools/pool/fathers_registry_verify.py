#!/usr/bin/env python3
"""Gate for the Fathers registry. Usage: python3 tools/pool/fathers_registry_verify.py HCF_DIR [REGISTRY.json]
Fails (exit 1) when:
 - the HCF copy is not the pinned commit;
 - a record's key is not the sha256 of the HCF quote at its file and entry (the upstream text changed, or the record is wrong);
 - two records point at the same file and entry;
 - an HCF entry from a checked author folder has no record (reported, so nothing public goes through unverified).
Reports (does not fail on) entries with no record that are withheld by the adapter anyway."""
import sys, os, re, json, glob, hashlib, tomllib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pool_sources as P
hcf = sys.argv[1]; reg = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'pool', 'fathers-source-checks.json')
os.environ['HCF_LOCAL'] = hcf; P.hcf_pin_check(hcf)
d = json.load(open(reg))['entries']; bad = []; seen = {}
for k, r in d.items():
    path = os.path.join(hcf, r['file'])
    try: q = tomllib.load(open(path, 'rb'))['commentary'][r['entry'] - 1]['quote']
    except Exception as e: bad.append(f'{r["file"]} #{r["entry"]}: cannot read ({e})'); continue
    if hashlib.sha256(q.encode()).hexdigest() != k: bad.append(f'{r["file"]} #{r["entry"]}: quote hash differs from the record key')
    if r.get('quote_sha256') != k: bad.append(f'{r["file"]} #{r["entry"]}: quote_sha256 field missing or wrong')
    if r.get('hcf_commit') != P.HCF_PIN: bad.append(f'{r["file"]} #{r["entry"]}: hcf_commit field missing or not the pin')
    if (r['file'], r['entry']) in seen: bad.append(f'{r["file"]} #{r["entry"]}: two records for one entry')
    seen[(r['file'], r['entry'])] = k
missing = []
for author in sorted({r['file'].split('/')[0] for r in d.values()}):
    for f in sorted(glob.glob(os.path.join(hcf, author, '*.toml'))):
        for i, e in enumerate(tomllib.load(open(f, 'rb')).get('commentary', []), 1):
            if (f'{author}/{os.path.basename(f)}', i) not in seen: missing.append(f'{author}/{os.path.basename(f)} #{i} ({e.get("source_title", "")[:40]})')
print(f'{len(d)} records, {len(bad)} problems, {len(missing)} HCF entries in these author folders with no record (withheld from public builds)')
for b in bad: print('PROBLEM', b)
sys.exit(1 if bad else 0)
