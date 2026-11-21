#!/usr/bin/env node
// Builds Morning Trail day files: morning/days/<verse-id>.json
//   node tools/build-morning-days.mjs [--from YYYY-MM-DD] [--days 30] [--verses GEN-22-8,EXO-14-13-14] [--force] [--blocks 2] [--max-cost 3] [--dry]
// Reads morning/schedule/<year>.json (date -> verse), asks the lab worker's restate pipeline (same prompt, same gates) to put the
// teacher's first blocks in plain English, and stores everything in one JSON per verse. Code prints every quotation: the Scripture and the
// teacher's own words are copied from the library; the AI only supplies the plain-English card, and only if every gate passes.
// Needs ANTHROPIC_API_KEY (repo secret) unless --dry. Library files are read from this checkout, never from the network.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RAWP = 'https://raw.githubusercontent.com/twrmail/RabbiRabbit/main/library/'
const realFetch = globalThis.fetch
globalThis.fetch = async (u, o) => {
  u = String(u)
  if (u.startsWith(RAWP)) {
    const f = path.join(ROOT, 'library', decodeURIComponent(u.slice(RAWP.length)))
    return fs.existsSync(f) ? new Response(fs.readFileSync(f)) : new Response('not found', { status: 404 })
  }
  return realFetch(u, o)
}
const W = await import('./morning/rabbitlab-worker.mjs')

const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) }
const FROM = opt('from', '') || new Date().toISOString().slice(0, 10)
const DAYS = +opt('days', 30)
const ONLY = opt('verses', '') ? String(opt('verses')).split(',').map(s => s.trim()).filter(Boolean) : null
const FORCE = opt('force', false) === true || opt('force', false) === 'true'
const NBLOCKS = +opt('blocks', 2)
const MAX_COST = +opt('max-cost', 3)
const DRY = opt('dry', false) === true
const OUT = path.join(ROOT, opt('out', 'morning/days'))
const env = { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '', RESTATE_MODEL: process.env.RESTATE_MODEL || '' }
if (!DRY && !env.ANTHROPIC_API_KEY) { console.error('No ANTHROPIC_API_KEY set. Add the repo secret, or use --dry.'); process.exit(2) }

const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'))
function idToRef(id) {
  const m = id.match(/^(\w{3})-(\d+)-(\d+)(?:-(\d+))?$/); if (!m) throw new Error('bad verse id ' + id)
  const b = m[1], c = +m[2], v = +m[3], ve = m[4] ? +m[4] : null
  if (!W.BOOK_NAME[b]) throw new Error('unknown book ' + b)
  return { b, c, v, ve, label: `${W.BOOK_NAME[b]} ${c}:${v}${ve ? '-' + ve : ''}` }
}
const bibleCache = {}
function passage(ed, b, c, v, ve) {
  const f = path.join(ROOT, 'library/bible', ed, b + '.json')
  if (!fs.existsSync(f)) return []
  const key = ed + b; bibleCache[key] ||= Object.fromEntries(readJson(f).chapters.map(x => [+x.chapter, x.verses]))
  const ch = bibleCache[key][c] || {}, out = []
  for (let n = v; n <= (ve || v); n++) if (ch[String(n)]) out.push({ n, text: ch[String(n)] })
  return out
}
const xrefCache = {}
function leads(ref) {
  const f = path.join(ROOT, 'library/xref', ref.b + '.json'); if (!fs.existsSync(f)) return []
  xrefCache[ref.b] ||= readJson(f).refs
  const best = new Map()
  for (const r of xrefCache[ref.b]) {
    if (r.fc !== ref.c || r.fv < ref.v || r.fv > (ref.ve || ref.v)) continue
    if (r.tb === ref.b && r.tc === ref.c && Math.abs(r.tv - ref.v) <= 1) continue
    const k = `${r.tb}-${r.tc}-${r.tv}`; if (!best.has(k) || best.get(k).votes < r.v) best.set(k, { b: r.tb, c: r.tc, v: r.tv, votes: r.v })
  }
  return [...best.values()].sort((a, z) => z.votes - a.votes).slice(0, 3).map(x => ({
    ref: `${W.BOOK_NAME[x.b]} ${x.c}:${x.v}`, b: x.b, c: x.c, v: x.v, votes: x.votes, kjv: passage('KJV', x.b, x.c, x.v, null).map(p => p.text).join(' '),
  }))
}

// which verses?
let ids = []
if (ONLY) ids = ONLY
else {
  const start = new Date(FROM + 'T00:00:00Z'); const seen = new Set(); const sched = {}
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(start.getTime() + i * 864e5), iso = d.toISOString().slice(0, 10), y = iso.slice(0, 4)
    sched[y] ||= readJson(path.join(ROOT, 'morning/schedule', y + '.json')).days
    const e = sched[y][iso]; if (!e) { console.warn('no schedule for', iso); continue }
    if (!seen.has(e.verse)) { seen.add(e.verse); ids.push(e.verse) }
  }
}
fs.mkdirSync(OUT, { recursive: true })

const report = []; let spent = 0
for (const id of ids) {
  const file = path.join(OUT, id + '.json')
  if (!FORCE && fs.existsSync(file) && readJson(file).status === 'ok') { report.push({ id, status: 'skipped (already built)' }); continue }
  if (spent >= MAX_COST) { report.push({ id, status: 'not run (cost cap reached)' }); continue }
  const ref = idToRef(id)
  const day = { id, ref, status: 'failed', scripture: {}, teacher: null, blocks: [], leads: leads(ref), build: { promptVersion: W.PROMPT_VERSION, workerVersion: W.VERSION, model: env.RESTATE_MODEL || 'claude-haiku-4-5', builtAt: new Date().toISOString(), cost: 0 } }
  for (const ed of ['KJV', 'BSB', 'WEB']) { const p = passage(ed, ref.b, ref.c, ref.v, ref.ve); if (p.length) day.scripture[ed.toLowerCase()] = p }
  let note = null, tid = null
  for (const t of ['henry', 'gill']) { const n = await W.teacherNote(t, ref.b, ref.c, ref.v); if (n.blocks.length) { note = n; tid = t; break } }
  if (!note) { day.reasons = ['no Henry or Gill note for this verse']; fs.writeFileSync(file, JSON.stringify(day, null, 1)); report.push({ id, status: 'failed: no teacher note' }); continue }
  day.teacher = { id: tid, name: W.TEACHERS[tid].name, how: note.how, label: note.label || null }
  let ok = 0
  const n = Math.min(NBLOCKS, note.blocks.length)
  for (let i = 0; i < n; i++) {
    const b = { i, original: note.blocks[i] }
    if (DRY) b.dry = true
    else {
      const r = await W.restateBlock(env, tid, ref, i, 'kjv'); spent += r.cost || 0; day.build.cost = +(day.build.cost + (r.cost || 0)).toFixed(5)
      b.ok = !!r.ok; b.metrics = r.metrics
      if (r.ok) { b.restated = r.text; ok++; if (r.retried) b.retried = true } else { b.reasons = r.reasons; b.rejected = r.rejected }
    }
    day.blocks.push(b)
  }
  day.status = DRY ? 'dry' : ok === n ? 'ok' : (day.blocks[0] && day.blocks[0].ok ? 'partial' : 'failed')
  fs.writeFileSync(file, JSON.stringify(day, null, 1))
  report.push({ id, ref: ref.label, teacher: tid, status: day.status, blocks: `${ok}/${n}`, cost: day.build.cost, why: day.blocks.filter(b => b.ok === false).map(b => `block ${b.i + 1}: ${(b.reasons || [])[0] || ''}`).join('; ') })
  console.log(report[report.length - 1])
}
const tally = report.reduce((a, r) => { const k = r.status.split(':')[0]; a[k] = (a[k] || 0) + 1; return a }, {})
const md = [`# Morning Trail build, ${new Date().toISOString()}`, '', `From ${FROM}, ${DAYS} days; prompt ${W.PROMPT_VERSION}; spent about $${spent.toFixed(3)} (cap $${MAX_COST}).`, '', 'Summary: ' + JSON.stringify(tally), '', '| Verse | Teacher | Status | Blocks | Cost | Why not |', '|---|---|---|---|---|---|',
  ...report.map(r => `| ${r.ref || r.id} | ${r.teacher || ''} | ${r.status} | ${r.blocks || ''} | ${r.cost ?? ''} | ${r.why || ''} |`)].join('\n')
fs.writeFileSync(path.join(ROOT, 'morning/last-run.md'), md + '\n')
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n')
console.log(md)
