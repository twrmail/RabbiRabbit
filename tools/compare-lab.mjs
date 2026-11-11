#!/usr/bin/env node
// A/B comparison: production Worker (A) vs experimental lab Worker (B) on ten fixed passages.
// Usage: node compare-lab.mjs --a <production-url> --b <lab-url> [--out dir] [--only 1,3] [--audience general] [--translation web]
// Produces per passage: A.md, B.md, B-trace.json, metrics.json ; and overall: summary.md (data), blind.md (side-by-side with X/Y order shuffled), key.json (which is which).
// Measures CONTRACTS and QUOTE FIDELITY, not prose quality. Reading blind.md is the quality judgement, and it is yours.
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d }
const A = opt('a'), B = opt('b'), OUT = opt('out', 'compare-out'), AUD = opt('audience', 'general'), TR = opt('translation', 'web')
const ONLY = opt('only') ? opt('only').split(',').map(Number) : null
if (!A || !B) { console.error('need --a and --b'); process.exit(2) }

const PASSAGES = [
  'Romans 8:28', 'Job 1:6-12', 'Genesis 1:1', 'Psalm 23:1-4', 'John 1:1-5',
  'Philippians 2:5-8', 'Matthew 22:15-22', 'Romans 8:29-30',
  'Jeremiah 15:16-17',   // uneven coverage across sources
  '2 John 1:6',          // a source (Calvin) returns nothing
]

const norm = t => String(t).toLowerCase().replace(/[“”„"]/g, '').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim()
const words = t => norm(t).split(' ').filter(Boolean)
function shingles(ws, n = 4) { const s = new Set(); for (let i = 0; i + n <= ws.length; i++) s.add(ws.slice(i, i + n).join(' ')); return s }

async function run(url, body) {
  const t0 = Date.now()
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const text = await res.text()
  return { status: res.status, ms: Date.now() - t0, text, version: res.headers.get('x-worker-version') || 'NOT EXPOSED' }
}

function parseBlocks(study) {
  const blocks = []
  const re = />>(SCRIPTURE|COMMENTARY)\n([\s\S]*?)\n>>END/g
  let m
  while ((m = re.exec(study))) {
    const kind = m[1], inner = m[2]
    const name = (inner.match(/\*\*([^*\n]+)\*\*/) || [])[1] || ''
    const quoted = kind === 'COMMENTARY' ? inner.replace(/^\*\*[^\n]*\n/, '').replace(/^\*\[[^\n]*\]\*\n/, '') : inner.replace(/\n\*\*[^\n]*\*\*\s*$/, '')
    blocks.push({ kind, name, quoted })
  }
  const opens = (study.match(/>>(?:SCRIPTURE|COMMENTARY)/g) || []).length
  return { blocks, opens, closes: blocks.length }
}

function contract(study) {
  const c = {}
  c.rabbiRoad = /Rabbi Road/.test(study)
  c.overTheHill = /Over the Hill/.test(study)
  c.trail = /The trail leads there\./.test(study)
  c.footer = /Sources Consulted/.test(study)
  const pb = parseBlocks(study)
  c.blocksClosed = pb.opens === pb.closes
  return { c, pb }
}

// fidelity of each commentary block against the full candidate text of the same source (taken from the lab trace)
function fidelity(pb, candidates) {
  const out = []
  for (const b of pb.blocks.filter(b => b.kind === 'COMMENTARY')) {
    const lastName = b.name.split(' ').slice(-1)[0].toLowerCase()
    const cand = candidates.find(c => c.name.toLowerCase().includes(lastName) || c.label.toLowerCase().includes(lastName))
    if (!cand) { out.push({ name: b.name, result: 'NO SOURCE TEXT TO CHECK', pct: null }); continue }
    const sw = shingles(words(cand.text)), qw = words(b.quoted)
    const qs = shingles(qw)
    if (!qs.size) { out.push({ name: b.name, result: 'TOO SHORT', pct: null }); continue }
    let hit = 0; for (const s of qs) if (sw.has(s)) hit++
    const pct = Math.round(100 * hit / qs.size)
    out.push({ name: b.name, words: qw.length, pct, result: pct === 100 ? 'VERBATIM' : pct >= 90 ? 'NEAR (a few words differ or joined)' : pct >= 70 ? 'PARTIAL (splice or paraphrase)' : 'NOT FROM SOURCE' })
  }
  return out
}

fs.mkdirSync(OUT, { recursive: true })
const rows = [], key = {}, blind = []
for (let i = 0; i < PASSAGES.length; i++) {
  if (ONLY && !ONLY.includes(i + 1)) continue
  const p = PASSAGES[i], slug = String(i + 1).padStart(2, '0') + '-' + p.replace(/[^A-Za-z0-9]+/g, '_')
  const dir = path.join(OUT, slug); fs.mkdirSync(dir, { recursive: true })
  const body = { studyType: 'passage', primaryInput: p, audience: AUD, translation: TR }
  process.stderr.write(`[${i + 1}/10] ${p} ... `)
  let a, b
  try { a = await run(A, body) } catch (e) { a = { status: 0, ms: 0, text: '', version: 'ERROR ' + e.message } }
  try { b = await run(B, { ...body, debug: true }) } catch (e) { b = { status: 0, ms: 0, text: '', version: 'ERROR ' + e.message } }
  let bj = null; try { bj = JSON.parse(b.text) } catch {}
  const aStudy = a.text, bStudy = bj ? bj.study : b.text, trace = bj ? bj.trace : null
  fs.writeFileSync(path.join(dir, 'A.md'), aStudy); fs.writeFileSync(path.join(dir, 'B.md'), bStudy)
  if (trace) fs.writeFileSync(path.join(dir, 'B-trace.json'), JSON.stringify(trace, null, 1))
  const ca = contract(aStudy), cb = contract(bStudy)
  const cands = trace ? trace.candidates : []
  const fa = fidelity(ca.pb, cands), fb = fidelity(cb.pb, cands)
  const summ = f => ({ blocks: f.length, verbatim: f.filter(x => x.result === 'VERBATIM').length, near: f.filter(x => x.result.startsWith('NEAR')).length, partial: f.filter(x => x.result.startsWith('PARTIAL')).length, notFromSource: f.filter(x => x.result === 'NOT FROM SOURCE').length, unchecked: f.filter(x => x.pct === null).length })
  const m = {
    passage: p, A: { status: a.status, version: a.version, seconds: +(a.ms / 1000).toFixed(1), words: words(aStudy).length, contract: ca.c, fidelity: fa, fidelitySummary: summ(fa) },
    B: { status: b.status, version: b.version, seconds: +(b.ms / 1000).toFixed(1), words: words(bStudy).length, contract: cb.c, fidelity: fb, fidelitySummary: summ(fb),
      cost: trace ? trace.cost : null, selected: trace ? trace.selections.map(s => `${s.name} ${s.start}-${s.end} (${s.confidence})`) : [], notSelected: trace ? trace.notSelected : [], slotProblems: trace ? trace.slotProblems : [], fallbacks: trace ? trace.fallbacks : [], candidatesRetrieved: cands.map(c => `${c.name}:${c.chars}`) },
  }
  fs.writeFileSync(path.join(dir, 'metrics.json'), JSON.stringify(m, null, 1))
  rows.push(m)
  const swap = Math.random() < 0.5
  key[p] = swap ? { X: 'B (lab)', Y: 'A (production)' } : { X: 'A (production)', Y: 'B (lab)' }
  blind.push(`\n\n# ${i + 1}. ${p}\n\n## Study X\n\n${swap ? bStudy : aStudy}\n\n## Study Y\n\n${swap ? aStudy : bStudy}\n\n**Which would you hand to someone leading a Bible study? X / Y / neither. Why? Anything wrong, irrelevant, or misleading in either?**`)
  process.stderr.write(`A ${a.status} ${m.A.seconds}s | B ${b.status} ${m.B.seconds}s\n`)
}
fs.writeFileSync(path.join(OUT, 'blind.md'), '# Blind comparison. Do not open key.json until you have chosen.\n' + blind.join('\n---'))
fs.writeFileSync(path.join(OUT, 'key.json'), JSON.stringify(key, null, 1))

const f = x => `${x.verbatim}/${x.blocks} verbatim${x.near ? `, ${x.near} near` : ''}${x.partial ? `, ${x.partial} partial` : ''}${x.notFromSource ? `, ${x.notFromSource} NOT FROM SOURCE` : ''}${x.unchecked ? `, ${x.unchecked} unchecked` : ''}`
const ok = c => Object.values(c).every(Boolean) ? 'ok' : 'MISSING: ' + Object.entries(c).filter(([, v]) => !v).map(([k]) => k).join(',')
let md = `# A/B summary (A = production ${rows[0]?.A.version}, B = lab ${rows[0]?.B.version})\nAudience ${AUD}, translation ${TR}. Run ${new Date().toISOString()}.\n\nThis measures contracts and quote fidelity. It does NOT judge relevance or readability: read blind.md for that.\nFidelity compares each commentary block with the full candidate text the lab retrieved for that source (the lab reads larger spans than production, so a production block that is verbatim from a longer passage is still verbatim).\n\n| # | Passage | A time | A contract | A quote fidelity | B time | B contract | B quote fidelity | B cost | B slot problems | B sources shown / not selected |\n|---|---|---|---|---|---|---|---|---|---|---|\n`
rows.forEach((r, i) => { md += `| ${i + 1} | ${r.passage} | ${r.A.seconds}s | ${ok(r.A.contract)} | ${f(r.A.fidelitySummary)} | ${r.B.seconds}s | ${ok(r.B.contract)} | ${f(r.B.fidelitySummary)} | $${r.B.cost ? r.B.cost.usd : '?'} | ${r.B.slotProblems.length}${r.B.fallbacks.length ? ` (${r.B.fallbacks.length} fallback)` : ''} | ${r.B.selected.length} / ${r.B.notSelected.length} |\n` })
md += `\n## What the lab selected and rejected\n`
rows.forEach(r => { md += `\n### ${r.passage}\nRetrieved: ${r.B.candidatesRetrieved.join(', ') || 'none'}\nSelected: ${r.B.selected.join('; ') || 'none'}\nNot selected: ${r.B.notSelected.map(n => `${n.name} (${n.reason})`).join('; ') || 'none'}\n` })
fs.writeFileSync(path.join(OUT, 'summary.md'), md)
console.log(md.split('\n').slice(0, 20).join('\n'))
const bad = rows.some(r => r.B.status !== 200 || r.A.status !== 200)
process.exit(bad ? 1 : 0)
