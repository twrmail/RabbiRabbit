#!/usr/bin/env node
// Morning Trail, flowing format: morning/flow/<verse-id>.json
//   node tools/build-morning-flow.mjs [--from YYYY-MM-DD] [--days 30] [--verses ID,ID] [--force] [--max-cost 3] [--model claude-haiku-4-5] [--attempts 3] [--out morning/flow]
// The teacher leads. CODE prints every word of the teacher and of Scripture. The AI never retypes the teacher: it chooses WHICH of his
// sentences to quote (by number) and writes short connecting sentences. Code checks the choices and the connecting words:
//   - quotes go in the teacher's own order; every numbered point the teacher gives ([1.] .. [6.]) is quoted at least once
//   - connecting words add no names, numbers, references, background or quotation marks, and any count they give (six points) must match the note
//   - the closing "This morning" phrase must be copied letter for letter from the note
// A second, separate AI call reads the connecting words against the quotes and raises flags for a human. A day is only a candidate until approved.
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
const MAX_COST = +opt('max-cost', 3)
const MODEL = String(opt('model', '') || process.env.RESTATE_MODEL || 'claude-haiku-4-5')
const ATTEMPTS = +opt('attempts', 3)
const OUT = path.join(ROOT, opt('out', 'morning/flow'))
const KEY = process.env.ANTHROPIC_API_KEY || ''
if (!KEY) { console.error('No ANTHROPIC_API_KEY set. Add the repo secret.'); process.exit(2) }
const PRICE = { in: +(process.env.PRICE_IN || 1), out: +(process.env.PRICE_OUT || 5) } // dollars per million tokens (Haiku 4.5)
const FLOW_VERSION = 'f1'

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
  bibleCache[ed + b] ||= Object.fromEntries(readJson(f).chapters.map(x => [+x.chapter, x.verses]))
  const ch = bibleCache[ed + b][c] || {}, out = []
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

// ───────────── the note, as numbered sentences with the teacher's own points ─────────────
const NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 }
function parseNote(text) {
  let t = String(text).replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim()
  t = t.replace(/\[(\d+)\.\]/g, ' ⟦B$1⟧ ').replace(/\((\d+)\.\)/g, ' ⟦P$1⟧ ').replace(/\s+/g, ' ').trim()
  const raw = t.split(/(?<=[.!?]["”’')\]]?)\s+(?=[A-Z⟦*(“"\[])/)
  const parts = []
  for (const p of raw) {
    const prev = parts[parts.length - 1]
    if (prev && /\b[A-Z][a-z]{0,2}\.$/.test(prev) && /^[\d a-z]/.test(p)) parts[parts.length - 1] = prev + ' ' + p
    else parts.push(p)
  }
  let curB = null, curP = null
  const sents = parts.map((p, i) => {
    const marks = [...p.matchAll(/⟦([BP])(\d+)⟧/g)].map(m => m[1] + m[2])
    const startB = curB, startP = curP
    for (const m of marks) { if (m[0] === 'B') curB = +m.slice(1); else { curP = +m.slice(1); curB = null } }
    const text = p.replace(/⟦[BP]\d+⟧/g, '').replace(/\s+/g, ' ').trim()
    const bs = new Set(); if (startB) bs.add(startB); for (const m of marks) if (m[0] === 'B') bs.add(+m.slice(1)); if (curB) bs.add(curB)
    const ps = new Set(); if (startP) ps.add(startP); for (const m of marks) if (m[0] === 'P') ps.add(+m.slice(1)); if (curP) ps.add(curP)
    return { i, text, B: [...bs], P: [...ps], marks }
  }).filter(s => s.text)
  sents.forEach((s, i) => { s.i = i })
  const bAll = [...new Set([...t.matchAll(/⟦B(\d+)⟧/g)].map(m => +m[1]))].sort((a, z) => a - z)
  const pAll = [...new Set([...t.matchAll(/⟦P(\d+)⟧/g)].map(m => +m[1]))].sort((a, z) => a - z)
  return { sents, bAll, pAll }
}
const wc = s => String(s).replace(/\*/g, '').trim().split(/\s+/).filter(Boolean).length
const pointLabel = s => s.B.length ? 'B' + s.B[s.B.length - 1] : (s.P.length ? 'P' + s.P[s.P.length - 1] : null)

// ───────────── prompts ─────────────
const FLOW_SYSTEM = `You weave a short devotional out of ONE old commentator's note on a Bible verse. The commentator leads; you only connect. A program prints the commentator's words by sentence number, so you never retype them.
You receive the verse, the commentator's name, his note split into numbered sentences (S0, S1, ...) with the point each belongs to, and the points that must be covered.
Reply with JSON only: {"flow":[{"say":"..."},{"quote":[a,b]},{"say":"..."},{"quote":[a,b]}, ...],"morning":{"say":"...","phrase":"..."}}
RULES (a program checks every one; anything that breaks a rule is thrown away):
- "flow" starts with one "say" that tells the reader, in plain words, what the commentator does with this verse. Then it alternates quote, say, quote, say, and it ends with a quote. Never two says in a row, never two quotes in a row.
- A "quote" prints sentences a through b (inclusive) of the note, by the numbers given. Quotes must follow the note's own order and must not overlap. A quote is at most 3 sentences and 80 words. Quote at least one sentence from every point you are told to cover. Choose the sentence that states the point most plainly.
- A "say" is 1 or 2 short plain sentences, under 40 words. It only restates or connects what the commentator says in the quotes around it, or what the verse says. It adds NO history, background, names, numbers, Bible references, word meanings, opinions, application or teaching of your own, and never says the commentator is right or wrong. The first say names the commentator (use the name given). Use no other teacher's name. No quotation marks, no markdown, no Greek or Hebrew. Plain English, about 8th to 10th grade.
- You may state a count (for example six points) only if it equals the number of points listed for you.
- "morning" closes the devotional. "say" is one sentence, under 25 words, inviting the reader to carry one thing from the note into today, using only what the note says. "phrase" is the exact words (3 to 16 words) you want the reader to keep, copied letter for letter from one sentence of the note.`
const REVIEW_SYSTEM = `You check connecting sentences in a devotional built from an old commentator's note. You get the verse, the quoted passages in order, and the connecting sentences (numbered B0, B1, ...). Flag a connecting sentence ONLY if it states or implies something the quotes and the verse do not say, shifts the commentator's meaning, overstates or understates his point, or gives a count that does not match. Do not flag style. Reply with JSON only: {"flags":[{"b":"B2","issue":"one short sentence"}]} and {"flags":[]} if there are none.`

async function ask(system, user, max) {
  const res = await realFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: max, temperature: 0, system, messages: [{ role: 'user', content: user }] }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 160)}`)
  const j = await res.json(); const u = j.usage || {}
  return { text: (j.content || []).map(c => c.text || '').join('').trim(), cost: ((u.input_tokens || 0) * PRICE.in + (u.output_tokens || 0) * PRICE.out) / 1e6 }
}
const parseJson = s => { const m = String(s).match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]) } catch { return null } }
const norm = s => String(s).replace(/\*/g, '').replace(/\s+/g, ' ').trim()

// ───────────── the checks ─────────────
function validate(obj, parsed, ctx) {
  const problems = []
  const { sents, bAll, pAll } = parsed
  if (!obj || !Array.isArray(obj.flow) || !obj.morning) return { problems: ['not the JSON shape asked for'] }
  const flow = obj.flow
  if (flow.length < 3) problems.push('too short: needs at least a say, a quote and a say or quote')
  flow.forEach((it, k) => { const keys = Object.keys(it || {}); if (keys.length !== 1 || !['say', 'quote'].includes(keys[0])) problems.push(`item ${k + 1} must be exactly one of say or quote`) })
  if (flow[0] && !('say' in flow[0])) problems.push('must begin with a say')
  if (flow.length && !('quote' in flow[flow.length - 1])) problems.push('must end with a quote')
  for (let k = 1; k < flow.length; k++) if (flow[k] && flow[k - 1] && Object.keys(flow[k])[0] === Object.keys(flow[k - 1])[0]) { problems.push('says and quotes must alternate'); break }
  // quotes
  let last = -1, total = 0; const covered = new Set(), quotes = []
  for (const it of flow) if (it && it.quote) {
    const q = it.quote
    if (!Array.isArray(q) || q.length !== 2 || !Number.isInteger(q[0]) || !Number.isInteger(q[1]) || q[0] < 0 || q[1] < q[0] || q[1] >= sents.length) { problems.push('a quote has bad sentence numbers'); continue }
    if (q[0] <= last) problems.push('quotes must follow the note’s order without overlapping')
    last = q[1]
    if (q[1] - q[0] > 2) problems.push('a quote is longer than 3 sentences')
    const w = wc(sents.slice(q[0], q[1] + 1).map(s => s.text).join(' ')); total += w
    if (w > 80) problems.push(`a quote is ${w} words (limit 80)`)
    for (let i = q[0]; i <= q[1]; i++) { sents[i].B.forEach(b => covered.add('B' + b)); sents[i].P.forEach(p => covered.add('P' + p)) }
    quotes.push(q)
  }
  if (total > 420) problems.push(`quotes total ${total} words (limit 420)`)
  const need = bAll.length ? bAll.map(n => 'B' + n) : (pAll.length ? pAll.map(n => 'P' + n) : [])
  const missing = need.filter(n => !covered.has(n))
  if (missing.length) problems.push('does not quote these required points: ' + missing.map(m => m.slice(1)).join(', '))
  if (!need.length && quotes.length < 2) problems.push('quote at least 2 passages')
  // connecting words
  const says = flow.filter(it => it && it.say).map(it => String(it.say))
  says.forEach(s => { if (wc(s) > 40) problems.push('a say is longer than 40 words') })
  const ms = obj.morning && String(obj.morning.say || '')
  if (!ms || wc(ms) > 25) problems.push('morning.say must be one sentence under 25 words')
  const allSay = [...says, ms || ''].join(' ')
  const g = W.restateGates(allSay, ctx.noteFlat, { teacher: ctx.teacher, passageText: ctx.passageText, passageRefs: ctx.passageRefs })
  // connecting words are short and generic, so the restatement 'key words come from the block' test does not apply; and the closing line may say today / this morning
  problems.push(...g.problems.filter(p => !/key words come from the block/.test(p) && !/\(“(today|this morning)”\)/i.test(p)))
  // counts must match the note's own numbering
  const allowed = new Set([bAll.length, pAll.length].filter(Boolean))
  for (const m of ctx.noteFlat.matchAll(/\b(two|three|four|five|six|seven|eight|nine|ten)\s+(?:points?|reasons?|considerations?|things|lessons?|parts?|ways|particulars)\b/gi)) allowed.add(NUMW[m[1].toLowerCase()])
  for (const m of allSay.matchAll(/\b(two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\s+(?:more |other |main |key )?(points?|reasons?|considerations?|things|lessons?|parts?|ways|particulars)\b/gi)) {
    const n = NUMW[m[1].toLowerCase()] || +m[1]
    if (!allowed.has(n)) problems.push(`says "${m[1]} ${m[2]}" but the note has ${[...allowed].join(' or ') || 'no counted'} ${m[2]}`)
  }
  // the closing phrase must be in the note, letter for letter
  let phrase = null
  const ph = String((obj.morning && obj.morning.phrase) || '').replace(/^[\s"“”‘’']+|[\s"“”‘’'.,;:!?]+$/g, '')
  if (wc(ph) < 3 || wc(ph) > 16) problems.push('morning.phrase must be 3 to 16 words')
  else {
    const at = ctx.noteFlat.toLowerCase().indexOf(ph.toLowerCase())
    if (at < 0) problems.push('morning.phrase is not found word for word in the note')
    else phrase = ctx.noteFlat.slice(at, at + ph.length)
  }
  return { problems, quotes, phrase, says, ms, total }
}

// ───────────── one day ─────────────
async function buildDay(id) {
  const ref = idToRef(id)
  const day = { id, format: 'flow', flowVersion: FLOW_VERSION, ref, status: 'failed', scripture: {}, teacher: null, structure: null, flow: [], morning: null, trail: null, leads: leads(ref), review: { flags: [], status: 'unreviewed' }, build: { model: MODEL, builtAt: new Date().toISOString(), cost: 0, attempts: 0 } }
  for (const ed of ['KJV', 'BSB', 'WEB']) { const p = passage(ed, ref.b, ref.c, ref.v, ref.ve); if (p.length) day.scripture[ed.toLowerCase()] = p }
  let note = null, tid = null
  for (const t of ['henry', 'gill']) { const n = await W.teacherNote(t, ref.b, ref.c, ref.v); if (n.blocks.length) { note = n; tid = t; break } }
  if (!note) { day.reasons = ['no Henry or Gill note for this verse']; return day }
  const teacher = W.TEACHERS[tid]
  day.teacher = { id: tid, name: teacher.name, how: note.how, label: note.label || null }
  const parsed = parseNote(note.blocks.join('\n\n'))
  const noteFlat = norm(parsed.sents.map(s => s.text).join(' '))
  const verseText = (day.scripture.kjv || []).map(p => p.text).join(' ')
  const ctx = { teacher, noteFlat, passageText: verseText + ' ' + ref.label, passageRefs: [`${ref.b} ${ref.c}:${ref.v}`] }
  const need = parsed.bAll.length ? parsed.bAll.map(n => 'B' + n) : (parsed.pAll.length ? parsed.pAll.map(n => 'P' + n) : [])
  day.structure = { sentences: parsed.sents.length, points: parsed.bAll.length || parsed.pAll.length || 0, pointKind: parsed.bAll.length ? 'bracket' : (parsed.pAll.length ? 'paren' : 'none'), noteBlocks: note.blocks.length }
  const user = [`TEACHER: ${teacher.short}`, `VERSE: ${ref.label}: ${verseText}`,
    need.length ? `POINTS TO COVER: ${need.join(', ')} (${need.length} numbered points in the note; B = the commentator's [n.] points, P = his (n.) points)` : 'POINTS TO COVER: none numbered; quote at least 2 passages that carry his main thought',
    'NOTE (S number | point | sentence):', ...parsed.sents.map(s => `S${s.i}|${pointLabel(s) || '-'}|${s.text}`)].join('\n')
  let feedback = '', result = null, obj = null
  for (let a = 0; a < ATTEMPTS; a++) {
    day.build.attempts = a + 1
    const r = await ask(FLOW_SYSTEM, user + (feedback ? `\n\nYOUR PREVIOUS ATTEMPT BROKE THESE RULES. Fix them and keep everything else:\n${feedback}` : ''), 1800)
    day.build.cost += r.cost; spent += r.cost
    obj = parseJson(r.text); result = validate(obj, parsed, ctx)
    if (!result.problems.length) break
    feedback = result.problems.map(p => '- ' + p).join('\n'); day.reasons = result.problems
  }
  if (result.problems.length) { day.rejected = obj; day.reasons = result.problems; return day }
  // assemble: code prints every quotation
  let qi = 0
  for (const it of obj.flow) {
    if (it.say) day.flow.push({ type: 'say', text: String(it.say).trim() })
    else { const [a, z] = it.quote; const ss = parsed.sents.slice(a, z + 1); day.flow.push({ type: 'quote', text: ss.map(s => s.text).join(' '), from: a, to: z, point: pointLabel(ss[0]), points: [...new Set(ss.map(pointLabel).filter(Boolean))] }); qi++ }
  }
  day.morning = { say: String(obj.morning.say).trim(), phrase: result.phrase }
  day.structure.quoted = qi; day.structure.pointsCovered = need.length
  // the teacher's next thought, when his note announces a (1.) and the (2.) sits in the following note
  if (parsed.pAll.includes(1) && !parsed.pAll.includes(2)) {
    const hi = ((note.label || '').match(/verses?\s+(\d+)\s*-\s*(\d+)/) || [])[2]
    const nv = (hi ? +hi : ref.v) + 1
    const n2 = await W.teacherNote(tid, ref.b, ref.c, nv)
    if (n2.blocks.length && /^\s*\(2\.\)/.test(n2.blocks[0])) {
      const p2 = parseNote(n2.blocks[0]); const hi2 = ((n2.label || '').match(/verses?\s+(\d+)\s*-\s*(\d+)/) || [])[2]
      day.trail = { ref: `${W.BOOK_NAME[ref.b]} ${ref.c}:${nv}${hi2 && +hi2 > nv ? '-' + hi2 : ''}`, text: p2.sents[0] ? p2.sents[0].text : '', note: `${teacher.name}’s next thought` }
    }
  }
  // advisory review: a separate call reads the connecting words against the quotes
  try {
    const bl = day.flow.filter(f => f.type === 'say').map((f, k) => `B${k}: ${f.text}`).concat(`B${day.flow.filter(f => f.type === 'say').length}: ${day.morning.say}`)
    const body = [`VERSE: ${ref.label}: ${verseText}`, 'FLOW IN ORDER:', ...day.flow.map(f => f.type === 'quote' ? `QUOTE: ${f.text}` : `SAY: ${f.text}`), `MORNING: ${day.morning.say} [${day.morning.phrase}]`, 'CONNECTING SENTENCES:', ...bl].join('\n')
    const rv = await ask(REVIEW_SYSTEM, body, 700); day.build.cost += rv.cost; spent += rv.cost
    const j = parseJson(rv.text); day.review.flags = j && Array.isArray(j.flags) ? j.flags.slice(0, 6) : []
    if (!j) day.review.error = 'review reply was not JSON'
  } catch (e) { day.review.error = String(e.message).slice(0, 100) }
  day.build.cost = +day.build.cost.toFixed(5)
  day.status = 'ok'
  return day
}

// ───────────── which verses, and run ─────────────
let ids = []
if (ONLY) ids = ONLY
else {
  const start = new Date(FROM + 'T00:00:00Z'); const seen = new Set(); const sched = {}
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(start.getTime() + i * 864e5), iso = d.toISOString().slice(0, 10), y = iso.slice(0, 4)
    sched[y] ||= readJson(path.join(ROOT, 'morning/schedule', y + '.json')).days
    const e = sched[y][iso]; if (e && !seen.has(e.verse)) { seen.add(e.verse); ids.push(e.verse) }
  }
}
fs.mkdirSync(OUT, { recursive: true })
let spent = 0; const report = []
for (const id of ids) {
  const file = path.join(OUT, id + '.json')
  if (!FORCE && fs.existsSync(file) && readJson(file).status === 'ok' && readJson(file).flowVersion === FLOW_VERSION) { report.push({ id, status: 'skipped (already built)' }); continue }
  if (spent >= MAX_COST) { report.push({ id, status: 'not run (cost cap reached)' }); continue }
  let day
  try { day = await buildDay(id) } catch (e) { day = { id, status: 'failed', reasons: ['error: ' + String(e.message).slice(0, 140)] } }
  fs.writeFileSync(file, JSON.stringify(day, null, 1))
  const row = { id, ref: day.ref && day.ref.label, teacher: day.teacher && day.teacher.id, status: day.status, points: day.structure ? `${day.structure.pointsCovered ?? '-'}/${day.structure.points}` : '', flags: day.review ? day.review.flags.length : '', cost: day.build && day.build.cost, why: (day.reasons || []).slice(0, 2).join('; ') }
  report.push(row); console.log(row)
}
const tally = report.reduce((a, r) => { const k = r.status.split(' (')[0]; a[k] = (a[k] || 0) + 1; return a }, {})
const md = [`# Morning Trail flowing build, ${new Date().toISOString()}`, '', `From ${FROM}, ${DAYS} days; ${FLOW_VERSION}; model ${MODEL}; spent about $${spent.toFixed(3)} (cap $${MAX_COST}).`, '', 'Summary: ' + JSON.stringify(tally), '',
  '| Verse | Teacher | Status | Points covered | Review flags | Cost | Why not |', '|---|---|---|---|---|---|---|',
  ...report.map(r => `| ${r.ref || r.id} | ${r.teacher || ''} | ${r.status} | ${r.points || ''} | ${r.flags ?? ''} | ${r.cost ?? ''} | ${r.why || ''} |`)].join('\n')
fs.writeFileSync(path.join(ROOT, 'morning/last-flow-run.md'), md + '\n')
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n')
console.log(md)
