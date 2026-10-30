// Applies library/fixes.json to library/ (the recorded, counted text fixes). DRY RUN by default; --write to change files.
// Usage from the repo root:  node apply-library-fixes.mjs .            (report only)
//                            node apply-library-fixes.mjs . --write    (writes library files; refuses unless every count equals expectedCount)
// Never touches data/. Idempotent: a rule that is already applied reports 0 changes and is not an error.
import fs from 'node:fs'
import path from 'node:path'
const [, , root = '.', flag] = process.argv
const write = flag === '--write'
const check = flag === '--check'   // CI mode: exit 1 unless every rule is already applied
const fixes = JSON.parse(fs.readFileSync(path.join(root, 'library', 'fixes.json'), 'utf8'))
const walk = (o, fn) => Array.isArray(o) ? o.map(v => walk(v, fn)) : (o && typeof o === 'object') ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, walk(v, fn)])) : (typeof o === 'string' ? fn(o) : o)
const results = []
let abort = false
for (const rule of fixes.rules) {
  const counts = {}, pending = []
  for (const code of rule.files) {
    const file = path.join(root, rule.folder, code + '.json')
    const raw = fs.readFileSync(file, 'utf8'), d = JSON.parse(raw)
    const bump = k => { counts[k] = (counts[k] || 0) + 1 }
    let nd = d
    if (rule.op === 'strip-leading') {
      const re = new RegExp('^\\s*' + rule.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*')
      nd = { ...d, chapters: d.chapters.map(ch => ({ ...ch, [rule.target]: Object.fromEntries(Object.entries(ch[rule.target]).map(([k, t]) => { if (re.test(t)) { bump(rule.find); return [k, t.replace(re, '')] } return [k, t] })) })) }
    } else if (rule.op === 'replace-all') {
      nd = { ...d, [rule.target]: walk(d[rule.target], s => { let o = s; for (const [a, b] of rule.pairs) { const n = o.split(a).length - 1; if (n) { for (let i = 0; i < n; i++) bump(a); o = o.split(a).join(b) } } return o }) }
    } else throw new Error('unknown op ' + rule.op)
    pending.push({ file, out: JSON.stringify(nd) })
  }
  const exp = typeof rule.expectedCount === 'number' ? { [rule.find]: rule.expectedCount } : rule.expectedCount
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const alreadyApplied = total === 0
  const matches = Object.keys(exp).every(k => (counts[k] || 0) === exp[k]) && Object.keys(counts).every(k => k in exp)
  results.push({ id: rule.id, counts, expected: exp, status: alreadyApplied ? 'already applied (0 changes)' : matches ? 'counts match expected' : 'COUNT MISMATCH' })
  if (!alreadyApplied && !matches) abort = true
  rule._pending = pending; rule._apply = !alreadyApplied && matches
}
for (const r of results) console.log(`${r.id}: ${r.status}; changes ${JSON.stringify(r.counts)}; expected ${JSON.stringify(r.expected)}`)
if (abort) { console.log('ABORT: a count differs from expectedCount; nothing written.'); process.exit(1) }
if (check) { const notApplied = results.filter(r => !r.status.startsWith('already')); if (notApplied.length) { console.log('CHECK FAILED: rules not yet applied to library/: ' + notApplied.map(r => r.id).join(', ')); process.exit(1) } console.log('CHECK OK: every recorded fix is applied.'); process.exit(0) }
if (!write) { console.log('Dry run: nothing written. Add --write to apply.'); process.exit(0) }
for (const rule of fixes.rules) if (rule._apply) for (const p of rule._pending) { fs.writeFileSync(p.file, p.out); console.log('wrote', p.file) }
console.log('Done. Re-run without --write: every rule should now say "already applied (0 changes)".')