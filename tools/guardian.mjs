// RabbiRabbit Repository Guardian: a thin, READ-ONLY orchestrator. It runs the repository's existing checks, collects what they say, and writes
// one report that a person can read (audit.md) and a machine can read (audit.json). It defines no checks of its own: the scorecard stays the single
// definition of what a gate means. It never edits sources, the library, repair rules or exceptions; it writes only into the report folder.
//
// Usage (from the repo root):   node tools/guardian.mjs [--out audit-report] [--quick]
//   --quick   skip the damage tests (about 3 minutes); the report then says NOT RUN for them, it never says PASS.
// Exit code: 0 every required check passed; 1 something failed; 2 a required check could not run.
//
// Statuses: PASS, FAIL, WARN (passed, but with accepted exceptions or witness-only evidence), UNKNOWN (no evidence yet), NOT RUN (did not run or
// did not finish), N/A (the gate does not apply). A check that crashes is NOT RUN, never PASS. UNKNOWN and N/A are never promoted to PASS.
//
// audit.json schema "rabbirabbit-audit/1":
//   { schema, generatedAt, repo:{commit, dirty, recentCommits[]}, node, tools:{path:sha256}, quick,
//     verdict:{repositoryChecks, checkerReliability, sourceVerification:{fullyVerified, sources}},
//     checks:[{id, title, status, summary, detail[], ms}], changedSinceBaseline:[{source, gate, from, to, status}],
//     needsHumanJudgment:[{kind, id, source?, note}], externalEvidence:[...], sources:[{id, name, scope, status, dimensions:{...}, notes[]}] }
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2), QUICK = args.includes('--quick')
const OUT = path.resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : path.join(REPO, 'audit-report'))
fs.mkdirSync(OUT, { recursive: true })
const rel = p => path.join(REPO, p)
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')
const readJSON = f => JSON.parse(fs.readFileSync(f, 'utf8'))

// ---- running other programs, each in its own process so one crash cannot hide another ----
function run(cmd, argv, { timeoutMs = 900000 } = {}) {
  return new Promise(resolve => {
    const t0 = Date.now()
    let p
    try { p = spawn(cmd, argv, { cwd: REPO }) } catch (e) { return resolve({ code: null, out: '', err: String(e), ms: 0, failedToRun: true }) }
    let out = '', err = '', done = false
    const finish = r => { if (!done) { done = true; clearTimeout(timer); resolve({ ms: Date.now() - t0, out, err, ...r }) } }
    const timer = setTimeout(() => { p.kill('SIGKILL'); finish({ code: null, failedToRun: true, err: err + '\n(stopped: took longer than ' + Math.round(timeoutMs / 60000) + ' minutes)' }) }, timeoutMs)
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d)
    p.on('error', e => finish({ code: null, failedToRun: true, err: String(e) }))
    p.on('close', (code, sig) => finish({ code, failedToRun: code === null, err: sig ? err + '\n(ended by signal ' + sig + ')' : err }))
  })
}
const node = (script, a, o) => run(process.execPath, [rel(script), ...a], o)
const lastLines = (s, n = 3) => s.trim().split('\n').filter(Boolean).slice(-n).map(l => l.slice(0, 220))
const firstLine = s => (s.trim().split('\n').find(l => l.trim()) || '').slice(0, 220)

const checks = []
const add = c => (checks.push(c), c)

// ---- 1. recorded fixes are applied ----
{
  const r = await node('tools/apply-library-fixes.mjs', ['.', '--check'])
  if (r.failedToRun) add({ id: 'fixes', title: 'Recorded text fixes are all applied', status: 'NOT RUN', summary: 'The check did not finish.', detail: lastLines(r.err), ms: r.ms })
  else if (r.code === 0 && /CHECK OK/.test(r.out)) add({ id: 'fixes', title: 'Recorded text fixes are all applied', status: 'PASS', summary: 'Every rule in library/fixes.json is applied to the library, and every changed chapter matches its recorded result.', detail: lastLines(r.out, 1), ms: r.ms })
  else add({ id: 'fixes', title: 'Recorded text fixes are all applied', status: 'FAIL', summary: 'The library does not match its recorded fixes.', detail: [...lastLines(r.out, 3), ...lastLines(r.err, 2)], ms: r.ms })
}

// ---- 2. the scorecard (the single definition of the seven gates) ----
let card = null
{
  const prefix = path.join(OUT, 'scorecard')
  const r = await node('tools/source-scorecard.mjs', ['library', '--out', prefix])
  if (r.failedToRun) add({ id: 'scorecard', title: 'Source scorecard runs and its validations hold', status: 'NOT RUN', summary: 'The scorecard did not finish.', detail: lastLines(r.err), ms: r.ms })
  else if (r.code !== 0) add({ id: 'scorecard', title: 'Source scorecard runs and its validations hold', status: 'FAIL', summary: 'The scorecard stopped because one of its validations (held material, moved text, provenance register, scan exceptions) found a problem.', detail: lastLines(r.err, 6), ms: r.ms })
  else {
    try { card = readJSON(prefix + '.json'); add({ id: 'scorecard', title: 'Source scorecard runs and its validations hold', status: 'PASS', summary: `Scored ${card.sources.length} sources on seven gates. Held-text, moved-text, provenance-register and scan-exception validations all held. This says the scorecard ran: the gate results are reported below, not summarised as PASS.`, detail: [], ms: r.ms }) }
    catch (e) { add({ id: 'scorecard', title: 'Source scorecard runs and its validations hold', status: 'NOT RUN', summary: 'The scorecard finished but its report could not be read.', detail: [String(e)], ms: r.ms }) }
  }
}

// ---- 3. no gate worse than the approved baseline ----
let changes = []
{
  if (!card) add({ id: 'baseline', title: 'No gate is worse than the approved baseline', status: 'NOT RUN', summary: 'Needs the scorecard result.', detail: [], ms: 0 })
  else if (!fs.existsSync(rel('library-baseline.json'))) add({ id: 'baseline', title: 'No gate is worse than the approved baseline', status: 'NOT RUN', summary: 'library-baseline.json is missing.', detail: [], ms: 0 })
  else {
    const r = await node('tools/check-scorecard-baseline.mjs', [path.join(OUT, 'scorecard.json'), 'library-baseline.json'])
    changes = r.out.split('\n').map(l => l.split('|').map(x => x.trim())).filter(c => c.length >= 7 && c[1] && !/^(source|-+)$/.test(c[1])).map(c => ({ source: c[1], gate: c[2], from: c[3], to: c[4], status: c[5] }))
    if (r.failedToRun) add({ id: 'baseline', title: 'No gate is worse than the approved baseline', status: 'NOT RUN', summary: 'The baseline check did not finish.', detail: lastLines(r.err), ms: r.ms })
    else if (r.code === 0) add({ id: 'baseline', title: 'No gate is worse than the approved baseline', status: 'PASS', summary: 'No gate is worse than the baseline. This is a comparison with the recorded baseline: it does not mean the gates themselves pass (see the source table).', detail: changes.length ? [`${changes.length} gate(s) differ from the baseline (listed under "What changed")`] : [], ms: r.ms })
    else add({ id: 'baseline', title: 'No gate is worse than the approved baseline', status: 'FAIL', summary: 'At least one gate is worse than the baseline.', detail: changes.filter(c => c.status === 'WORSE').map(c => `${c.source} gate ${c.gate}: ${c.from} -> ${c.to}`), ms: r.ms })
  }
}

// ---- 4. boundary and back-matter scans ----
let scan = null
{
  const r = await node('tools/guardian-scans.mjs', ['library', '--json'])
  try { scan = JSON.parse(r.out) } catch { /* handled below */ }
  if (!scan) add({ id: 'scans', title: 'Boundary and back-matter scans', status: 'NOT RUN', summary: 'The scan did not finish.', detail: lastLines(r.err || r.out), ms: r.ms })
  else {
    const open = scan.findings.filter(f => f.check !== 'within-book-copy' && !f.explained), done = scan.findings.filter(f => f.check !== 'within-book-copy' && f.explained)
    const stale = scan.staleExceptions || []
    const status = open.length || stale.length ? 'FAIL' : done.length ? 'WARN' : 'PASS'
    add({ id: 'scans', title: 'Boundary and back-matter scans', status,
      summary: `Scanned ${scan.scanned.length} commentary sources (end of each chapter against the start of the next; CCEL volume furniture; index runs). ${open.length} unexplained finding(s), ${done.length} accepted with a recorded reason (each checked against the untouched original), ${stale.length} stale exception(s).`,
      detail: [...open.map(f => `UNEXPLAINED ${f.source} ${f.book} ${f.chapter}: ${f.check}: ${f.detail}`), ...stale.map(e => `STALE EXCEPTION ${e.source} ${e.book} ${e.chapter}`)], ms: r.ms })
  }
}

// ---- 5. damage tests: do the checkers catch deliberate damage? (kept apart from repository health) ----
let damage = null
if (QUICK) add({ id: 'damage', title: 'Damage tests (do the checkers catch deliberate damage?)', status: 'NOT RUN', summary: 'Skipped because --quick was used. Run without --quick for the full audit.', detail: [], ms: 0 })
else {
  const jf = path.join(OUT, 'damage.json')
  fs.rmSync(jf, { force: true })
  const r = await node('tools/tests/damage-suite.mjs', ['--json-out', jf], { timeoutMs: 1500000 })
  try { damage = readJSON(jf) } catch { /* handled below */ }
  if (!damage) add({ id: 'damage', title: 'Damage tests (do the checkers catch deliberate damage?)', status: 'NOT RUN', summary: 'The damage tests did not finish.', detail: lastLines(r.err || r.out), ms: r.ms })
  else {
    const status = damage.notCaught.length || damage.referenceFailed.length ? 'FAIL' : damage.gaps.some(g => !g.closed) ? 'WARN' : 'PASS'
    add({ id: 'damage', title: 'Damage tests (do the checkers catch deliberate damage?)', status,
      summary: `${damage.caught} of ${damage.total} deliberate damage cases were caught by the checkers.${damage.gaps.length ? ` ${damage.gaps.filter(g => !g.closed).length} known gap(s) not detectable yet.` : ''} This shows the checkers work. It says nothing about whether the sources themselves are complete.`,
      detail: [...damage.notCaught.map(n => `NOT CAUGHT: ${n}`), ...damage.referenceFailed.map(n => `The undamaged repository failed: ${n}`), ...damage.gaps.filter(g => !g.closed).map(g => `KNOWN GAP: ${g.name}: ${g.gap}`)], ms: r.ms })
  }
}

// ---- information gathered from the repository's own records (read only) ----
const fixesDoc = fs.existsSync(rel('library/fixes.json')) ? readJSON(rel('library/fixes.json')) : { rules: [], openIssues: [] }
const prov = fs.existsSync(rel('library/provenance.json')) ? readJSON(rel('library/provenance.json')) : { sources: [] }
const evidence = fs.existsSync(rel('library/evidence/external-coverage.json')) ? readJSON(rel('library/evidence/external-coverage.json')).evidence || [] : []
const heldUnresolved = []
if (fs.existsSync(rel('library/held'))) for (const f of fs.readdirSync(rel('library/held')).filter(x => x.endsWith('.json'))) for (const it of readJSON(rel('library/held/' + f)).items || []) if (it.classification === 'unresolved') heldUnresolved.push(it)

const human = []
for (const o of fixesDoc.openIssues || []) human.push({ kind: 'open issue', id: o.id, source: o.source, note: `${o.location}. ${(o.description || '').slice(0, 200)}` })
for (const p of prov.sources || []) if ((p.openQuestions || []).length) human.push({ kind: 'provenance or licence question', id: p.sourceId, source: p.sourceId, note: `${p.openQuestions.length} open question(s): ${p.openQuestions.map(q => '"' + q + '"').join('; ').slice(0, 300)}` })
for (const it of heldUnresolved) human.push({ kind: 'held text awaiting classification', id: it.id, source: it.source, note: it.description })
for (const e of evidence) if (/awaiting human adjudication/.test(e.result)) human.push({ kind: 'differences awaiting adjudication', id: e.id, source: e.source, note: e.result })

// ---- per-source rows ----
const evBySource = {}; for (const e of evidence) (evBySource[e.source] ||= []).push(e)
const dimNames = [['structure', 1], ['integrity', 3], ['preservation', 4], ['verseCoverage', 5], ['provenance', 2], ['licence', 6], ['regression', 7]]
const sources = []
if (card) for (const s of card.sources) {
  const g = i => s.gates[i][0], dims = {}
  for (const [name, i] of dimNames) dims[name] = g(i)
  const accepted = s.facts && s.facts.scans ? s.facts.scans.explained : 0
  const notes = []
  if (dims.integrity === 'PASS' && accepted) { dims.integrity = 'WARN'; notes.push(`${accepted} accepted scan exception(s) under integrity`) }
  dims.publicationCompleteness = evBySource[s.id] ? 'WARN' : 'UNKNOWN'
  if (evBySource[s.id]) notes.push(`outside comparison on record (${evBySource[s.id].map(e => e.date || 'undated').join(', ')}): a witness, not a certificate`)
  const applicable = [1, 2, 3, 4, 5, 6, 7].map(g).filter(x => x !== 'N/A')
  sources.push({ id: s.id, name: s.name, scope: s.scope, status: s.status, dimensions: dims, fullyVerified: applicable.length > 0 && applicable.every(x => x === 'PASS'), notes })
}
const fullyVerified = sources.filter(s => s.fullyVerified).length

// ---- verdicts (three separate lines, never merged) ----
const rank = c => c.status
const repoChecks = checks.filter(c => c.id !== 'damage')
const repoVerdict = repoChecks.some(c => rank(c) === 'FAIL') ? 'FAIL' : repoChecks.some(c => rank(c) === 'NOT RUN') ? 'INCOMPLETE' : repoChecks.some(c => rank(c) === 'WARN') ? 'PASS WITH ACCEPTED EXCEPTIONS' : 'PASS'
const dmg = checks.find(c => c.id === 'damage')
const dmgVerdict = dmg.status === 'NOT RUN' ? 'NOT RUN' : dmg.status
const tally = {}; for (const s of sources) for (const [, st] of Object.entries(s.dimensions)) tally[st] = (tally[st] || 0) + 1

// ---- reproducibility ----
const git = async a => { const r = await run('git', a); return r.code === 0 ? r.out.trim() : null }
const commit = await git(['rev-parse', 'HEAD']), dirty = (await git(['status', '--porcelain', '--untracked-files=no'])) !== '' && (await git(['status', '--porcelain', '--untracked-files=no'])) !== null
const recent = (await git(['log', '-5', '--format=%h %s'])) || ''
const toolFiles = ['tools/guardian.mjs', 'tools/guardian-scans.mjs', 'tools/source-scorecard.mjs', 'tools/apply-library-fixes.mjs', 'tools/check-scorecard-baseline.mjs', 'tools/tests/damage-suite.mjs', 'library/fixes.json', 'library/manifest.json', 'library/provenance.json', 'library/scan-exceptions.json', 'library/evidence/external-coverage.json', 'library-baseline.json']
const tools = {}; for (const f of toolFiles) if (fs.existsSync(rel(f))) tools[f] = sha(rel(f)).slice(0, 16)
const generatedAt = new Date().toISOString()

const audit = {
  schema: 'rabbirabbit-audit/1', generatedAt, repo: { commit, dirty, recentCommits: recent ? recent.split('\n') : [] }, node: process.version, tools, quick: QUICK,
  verdict: { repositoryChecks: repoVerdict, checkerReliability: dmgVerdict, sourceVerification: { fullyVerified, sources: sources.length, dimensionTally: tally } },
  checks, changedSinceBaseline: changes, needsHumanJudgment: human, externalEvidence: evidence, sources
}
fs.writeFileSync(path.join(OUT, 'audit.json'), JSON.stringify(audit, null, 1))

// ---- audit.md: written for a person, not a programmer ----
const worst = checks.filter(c => c.status === 'FAIL'), unrun = checks.filter(c => c.status === 'NOT RUN')
const unkSources = sources.filter(s => Object.values(s.dimensions).includes('UNKNOWN')).length, failSources = sources.filter(s => Object.values(s.dimensions).includes('FAIL')).length
let md = `# RabbiRabbit repository audit\n\nCommit \`${commit ? commit.slice(0, 10) : 'unknown'}\`${dirty ? ' (with uncommitted changes)' : ''} · ${generatedAt.replace('T', ' ').slice(0, 16)} UTC · ${QUICK ? 'quick run (damage tests skipped)' : 'full run'}\n\n`
md += `## At a glance\n\n| Question | Answer |\n|---|---|\n`
md += `| Are the repository's checks passing? | **${repoVerdict}**. ${repoChecks.map(c => `${c.title.split(' (')[0]}: ${c.status}`).join('; ')}. |\n`
md += `| Do the checkers catch damage? | **${dmgVerdict}**. ${dmg.summary.split(' This ')[0]} |\n`
md += `| Are the sources verified? | **${fullyVerified} of ${sources.length} sources are fully verified.** ${failSources} have at least one failing gate, ${unkSources} have at least one gate with no evidence yet. These are existing conditions, not new problems, and none is counted as PASS. |\n`
md += `| What changed since the baseline? | ${changes.length ? `${changes.filter(c => c.status === 'WORSE').length} worse, ${changes.filter(c => /better/.test(c.status)).length} better, ${changes.filter(c => !/better|WORSE/.test(c.status)).length} other (see below).` : 'No gate differs from the baseline.'} |\n`
md += `| What needs a person? | ${human.length} item(s) (see below). |\n\n`
md += `Three different things are reported separately on purpose: *the checks passing* means the repository's machinery works and nothing got worse; *the damage tests* show the checkers notice corruption; *source verification* is whether each source has been shown complete, clean, preserved, sourced and licensed. A pass on the first two is not a pass on the third.\n\n`
md += `## What failed\n\n${worst.length ? worst.map(c => `- **${c.title}**: ${c.summary}\n${c.detail.map(d => `  - ${d}`).join('\n')}`).join('\n') : 'No repository check failed.'}\n\n`
md += `## What did not run\n\n${unrun.length ? unrun.map(c => `- **${c.title}**: ${c.summary}`).join('\n') : 'Every check ran.'}\n\n`
md += `## What changed since the baseline\n\n${changes.length ? '| source | gate | baseline | now | status |\n|---|---|---|---|---|\n' + changes.map(c => `| ${c.source} | ${c.gate} | ${c.from} | ${c.to} | ${c.status} |`).join('\n') + '\n\n(Gate numbers: 1 Complete, 2 Provenance, 3 Clean, 4 Preserved, 5 Verse coverage, 6 Licence, 7 Regression.)' : 'Nothing: every gate is where the baseline recorded it.'}\n\n`
md += `## The checks in detail\n\n` + checks.map(c => `### ${c.status}: ${c.title}\n${c.summary}\n${c.detail.length ? '\n' + c.detail.map(d => `- ${d}`).join('\n') + '\n' : ''}`).join('\n') + '\n'
md += `## Needs human judgment\n\n${human.length ? human.map(h => `- **${h.kind}** (${h.source || h.id}${h.source ? ': ' + h.id : ''}): ${h.note}`).join('\n') : 'Nothing is waiting for a decision.'}\n\n`
md += `## Sources\n\nColumns: structure (gate 1), integrity (gate 3), preservation (gate 4), verse coverage (gate 5), provenance (gate 2), licence (gate 6), regression (gate 7), and publication completeness (is the whole published work present? UNKNOWN unless outside evidence is on record, and then WARN, never PASS, because an outside copy is a witness and not a master).\n\n`
md += `| Source | Structure | Integrity | Preservation | Verse coverage | Provenance | Licence | Regression | Publication completeness |\n|---|---|---|---|---|---|---|---|---|\n`
for (const s of sources) { const d = s.dimensions; md += `| ${s.name} (${s.id}) | ${d.structure} | ${d.integrity} | ${d.preservation} | ${d.verseCoverage} | ${d.provenance} | ${d.licence} | ${d.regression} | ${d.publicationCompleteness} |\n` }
md += `\nTotals over all sources and dimensions: ${Object.entries(tally).sort().map(([k, v]) => `${v} ${k}`).join(', ')}.\n\n`
md += `## Outside comparisons on record\n\n${evidence.length ? evidence.map(e => `- **${e.source}, ${e.date || 'date not recorded here'}** (${e.witness}): ${e.result} Method: ${e.method} Scope: ${e.scope} Limits: ${e.limitations} Report: \`${e.report}\`.`).join('\n') : 'None recorded.'}\n\n`
md += `## How to reproduce this audit\n\nCommit \`${commit || 'unknown'}\`${dirty ? ' (uncommitted changes present)' : ''}; Node ${process.version}; schema rabbirabbit-audit/1; command \`node tools/guardian.mjs${QUICK ? ' --quick' : ''}\`.\n\nTool and record fingerprints (first 16 characters of sha256):\n\n${Object.entries(tools).map(([f, h]) => `- \`${f}\` ${h}`).join('\n')}\n\nRecent commits:\n\n${recent ? recent.split('\n').map(l => `- ${l}`).join('\n') : '- (not available)'}\n`
fs.writeFileSync(path.join(OUT, 'audit.md'), md)
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.split('## The checks in detail')[0])

console.log(md.split('## The checks in detail')[0])
console.log(`Wrote ${path.join(OUT, 'audit.md')} and ${path.join(OUT, 'audit.json')}`)
process.exit(checks.some(c => c.status === 'FAIL') ? 1 : checks.some(c => c.status === 'NOT RUN' && !(c.id === 'damage' && QUICK)) ? 2 : 0)
