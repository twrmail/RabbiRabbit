// Fails only if a gate got WORSE than the baseline (PASS/N/A > UNKNOWN > FAIL), or a baseline source disappeared.
// Usage: node check-scorecard-baseline.mjs scorecard.json library-baseline.json         (compare)
//        node check-scorecard-baseline.mjs scorecard.json library-baseline.json --write (record today's states as the new baseline)
// Writes a table to the GitHub run summary when GITHUB_STEP_SUMMARY is set. Never edits data or library files.
import fs from 'node:fs'
const [, , scFile, baseFile, flag] = process.argv
const sc = JSON.parse(fs.readFileSync(scFile, 'utf8'))
const now = Object.fromEntries(sc.sources.map(s => [s.id, Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(i => [i, s.gates[i][0]]))]))
if (flag === '--write') { fs.writeFileSync(baseFile, JSON.stringify({ recordedFrom: sc.sourceSnapshot, gates: now }, null, 1)); console.log('baseline written:', baseFile); process.exit(0) }
const base = JSON.parse(fs.readFileSync(baseFile, 'utf8')).gates
const rank = { PASS: 3, 'N/A': 3, UNKNOWN: 2, FAIL: 1 }
const rows = [], worse = []
for (const id of Object.keys(base)) {
  if (!now[id]) { worse.push(`${id}: source missing`); rows.push(`| ${id} | all | present | MISSING | WORSE |`); continue }
  for (const i of [1, 2, 3, 4, 5, 6, 7]) {
    const b = base[id][i], n = now[id][i]
    if (b === n) continue
    const st = rank[n] < rank[b] ? 'WORSE' : 'better (update baseline)'
    if (st === 'WORSE') worse.push(`${id} gate ${i}: ${b} -> ${n}`)
    rows.push(`| ${id} | ${i} | ${b} | ${n} | ${st} |`)
  }
}
for (const id of Object.keys(now)) if (!base[id]) rows.push(`| ${id} | all | (not in baseline) | new source | info |`)
const md = '## Library scorecard check\n\n' + (rows.length ? '| source | gate | baseline | now | status |\n|---|---|---|---|---|\n' + rows.join('\n') : 'No gate changed from the baseline.') + '\n\n' + (worse.length ? '**FAILED: ' + worse.join('; ') + '**' : 'No gate is worse than the baseline.') + '\n'
console.log(md)
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md)
process.exit(worse.length ? 1 : 0)