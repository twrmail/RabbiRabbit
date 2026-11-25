"""Step 1+2: copy the used Fathers full texts from HCF Writings-Database (pinned commit) and test that every HCF excerpt we use
appears in its full-text file. Method: letters-only comparison (lowercase, only a-z letters kept) so footnote numbers, quote styles and
HTML entities don't matter, but any word difference does.
Usage: python3 tools/fathers_verify.py WDB_DIR COPY_DIR OUT_DIR"""
import sys, os, re, json, html, shutil, urllib.parse, subprocess, collections
sys.path.insert(0, os.path.dirname(__file__))
import run_validator as RV
POOLS = [('mat25-31-46', 'reports4'), ('eph1-15-23', 'reports4'), ('1jn2-15', 'reports4'), ('rom13-11-14', 'reports6'), ('mrk13-32-37', 'reports6')]
def letters(s):
    s = re.sub(r'<[^>]+>', ' ', s); s = html.unescape(s)
    return re.sub(r'[^a-z]', '', s.lower())
def main(wdb, copy, out):
    os.makedirs(copy, exist_ok=True); os.makedirs(out, exist_ok=True); need = collections.defaultdict(list)
    for n, d in POOLS:
        rep, pool, cov, req = RV.load(f'{d}/diagnostic-{n}.json')
        for x in pool:
            if not x['source_id'].startswith('hcf'): continue
            u = urllib.parse.unquote(urllib.parse.unquote(x.get('source_url', ''))); m = re.search(r'file=(.+)$', u)
            need[m.group(1) if m else ''].append((n, x))
    sha = subprocess.run(['git', '-C', wdb, 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
    paths = [p for p in need if p]
    subprocess.run(['git', '-C', wdb, 'sparse-checkout', 'set', '--no-cone'] + paths, capture_output=True)
    subprocess.run(['git', '-C', wdb, 'checkout'], capture_output=True)
    res = []; files = {}
    for p, items in sorted(need.items()):
        if not p: res.append(dict(file='(none)', pieces=len(items), status='no source_url', works=sorted({x['work_title'] for n, x in items}))); continue
        fp = os.path.join(wdb, p)
        if not os.path.exists(fp): res.append(dict(file=p, pieces=len(items), status='file not in Writings-Database', works=sorted({x['work_title'] for n, x in items}))); continue
        raw = open(fp, errors='replace').read(); full = letters(raw); dst = os.path.join(copy, p); os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copyfile(fp, dst)
        files[p] = dict(bytes=len(raw.encode()), sha256=__import__('hashlib').sha256(raw.encode()).hexdigest())
        ok = bad = 0; badids = []; near = []; differs = []
        for n, x in items:
            t = letters(x['text'])
            if t and t in full: ok += 1; continue
            bad += 1; badids.append(x['id'])
            wins = [t[i:i + 30] for i in range(0, max(1, len(t) - 30), 15)]; cov_ = sum(1 for w in wins if w in full) / max(1, len(wins))
            (near if cov_ >= 0.8 else differs).append((x['id'], round(cov_, 2)))
        head = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', raw)))[:160]
        res.append(dict(file=p, pieces=len(items), exact=ok, not_found=bad, near=near, differs=differs, not_found_ids=badids[:6], works=sorted({x['work_title'] for n, x in items}), file_head=head))
    json.dump(dict(writings_database_commit=sha, files=files, results=res), open(f'{out}/fathers-verify.json', 'w'), indent=1, ensure_ascii=False)
    L = ['# Fathers excerpt check against full-text copies', '', f'Source: HistoricalChristianFaith/Writings-Database at commit `{sha[:12]}`. Method: letters-only exact substring test (every word must match; footnote numbers, quote marks and entities are ignored).', '',
         '| file | pieces | exact | near (>=80% of 30-letter windows found) | differs | note |', '|---|---|---|---|---|---|']
    for r in res: L.append(f"| {r['file']} | {r['pieces']} | {r.get('exact','')} | {len(r.get('near',[])) if 'near' in r else ''} | {len(r.get('differs',[])) if 'differs' in r else ''} | {r.get('status','') or ', '.join(i for i,_ in r.get('differs',[])[:5])} |")
    te = sum(r.get('exact', 0) for r in res); tn = sum(r.get('not_found', 0) for r in res)
    tnr = sum(len(r.get('near', [])) for r in res); tdf = sum(len(r.get('differs', [])) for r in res)
    L += ['', f'Total: {te} exact, {tnr} near (edited or elided), {tdf} differ, across {len(res)} files.']
    open(f'{out}/fathers-verify.md', 'w').write('\n'.join(L) + '\n'); print('\n'.join(L))
if __name__ == '__main__': main(*sys.argv[1:4])
