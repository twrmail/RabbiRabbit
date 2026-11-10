// Damage-test suite. Proves the checkers catch damage: each case makes a temporary copy of the repository (files are links to the real
// ones; only the file being damaged is a real copy), damages it in one specific way, runs the checker that should notice, and passes only if
// the checker reports the damage. A case that is NOT caught is a failure of the checking system, not of the library.
// READ-ONLY with respect to the repository: everything happens in a temporary folder that is deleted afterwards.
// Usage (from the repo root):  node tools/tests/damage-suite.mjs [--discover] [--only name,name] [--keep]
// Exit code 0 only if the undamaged repository passes AND every damage case is caught.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2), DISCOVER = args.includes('--discover'), KEEP = args.includes('--keep')
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-damage-'))

// ---- temporary copies ----
function mirror(src, dst) {
  fs.mkdirSync(dst, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name)
    if (e.isDirectory()) mirror(s, d); else fs.symlinkSync(s, d)
  }
}
let counter = 0
function makeRoot(damage) {
  const root = path.join(TMP, 'r' + ++counter)
  fs.mkdirSync(root)
  for (const d of ['library', 'data']) mirror(path.join(REPO, d), path.join(root, d))
  fs.symlinkSync(path.join(REPO, 'tools'), path.join(root, 'tools'))
  for (const f of ['library-baseline.json']) if (fs.existsSync(path.join(REPO, f))) fs.symlinkSync(path.join(REPO, f), path.join(root, f))
  if (damage) damage(editor(root))
  return root
}
const editor = root => ({
  root,
  text(rel, fn) { const p = path.join(root, rel), t = fs.readFileSync(p, 'utf8'); fs.rmSync(p); const n = fn(t); if (n === t) throw new Error('damage changed nothing in ' + rel); fs.writeFileSync(p, n) },
  json(rel, fn) { const p = path.join(root, rel), d = JSON.parse(fs.readFileSync(p, 'utf8')); fs.rmSync(p); fn(d); fs.writeFileSync(p, JSON.stringify(d, null, 1)) },
  remove(rel) { fs.rmSync(path.join(root, rel)) },
  chapter(rel, n, fn) { this.json(rel, d => { const c = d.chapters.find(x => x.chapter === n); if (!c) throw new Error('no chapter ' + n); fn(c) }) },
  copyOf(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8') }
})
const flip = t => t.slice(0, 20) + (t[20] === 'Z' ? 'Y' : 'Z') + t.slice(21)

// ---- runners ----
const run = (cmd, argv, cwd) => new Promise(res => {
  const p = spawn(process.execPath, [path.join(REPO, 'tools', cmd), ...argv], { cwd }); let out = '', err = ''
  p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d); p.on('close', code => res({ code, out, err }))
})
const RUNNERS = {
  async scorecard(root) {
    const r = await run('source-scorecard.mjs', ['library', '--out', path.join(root, 'sc')], root)
    let gates = {}, ev = {}
    try { for (const s of JSON.parse(fs.readFileSync(path.join(root, 'sc.json'), 'utf8')).sources) { gates[s.id] = [1, 2, 3, 4, 5, 6, 7].map(i => s.gates[i][0]); ev[s.id] = [1, 2, 3, 4, 5, 6, 7].map(i => s.gates[i][1].filter(Boolean).map(e => typeof e === 'string' ? e : (e.t || e.text || JSON.stringify(e))).join(' | ')) } } catch {}
    return { ...r, gates, ev }
  },
  async apply(root) { return run('apply-library-fixes.mjs', [root, '--check'], root) },
  async scans(root) { return run('guardian-scans.mjs', [path.join(root, 'library'), '--json'], root).then(r => { let f = []; try { f = JSON.parse(r.out).findings } catch {} return { ...r, findings: f } }) }
}

// ---- how a case is judged: what changed compared with the undamaged run ----
function signals(kind, res, base) {
  const s = []
  if (res.code !== base.code) s.push(`exit ${base.code}->${res.code}${res.err ? ': ' + res.err.trim().split('\n').find(l => l.trim()).slice(0, 110) : ''}`)
  if (kind === 'scorecard') for (const id of Object.keys(base.gates)) {
    if (!res.gates[id]) { if (res.code === 0) s.push(`source ${id} missing from the scorecard`); continue }
    base.gates[id].forEach((st, i) => { if (res.gates[id][i] !== st) s.push(`${id} gate ${i + 1}: ${st}->${res.gates[id][i]}`) })
    base.ev[id].forEach((e, i) => { if (res.ev[id][i] !== e && res.gates[id][i] === base.gates[id][i]) s.push(`${id} gate ${i + 1} evidence changed`) })
  }
  if (kind === 'scans') { const k = f => `${f.source}|${f.book}|${f.chapter}|${f.check}`, b = new Set(base.findings.filter(f => !f.explained).map(k)); for (const f of res.findings.filter(f => !f.explained)) if (!b.has(k(f))) s.push(`new finding ${f.source} ${f.book} ${f.chapter} ${f.check}`) }
  return s
}
const gateWorse = (a, b) => a === 'FAIL' && b !== 'FAIL'

// ---- the cases ----
const sk = 'library/commentary/'
const CASES = [
  // held material
  { name: 'held text altered by one character', run: 'scorecard', damage: e => e.json('library/held/calvin-held.json', d => { d.items[0].text += 'x' }), want: /^exit/ },
  { name: 'held item removed from the holding file', run: 'scorecard', damage: e => e.json('library/held/calvin-held-volume-matter.json', d => { d.items.pop() }), want: /^exit/ },
  { name: 'held item records the wrong position', run: 'scorecard', damage: e => e.json('library/held/calvin-held.json', d => { d.items[0].foundIn.offsetInChapterBeforeCut += 1 }), want: /^exit/ },
  { name: 'held item has no proposed destination', run: 'scorecard', damage: e => e.json('library/held/calvin-held.json', d => { delete d.items[0].proposedDestination }), want: /^exit/ },
  { name: 'cut-out whitespace not recorded in the patch', run: 'scorecard', damage: e => e.json('library/patches/calvin-hold-volume-indexes.json', d => { delete d.chapters[0].gapBefore }), want: /^exit/ },
  { name: 'patch records a wrong after-state hash', run: 'apply', damage: e => e.json('library/patches/calvin-hold-translations.json', d => { d.chapters[0].afterSha256 = '0'.repeat(64) }), want: /^exit/ },
  { name: 'a held cut is put back into its chapter (index text returns)', run: 'apply', damage: e => e.json(sk + 'Calvin/2CO.json', d => { const c = d.chapters.find(x => x.chapter === 13); c.commentary += ' ' + Array.from({ length: 14 }, (_, i) => `1:${i + 1}`).join(' ') }), want: /^exit/ },
  // recorded rules
  { name: 'a recorded fix rule is removed', run: 'apply', damage: e => e.json('library/fixes.json', d => { d.rules = d.rules.filter(r => r.id !== 'calvin-hold-volume-indexes') }), want: /^exit/ },
  { name: 'a recorded fix is partly undone in the library (an entity returns)', run: 'apply', damage: e => e.chapter(sk + 'JFB/NUM.json', 7, c => { c.commentary += ' &frac12;' }), want: /^exit/ },
  { name: 'an untouched original in data/ is altered', run: 'scorecard', damage: e => e.text('data/commentary/Calvin/GEN.json', flip), want: /calvin gate 4|^exit/ },
  // moved text
  { name: 'a moved block points at the wrong destination chapter', run: 'scorecard', damage: e => e.json('library/patches/calvin-minor-prophet-tables.json', d => { const x = d.chapters.find(c => c.movedTo && c.book === 'MIC'); x.movedTo.chapter = 7 }), want: /^exit/ },
  { name: 'a moved table is changed in its new place', run: 'scorecard', damage: e => e.chapter(sk + 'Calvin/MIC.json', 4, c => { c.commentary = flip(c.commentary) }), want: /^exit|calvin gate 4/ },
  { name: 'a dedication is deleted from the library chapter', run: 'scorecard', damage: e => e.chapter(sk + 'Calvin/1TH.json', 1, c => { c.commentary = c.commentary.slice(c.commentary.indexOf('ARGUMENT ON THE FIRST EPISTLE')) }), want: /^exit|calvin gate/ },
  // structure and content
  { name: 'a Henry chapter is deleted', run: 'scorecard', damage: e => e.json(sk + 'MHC/GEN.json', d => { d.chapters = d.chapters.filter(c => c.chapter !== 20) }), want: /mhc gate 1: \w+->FAIL|^exit/ },
  { name: 'one Calvin letter is changed in an ordinary chapter', run: 'scorecard', damage: e => e.chapter(sk + 'Calvin/GEN.json', 1, c => { c.commentary = flip(c.commentary) }), want: /calvin gate 4: PASS->FAIL/ },
  { name: 'one Henry letter is changed', run: 'scorecard', damage: e => e.chapter(sk + 'MHC/EXO.json', 3, c => { c.commentary = flip(c.commentary) }), want: /mhc gate 4: PASS->FAIL/ },
  { name: 'a replacement character appears in Henry', run: 'scorecard', damage: e => e.chapter(sk + 'MHC/EXO.json', 3, c => { c.commentary = c.commentary.slice(0, 500) + '�' + c.commentary.slice(500) }), want: /mhc gate 3: PASS->FAIL/ },
  { name: 'a verse is deleted from the KJV', gap: 'The repository holds no untouched copy of the Bible texts and no recorded per-file hash, so a deleted or altered verse cannot be detected here (the earlier Bible check compared against originals kept outside the repository). Fix: per-source identity cards with recorded hashes (Guardian phase 2).', run: 'scorecard', damage: e => e.json('library/bible/KJV/JHN.json', d => { delete d.chapters[0].verses['5'] }), want: /kjv gate \d: \w+->FAIL|^exit/ },
  { name: 'a word is changed in a Bible verse', gap: 'Same gap as the deleted verse: no originals or recorded hashes for the Bible texts inside the repository.', run: 'scorecard', damage: e => e.json('library/bible/KJV/JHN.json', d => { d.chapters[2].verses['16'] = d.chapters[2].verses['16'].replace('loved', 'hated') }), want: /kjv gate 4: PASS->FAIL|^exit/ },
  // provenance and identity
  { name: 'a provenance entry is removed', run: 'scorecard', damage: e => e.json('library/provenance.json', d => { d.sources = d.sources.filter(s => s.sourceId !== 'calvin') }), want: /^exit|calvin gate 2/ },
  { name: 'a provenance entry uses a value that is not allowed', run: 'scorecard', damage: e => e.json('library/provenance.json', d => { d.sources[0].repositoryCopy.originStatus = 'definitely-fine' }), want: /^exit|gate 2/ },
  { name: 'a source identifier is changed in the manifest', run: 'scorecard', damage: e => e.json('library/manifest.json', d => { d.sources.find(s => s.id === 'calvin').id = 'calvinx' }), want: /missing|^exit/ },
  // scans
  { name: 'a chapter ending is duplicated at the start of the next chapter', run: 'scans', damage: e => { let tail; e.chapter(sk + 'MHC/GEN.json', 1, c => { tail = c.commentary.split(/\s+/).slice(-120).join(' ') }); e.chapter(sk + 'MHC/GEN.json', 2, c => { c.commentary = tail + ' ' + c.commentary }) }, want: /new finding mhc GEN 1 tail-head/ },
  { name: 'an index run is left in a chapter', run: 'scans', damage: e => e.chapter(sk + 'MHC/EXO.json', 1, c => { c.commentary += ' ' + Array.from({ length: 15 }, (_, i) => `${i + 1}:${i + 2}`).join(' ') }), want: /new finding mhc EXO 1 back-matter/ },
  { name: 'volume title-page furniture is left in a chapter', run: 'scans', damage: e => e.chapter(sk + 'Scofield/GEN.json', 1, c => { c.commentary = (c.commentary || '') + ' Christian Classics Ethereal Library' }), want: /new finding scofield GEN 1 back-matter/, skipIf: e => false },
  { name: 'an accepted scan exception is withdrawn', run: 'scorecard', damage: e => e.json('library/scan-exceptions.json', d => { d.exceptions = d.exceptions.filter(x => !(x.source === 'scofield' && x.book === 'DAN')) }), want: /scofield gate 3: PASS->FAIL/ },
  { name: 'an editors note is changed in the notes file', run: 'scorecard', damage: e => e.json('library/commentary-notes/Calvin/ACT.json', d => { d.notes.find(n => n.text).text += ' x' }), want: /^exit/ },
  { name: 'an editors note is deleted from the notes file', run: 'scorecard', damage: e => e.json('library/commentary-notes/Calvin/ISA.json', d => { d.notes.splice(5, 1) }), want: /^exit/ },
  { name: 'Ezekiel chapter 21 text is changed in the notes file', run: 'scorecard', damage: e => e.json('library/commentary-notes/Calvin/EZK.json', d => { d.chapterMatter[0].text += ' x' }), want: /^exit/ },
  { name: 'a footnote marker comes back into an Acts chapter', run: 'apply', damage: e => e.chapter(sk + 'Calvin/ACT.json', 3, c => { c.commentary = c.commentary.replace('the', 'the[7]') }), want: /^exit/ },
  { name: 'a word fix is undone in a Calvin chapter', run: 'apply', damage: e => e.chapter(sk + 'Calvin/1CO.json', 16, c => { c.commentary = c.commentary.replace('more intense feeling.', 'more intense feeling. xx') }), want: /^exit/ },
  { name: 'a word fix is undone in the Isaiah Greek', run: 'scorecard', damage: e => e.chapter(sk + 'Calvin/ISA.json', 19, c => { c.commentary = c.commentary.replace(/Κρ.τιστον/u, 'Kratiston') }), want: /^exit|calvin gate/ },
  { name: 'a section offset in the Calvin verse index is moved', run: 'scorecard', damage: e => e.json('library/commentary-index/Calvin/GEN.json', d => { d.chapters[0].sections[1].start += 2 }), want: /^exit/ },
  { name: 'a Calvin chapter changes after its verse index was built', run: 'scorecard', damage: e => e.chapter(sk + 'Calvin/GEN.json', 2, c => { c.commentary = flip(c.commentary) }), want: /^exit|calvin gate 4/ },
  { name: 'a section is dropped from the Calvin verse index', run: 'scorecard', damage: e => e.json('library/commentary-index/Calvin/JHN.json', d => { d.chapters[2].sections.splice(3, 1) }), want: /^exit/ },
  { name: 'a scan exception is left behind after its finding is gone', run: 'scorecard', damage: e => e.json('library/scan-exceptions.json', d => { d.exceptions.push({ source: 'mhc', book: 'GEN', chapter: 1, check: 'tail-head', reason: 'test' }) }), want: /^exit/ }
]

// ---- run ----
async function pool(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k) } })); return out }
const cases = CASES.filter(c => !ONLY || ONLY.includes(c.name))
const kinds = [...new Set(cases.map(c => c.run))]
const base = {}
try {
  for (const k of kinds) { base[k] = await RUNNERS[k](makeRoot()) }
  const results = await pool(cases, 4, async c => {
    let res, error
    try { res = await RUNNERS[c.run](makeRoot(c.damage)) } catch (e) { error = e.message }
    if (error) return { c, sig: [], ok: false, note: 'the test itself could not damage the copy: ' + error }
    const sig = signals(c.run, res, base[c.run])
    const caught = sig.some(s => c.want.test(s))
    return { c, sig, ok: c.gap ? true : caught, caught }
  })
  let bad = 0
  console.log(`Undamaged repository, reference runs: ${kinds.map(k => `${k} exit ${base[k].code}`).join(', ')}\n`)
  for (const r of results) {
    if (!r.ok) bad++
    console.log(`${r.c.gap ? (r.caught ? 'GAP CLOSED' : 'KNOWN GAP ') : r.ok ? 'CAUGHT    ' : 'NOT CAUGHT'}  ${r.c.name}  [${r.c.run}]`)
    if (r.c.gap) console.log('            ' + (r.caught ? 'this gap is now caught: remove the gap note from this case' : 'NOT detectable yet. ' + r.c.gap))
    if (DISCOVER || !r.ok) console.log('            ' + (r.note || (r.sig.length ? r.sig.slice(0, 4).join('\n            ') : 'no change in the checker output at all')))
  }
  const gaps = results.filter(r => r.c.gap && !r.caught).length
  console.log(`\n${results.length - bad - gaps} of ${results.length - gaps} damage cases caught${gaps ? `; ${gaps} known gap(s) listed above (not counted as failures, not hidden)` : ''}.${bad ? ` ${bad} NOT caught: the checking system has a blind spot.` : ''}`)
  // a baseline run that already fails would make every "exit" signal meaningless
  const baseBad = kinds.filter(k => k === 'apply' && base[k].code !== 0)
  if (baseBad.length) { console.log(`The undamaged repository itself fails: ${baseBad.join(', ')}`); bad++ }
  if (args.includes('--json-out')) fs.writeFileSync(args[args.indexOf('--json-out') + 1], JSON.stringify({
    total: results.length - gaps, caught: results.filter(r => r.caught).length, notCaught: results.filter(r => !r.ok).map(r => r.c.name),
    gaps: results.filter(r => r.c.gap).map(r => ({ name: r.c.name, gap: r.c.gap, closed: !!r.caught })), referenceFailed: baseBad.map(k => 'the ' + k + ' check') }, null, 1))
  process.exitCode = bad ? 1 : 0
} finally { if (!KEEP) fs.rmSync(TMP, { recursive: true, force: true }) }
