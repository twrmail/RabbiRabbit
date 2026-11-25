"""Fathers translation table: for every HCF work used in the five unit pools, the expected standard English translation,
its year, whether it clears the public-domain date line (published 1930 or earlier, US, in 2026), and what is still unverified.
Usage: python3 tools/fathers_translation_table.py OUT_DIR   (no network)"""
import sys, os, json, re, collections, urllib.parse
sys.path.insert(0, os.path.dirname(__file__))
import run_validator as RV
POOLS = [('mat25-31-46', 'reports4'), ('eph1-15-23', 'reports4'), ('1jn2-15', 'reports4'), ('rom13-11-14', 'reports7'), ('mrk13-32-37', 'reports7')]
# (regex on work_title, translation expectation, year, pd_by_date, evidence, proposed tier, action)
RULES = [
 (r'^Catena Aurea', 'Newman ed., Oxford (Parker) 1841-45; translators include M. Pattison', 1845, 'yes', 'external record (Open Library, HathiTrust) for the edition; our entries cite in Newman style, e.g. "(in Joan. Tr. 21.)"; HCF entry text not compared to a scan', 'B', 'compare 3 entries to a scan of the edition'),
 (r'^Homily on the Gospel of Matthew', 'NPNF series 1 vol 10 (Chrysostom on Matthew), Prevost, rev. Riddle; CCEL ThML print source: New York, Christian Literature Publishing Co., 1886; DC.Rights Public Domain', 1886, 'yes', 'CCEL NPNF1 vol 10 ThML (24/29 excerpts exact) plus Documenta Catholica Omnia PDF (all 29 verified; Homily 79 only there, same wording, translator not named in that file); HCF source_url names a homily, not a translation', 'B', 'none for Matthew'),
 (r'^Homily on Romans', 'NPNF series 1 vol 11 (Chrysostom on Romans), Morris/Simcox, rev. Stevens', 1889, 'yes', 'my knowledge of the standard edition; style of the Romans 13:11 entry is consistent but not compared', 'B', 'compare an excerpt'),
 (r'^Homily on Ephesians', 'NPNF series 1 vol 13 (Chrysostom on Ephesians), Gross Alexander', 1889, 'yes', 'my knowledge of the standard edition', 'B', 'compare an excerpt'),
 (r'^Tractates on John', 'NPNF series 1 vol 7 (Augustine), Gibb and Innes', 1888, 'yes', 'my knowledge of the standard edition', 'B', 'compare an excerpt'),
 (r'^Ten Homilies on 1 John', 'NPNF series 1 vol 7 (Augustine), Browne, rev. Myers', 1888, 'yes', 'my knowledge of the standard edition', 'B', 'compare an excerpt'),
 (r'^Exposition on Psalm', 'NPNF series 1 vol 8 (Augustine on the Psalms), Coxe ed. (Oxford Library of the Fathers text)', 1888, 'yes', 'my knowledge of the standard edition', 'B', 'compare an excerpt'),
 (r'^LETTER', 'NOT the NPNF Letters (Cunningham, 1886): none of the 8 excerpts matches the Writings-Database Letters file, and the wording reads as a modern translation', None, 'unknown', 'full-text check: 0 of 8 excerpts found in the NPNF Letters file', 'U', 'identify the translation before use'),
 (r'^ON THE TRINITY', 'NPNF series 1 vol 3 (Augustine, On the Trinity), Haddan', 1887, 'yes', 'my knowledge of the standard edition', 'B', 'compare an excerpt'),
 (r'^SERMONS', 'modern translation likely (reads as a recent rendering; NPNF vol 6 does not carry Sermon 18)', None, 'unknown', 'full-text check: the Writings-Database file for Sermon 18 does not contain either excerpt', 'U', 'identify the translation before use'),
 (r'^Exposition of Certain Propositions', 'new translation: the Writings-Database file says it was translated from the Latin of PL 35 (Migne) as given at augustinus.it', None, 'unknown', 'full-text check: both excerpts match that file exactly; file header says new translation from Migne, translator not named', 'U', 'identify the translator and date before use'),
 (r'^CATENA$', 'unknown: HCF entry has no compiler or translator named (Cyril, 1 John)', None, 'unknown', 'none', 'U', 'identify the translation before use'),
 (r'^Commentary on (Matthew|Romans)', 'modern English translation (translator not confirmed)', None, 'no, expected', 'HCF LICENSE separates public-domain excerpts from fair-use excerpts of works still under copyright; Aquinas direct commentaries fall in the second bucket by my reading, not confirmed entry by entry', 'C', 'keep withheld in public builds'),
 (r'^Commentary on Ephesians', 'Lamb, Aquinas Scripture Series vol 2, Magi Books (modern)', 1966, 'no', 'title page of the Lamb translation found online (isidore.co copy); HCF entry text not compared', 'C', 'keep withheld in public builds'),
]
def main(out):
    os.makedirs(out, exist_ok=True); works = collections.OrderedDict()
    for n, d in POOLS:
        rep, pool, cov, req = RV.load(f'{d}/diagnostic-{n}.json')
        for x in pool:
            if not x['source_id'].startswith('hcf'): continue
            k = (x['teacher_key'], x['work_title']); w = works.setdefault(k, dict(teacher=x['teacher_key'], work=x['work_title'], compiler=x['compiler'], pieces=0, chars=0, units=set(), url=urllib.parse.unquote(urllib.parse.unquote(x.get('source_url', '')))))
            w['pieces'] += 1; w['chars'] += len(x['text']); w['units'].add(n)
    rows = []
    for w in works.values():
        for pat, tr, yr, pd, ev, tier, act in RULES:
            if re.search(pat, w['work'], re.I): break
        else: tr, yr, pd, ev, tier, act = 'no rule', None, 'unknown', 'none', 'U', 'add a rule'
        rows.append(dict(w, units=sorted(w['units']), translation=tr, year=yr, pd_by_date=pd, evidence=ev, proposed_tier=tier, action=act))
    fv = {}
    try:
        for r in json.load(open(os.path.join(out, 'fathers-verify.json')))['results']: fv[r['file']] = r
    except Exception: pass
    for r in rows:
        m = re.search(r'file=(.+)$', r['url']); f = fv.get(m.group(1) if m else '')
        r['fulltext'] = (f"{f.get('exact',0)}/{f['pieces']} exact, {len(f.get('near',[]))} near, {len(f.get('differs',[]))} differ" if f and 'exact' in f else 'no full-text file')
    rows.sort(key=lambda r: (r['proposed_tier'], r['teacher'], r['work']))
    json.dump(rows, open(f'{out}/fathers-translation-table.json', 'w'), indent=1, ensure_ascii=False)
    tot = collections.Counter(); chars = collections.Counter()
    for r in rows: tot[r['proposed_tier']] += r['pieces']; chars[r['proposed_tier']] += r['chars']
    L = ['# Fathers translation table (stage 1)', '', 'Public-domain date line used: published 1930 or earlier (US, 2026). Every entry below is an EXPECTATION from the standard edition of the work. None of the HCF entries has been compared to a scan of the translation yet. HCF\'s LICENSE dedicates public-domain-sourced excerpts to the public domain but says some excerpts are fair-use extracts from works still under copyright and puts the fair-use analysis on downstream users.', '',
         f"Totals across the five unit pools: tier B {tot['B']} pieces ({chars['B']:,} chars), tier C {tot['C']} ({chars['C']:,}), tier U {tot['U']} ({chars['U']:,}).", '',
         '| teacher | work | pieces | chars | expected translation | year | PD by date | full-text check | proposed tier | evidence | action |', '|---|---|---|---|---|---|---|---|---|---|---|']
    for r in rows: L.append(f"| {r['teacher']} | {r['work']} | {r['pieces']} | {r['chars']:,} | {r['translation']} | {r['year'] or ''} | {r['pd_by_date']} | {r['fulltext']} | {r['proposed_tier']} | {r['evidence']} | {r['action']} |")
    open(f'{out}/fathers-translation-table.md', 'w').write('\n'.join(L) + '\n'); print('\n'.join(L))
if __name__ == '__main__': main(sys.argv[1])
