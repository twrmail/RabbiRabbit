// Source identity cards. One small file per source in library/identity/ recording exactly which files make up the source, their sizes and sha256
// hashes, and simple structure counts, plus the recorded fixes that apply to it and how the card was established.
// Why: the other checks ask "does the library equal the originals plus the recorded fixes?". A card adds a fixed reference for "is this the
// source we approved?": any file that appears, disappears or changes without the card being deliberately regenerated (a visible change in the
// pull request) is reported. A card never blesses a source by itself: its `basis` is "verified" only if the scorecard shows the Preserved gate
// (library equals the original plus recorded fixes) as PASS when the card is written; otherwise it is "provisional".
// Cards say nothing about whether the published work is complete, or where the original copy came from: both are listed as not established.
//
// Usage (from the repo root):
//   node tools/identity-cards.mjs                       check: compare the library with the cards (read-only). Exit 1 on any drift.
//   node tools/identity-cards.mjs --json                the same, as JSON
//   --root <folder>                                     work on another copy of the repository (used by the damage tests)
//   node tools/identity-cards.mjs --write --scorecard scorecard.json    (re)write the cards. Only run this on a library that passes `apply-library-fixes --check`.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const REPO = args.includes('--root') ? path.resolve(args[args.indexOf('--root') + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WRITE = args.includes('--write'), JSONOUT = args.includes('--json')
const scFile = args.includes('--scorecard') ? args[args.indexOf('--scorecard') + 1] : null
const readJSON = f => JSON.parse(fs.readFileSync(f, 'utf8'))
const sha = b => crypto.createHash('sha256').update(b).digest('hex')
const manifest = readJSON(path.join(REPO, 'library/manifest.json'))
const fixes = fs.existsSync(path.join(REPO, 'library/fixes.json')) ? readJSON(path.join(REPO, 'library/fixes.json')) : { rules: [] }
const prov = fs.existsSync(path.join(REPO, 'library/provenance.json')) ? readJSON(path.join(REPO, 'library/provenance.json')) : { sources: [] }
const cardDir = path.join(REPO, 'library/identity')

function listFiles(p) {
  const abs = path.join(REPO, p)
  if (!fs.existsSync(abs)) return []
  if (fs.statSync(abs).isFile()) return [p]
  const out = []
  for (const e of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) out.push(...(e.isDirectory() ? listFiles(path.join(p, e.name)) : [path.join(p, e.name)]))
  return out
}
const lineFor = rel => { const b = fs.readFileSync(path.join(REPO, rel)); return `${rel} ${sha(b)} ${b.length}` }
function structure(files) {
  const st = { files: files.length, jsonFiles: 0, chapters: 0, strings: 0, chars: 0 }
  const walk = v => { if (typeof v === 'string') { st.strings++; st.chars += v.length } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk) }
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    let d; try { d = readJSON(path.join(REPO, f)) } catch { continue }
    st.jsonFiles++
    if (d && d.chapters) st.chapters += Array.isArray(d.chapters) ? d.chapters.length : Object.keys(d.chapters).length
    walk(d)
  }
  return st
}
function build(src) {
  const files = listFiles(src.folder), lines = files.map(lineFor)
  return { files, lines, treeSha256: sha(lines.join('\n')) }
}
const rulesFor = id => fixes.rules.filter(r => r.source === id).map(r => ({ id: r.id, op: r.op, patchFile: r.patchFile || null, patchSha256: r.patchFile && fs.existsSync(path.join(REPO, r.patchFile)) ? sha(fs.readFileSync(path.join(REPO, r.patchFile))) : null }))

if (WRITE) {
  const sc = scFile ? readJSON(scFile) : null, gate4 = id => { const s = sc && sc.sources.find(x => x.id === id); return s ? s.gates[4][0] : null }
  fs.mkdirSync(cardDir, { recursive: true })
  const summary = []
  for (const src of manifest.sources) {
    const { files, lines, treeSha256 } = build(src)
    if (!files.length) { summary.push(`${src.id}: no files at ${src.folder}, no card written`); continue }
    const g4 = gate4(src.id), verified = g4 === 'PASS'
    const pv = (prov.sources || []).find(p => p.sourceId === src.id)
    const card = {
      schema: 'rabbirabbit-identity/1', sourceId: src.id, displayName: src.displayName || src.id, folder: src.folder,
      basis: { state: verified ? 'verified' : 'provisional', preservedGate: g4 || 'not supplied',
        meaning: verified ? 'Established when the scorecard showed the library equal to the original plus the recorded fixes (Preserved gate PASS) and every recorded fix applied.' : 'The library was NOT shown equal to the original plus the recorded fixes (Preserved gate was not PASS, or no scorecard was supplied): the card records what the files are today, which is not an approval.' },
      fileSet: { count: files.length, treeSha256, files: lines },
      structure: structure(files),
      recordedFixes: rulesFor(src.id),
      notEstablished: ['whether the published work is complete (see library/evidence/external-coverage.json for outside comparisons)', `where the original copy came from (provenance origin status: ${pv ? pv.repositoryCopy.originStatus : 'not recorded'})`, 'licence (see library/provenance.json)']
    }
    fs.writeFileSync(path.join(cardDir, src.id + '.json'), JSON.stringify(card, null, 1) + '\n')
    summary.push(`${src.id}: ${verified ? 'verified' : 'provisional'} card, ${files.length} file(s)`)
  }
  console.log(summary.join('\n'))
  process.exit(0)
}

// ---- check ----
const results = []
for (const src of manifest.sources) {
  const f = path.join(cardDir, src.id + '.json')
  const { files, lines, treeSha256 } = build(src)
  if (!fs.existsSync(f)) { results.push({ id: src.id, status: files.length ? 'UNKNOWN' : 'N/A', basis: null, problems: files.length ? ['no identity card yet'] : ['no files'] }); continue }
  const card = readJSON(f), problems = []
  if (card.fileSet.treeSha256 !== treeSha256 || card.fileSet.count !== files.length) {
    const was = new Map(card.fileSet.files.map(l => { const p = l.split(' '); return [p[0], p[1]] })), now = new Map(lines.map(l => { const p = l.split(' '); return [p[0], p[1]] }))
    for (const [k, h] of was) { if (!now.has(k)) problems.push(`file missing: ${k}`); else if (now.get(k) !== h) problems.push(`file changed: ${k}`) }
    for (const k of now.keys()) if (!was.has(k)) problems.push(`unexpected new file: ${k}`)
    if (!problems.length) problems.push('the card records a file list that does not match its own tree hash')
  }
  if (sha(card.fileSet.files.join('\n')) !== card.fileSet.treeSha256) problems.push('the card has been edited: its file list does not match its own tree hash')
  const ruleNow = JSON.stringify(rulesFor(src.id)), ruleCard = JSON.stringify(card.recordedFixes)
  if (ruleNow !== ruleCard) problems.push('the recorded fixes for this source (library/fixes.json or their patch files) differ from the card')
  if (problems.length) { const st = structure(files); for (const k of Object.keys(card.structure)) if (card.structure[k] !== st[k]) problems.push(`${k}: card ${card.structure[k]}, now ${st[k]}`) }
  results.push({ id: src.id, status: problems.length ? 'FAIL' : 'PASS', basis: card.basis.state, problems })
}
if (JSONOUT) console.log(JSON.stringify({ results }, null, 1))
else {
  for (const r of results) console.log(`${r.status.padEnd(7)} ${r.id}${r.basis ? ` (${r.basis} card)` : ''}${r.problems.length && r.status !== 'PASS' ? ': ' + r.problems.slice(0, 4).join('; ') + (r.problems.length > 4 ? `; and ${r.problems.length - 4} more` : '') : ''}`)
  const bad = results.filter(r => r.status === 'FAIL').length
  console.log(`\n${results.filter(r => r.status === 'PASS').length} of ${results.length} sources match their identity card; ${bad} drifted; ${results.filter(r => r.status === 'UNKNOWN').length} have no card yet.`)
}
process.exit(results.some(r => r.status === 'FAIL') ? 1 : 0)
