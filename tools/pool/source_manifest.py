"""Stage 1 source manifest for the pool builder. Reads the cloned repo (library/manifest.json, provenance.json, commentary files)
and writes one record per source: edition/rights/tier, shape family, adapter status, quirks found so far, and measured coverage of the test units.
Usage: python3 tools/source_manifest.py REPO_DIR OUT_DIR     (no network, no model calls)"""
import sys, os, json, hashlib, subprocess
UNITS = {  # draft units (unit-list-draft-nov23): book, chapter, lo, hi
 'mat25-31-46': ('MAT', 25, 31, 46), 'eph1-15-23': ('EPH', 1, 15, 23), 'rom13-11-14': ('ROM', 13, 11, 14),
 '1jn2-15-17': ('1JN', 2, 15, 17), 'mrk13-32-37': ('MRK', 13, 32, 37)}
ADAPTER = {'mhc': 'built (in pool_sources/henry_parser)', 'calvin': 'built (adapter_calvin.py)', 'jfb': 'built (adapter_jfb.py)',
           'gill': 'built (adapter_gill.py, quotations kept with footnotes)', 'wesley': 'built (adapter_wesley.py)', 'barnes-nt': 'built (adapter_verse.py)', 'tyndale': 'built (adapter_verse.py)', 'scofield': 'reports only (adapter_scofield.py): no verse index in our copy, no pieces'}
QUIRKS = {
 'mhc': ['outline numerals (I., 1., (1.), [1.]) are labels, notes can open mid-argument', 'a printed scripture block can open a note and spill past the verse (Romans 13:11-14)', 'one fragment piece found (Eph 1:16, 23 chars)', 'index is per verse; no section boundaries'],
 'calvin': ['printed scripture heading groups (English + Latin) open range sections; split off as scripture_header', 'foreign printed scripture blocks mid-section (Matthew 25:44 tail)', 'no text for Mark 13 and Matthew 25:45-46', 'harmony sections cover several Gospels'],
 'jfb': ['marker formats vary ("41.Then" with no space)', 'very short fragments', 'verse markers absent for some verses'],
 'gill': ['lemma-opener notes ("...." lines) leave 40-50 char fragments', 'rabbinic quotations are their own pieces with Gill\'s footnote (cited_quote); footnote list held aside', 'dominates thin passages (Mark 13:35 93%)'],
 'wesley': ['not parsed yet'], 'barnes-nt': ['not parsed yet'], 'scofield': ['not parsed yet'], 'tyndale': ['not parsed yet; CC BY-SA 4.0 share-alike applies'], 'spurgeon': ['Psalms only']}
def sha(p):
    h = hashlib.sha256(); h.update(open(p, 'rb').read()); return h.hexdigest()
def measure(shape, d, ch, lo, hi):
    """returns dict(chars, verse_notes, note) for the unit's chapter; None if chapter absent"""
    try:
        if isinstance(d.get('chapters'), list):
            c = next((x for x in d['chapters'] if x.get('chapter') == ch), None)
            if c is None: return dict(chars=0, note='chapter absent')
            if 'commentary' in c: return dict(chars=len(c['commentary']), note='whole-chapter text; verse split by index/parser')
            vs = c.get('verses', {}); keys = [int(k) for k in vs if k.isdigit()]
            sp = c.get('spans', {}); cov = set()
            for k in keys:
                a, b = (sp.get(str(k)) or [k, k]); cov.update(range(a, b + 1))
            inr = sorted(v for v in cov if lo <= v <= hi)
            return dict(chars=sum(len(vs[str(k)]) for k in keys if lo <= k <= hi), verses_with_notes=inr, note='verse-keyed')
        if isinstance(d.get('chapters'), dict):
            t = d['chapters'].get(str(ch)); return dict(chars=len(t) if t else 0, note='chapter string' if t else 'chapter absent')
    except Exception as e: return dict(chars=None, note='shape not measured: ' + str(e)[:60])
    return dict(chars=None, note='shape not recognised')
def main(repo, out):
    lib = os.path.join(repo, 'library'); os.makedirs(out, exist_ok=True)
    man = json.load(open(f'{lib}/manifest.json')); prov = json.load(open(f'{lib}/provenance.json'))
    ptier = {s['sourceId']: s for s in prov['sources']}
    sha_head = subprocess.run(['git', '-C', repo, 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
    date = subprocess.run(['git', '-C', repo, 'log', '-1', '--format=%cI'], capture_output=True, text=True).stdout.strip()
    recs = []
    for s in man['sources']:
        if s['kind'] != 'commentary': continue
        pr = ptier.get(s['id'], {}); rec = dict(id=s['id'], name=s.get('displayName'), status=s['status'], scope=s['scope'], shape=s['shape'],
            licence=s.get('license'), tier=pr.get('tier', 'not in provenance.json'), evidence=pr.get('evidenceLevel'),
            books=f"{s.get('coverage', {}).get('books')}/{s.get('coverage', {}).get('of')}", adapter=ADAPTER.get(s['id'], 'none'),
            quirks=QUIRKS.get(s['id'], []), units={}, files={})
        if s['status'] == 'retired': rec['units'] = 'retired, never served'; recs.append(rec); continue
        for uk, (b, ch, lo, hi) in UNITS.items():
            p = f"{lib}/commentary/{s['folder'].split('/')[-1]}/{b}.json"
            if not os.path.exists(p): rec['units'][uk] = dict(present=False, note='no book file'); continue
            d = json.load(open(p)); m = measure(s['shape'], d, ch, lo, hi); m['present'] = True; rec['units'][uk] = m
            rec['files'][f'{b}.json'] = sha(p)
        recs.append(rec)
    recs.append(dict(id='hcf-fathers', name='Church Fathers (Historical Christian Faith Commentaries-Database)', status='NOT IN REPO', scope='partial (by father and book)',
        shape='per-entry files fetched live', licence='unverified per entry', tier='B expected by age (Augustine, Chrysostom, Cyril, Catena Aurea); C for Aquinas direct (withheld in public build); provenance entry is a DRAFT, unmerged',
        evidence='none', books='n/a', adapter='built (pool_sources.fathers), live fetch', quirks=['no index (builder probes file names)', 'rate limited (HTTP 429 seen)', 'Catena entries filed under original author with compiler Aquinas', 'Cyril on Luke filed under Matthew 25 (excluded as parallel)', 'translations are older editions, not checked entry by entry'],
        units={}, files={}, action='copy the used files into the repo and pin the upstream commit before any build depends on them'))
    other = [dict(id=s['id'], kind=s['kind'], licence=s.get('license'), status=s['status']) for s in man['sources'] if s['kind'] != 'commentary']
    res = dict(repo='twrmail/RabbiRabbit', commit=sha_head, commit_date=date, manifest_snapshot=man.get('sourceSnapshot'), commentaries=recs, other_sources=other,
               rule='a changed file hash sends every unit using that source back to PENDING')
    json.dump(res, open(f'{out}/source-manifest.json', 'w'), indent=1, ensure_ascii=False)
    L = [f'# Source manifest (stage 1)', '', f'Repo twrmail/RabbiRabbit at commit `{sha_head[:12]}` ({date}). Library snapshot `{man.get("sourceSnapshot")}`.', '',
         '| source | status | tier | licence | shape | books | adapter |', '|---|---|---|---|---|---|---|']
    for r in recs: L.append(f"| {r['id']} | {r['status']} | {str(r['tier'])[:40]} | {str(r['licence'])[:40]} | {r['shape']} | {r['books']} | {r['adapter']} |")
    L += ['', '## Measured coverage of the five draft units (characters of the commentary chapter or verse notes)', '', '| source | ' + ' | '.join(UNITS) + ' |', '|---|' + '---|' * len(UNITS)]
    for r in recs:
        if isinstance(r['units'], dict) and r['units']:
            L.append(f"| {r['id']} | " + ' | '.join((str(r['units'][u].get('chars')) if r['units'][u].get('present') else 'none') for u in UNITS) + ' |')
    L += ['', '## Quirks found', '']
    for r in recs: L.append(f"- **{r['id']}**: " + '; '.join(r['quirks']))
    L += ['', '## Not commentaries (in the repo, not parsed by the pool builder)', '', ', '.join(f"{o['id']} ({o['kind']})" for o in other), '', 'Rule: ' + res['rule']]
    open(f'{out}/source-manifest.md', 'w').write('\n'.join(L) + '\n'); print('\n'.join(L))
if __name__ == '__main__': main(*sys.argv[1:3])
