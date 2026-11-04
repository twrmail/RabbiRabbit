// Boundary and back-matter scans over library/commentary. READ-ONLY: reports candidates, never edits or deletes anything.
// Why: a repair can pass its own test and still leave a structural defect that only a comparison between neighbouring chapters shows
// (the Amos 1 chapter that held all of Amos 2, six chapters ending with the next chapter's opening table, thirteen chapters carrying a
// volume's indexes). These scans find that kind of defect without anyone reading the text.
//   tail/head overlap : the end of chapter N and the start of chapter N+1 share a run of 40 or more identical words
//   back matter       : a dense run of scripture references (an index), or CCEL volume furniture (title page, placeholder, "Index of ...")
//   within-source copy (only with --within, slower): a chapter whose text is 10% or more found in other chapters of the same book file (information only)
// A finding that is understood and accepted is recorded in library/scan-exceptions.json with a reason; everything else is "unexplained".
// Usage: node tools/guardian-scans.mjs library [--json]      Exit code 1 if there is an unexplained tail/head or back-matter finding.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WORD = /[\p{L}]+/gu
export const words = t => (t.match(WORD) || []).map(w => w.toLowerCase())
const N = 12, MIN_RUN = 40, WINDOW = 4000
const REF = /\d+:\d+(?:-\d+(?::\d+)?)?/
export const DENSE = /(?:\d+:\d+(?:-\d+)?\s+){12,}/
export const FURNITURE = [
  [/Christian Classics Ethereal Library/i, 'CCEL library credit line (title page)'],
  [/www\.ccel\.org/i, 'CCEL web address (title page)'],
  [/\bis located here\./i, 'CCEL placeholder sentence'],
  [/TRANSLATION OF CALVIN.S VERSION/i, 'translation back matter'],
  [/\bIndex of (?:Hebrew|Greek|Latin|Scripture|Subjects|Words)\b/i, 'index heading']
]
const chapterTexts = doc => {
  const chs = doc.chapters
  if (Array.isArray(chs)) return chs.map(c => [c.chapter, typeof c.commentary === 'string' ? c.commentary : (c.verses && typeof c.verses === 'object' ? Object.values(c.verses).join(' ') : '')])
  if (chs && typeof chs === 'object') return Object.entries(chs).map(([k, v]) => [Number(k), typeof v === 'string' ? v : JSON.stringify(v)])
  return []
}
// 12-word windows as numbers (two 32-bit-style hashes packed into one safe integer) so large books scan quickly
const ids = new Map()
const wid = w => { let i = ids.get(w); if (i === undefined) { i = ids.size + 1; ids.set(w, i) } return i }
export const shingles = (w, n = N) => {
  const a = w.map(wid), out = new Array(Math.max(0, a.length - n + 1))
  for (let i = 0; i + n <= a.length; i++) { let h1 = 0, h2 = 0; for (let j = 0; j < n; j++) { h1 = (Math.imul(h1, 1000003) + a[i + j]) >>> 0; h2 = (Math.imul(h2, 8191) + a[i + j] * 7 + j) & 0x1fffff } out[i] = h1 + h2 * 4294967296 }
  return out
}
// runs of consecutive shared shingles between the end of a and the start of b; a run made mostly of one repeated phrase (boilerplate such as
// "Verse: no entry from Barnes for this verse") is not a copy of text and is ignored
export function tailHeadRuns(a, b) {
  const wa = typeof a === 'string' ? words(a) : a, wb = typeof b === 'string' ? words(b) : b
  const head = new Set(shingles(wb.slice(0, WINDOW)))
  const start = Math.max(0, wa.length - WINDOW), sa = shingles(wa.slice(start)), hits = []
  sa.forEach((h, i) => { if (head.has(h)) hits.push(i) })
  const runs = []
  for (const p of hits) { const r = runs[runs.length - 1]; if (r && p - r[1] <= 3) r[1] = p; else runs.push([p, p]) }
  return runs.map(([s, e]) => ({ words: e + N - s, distinct: new Set(sa.slice(s, e + 1)).size / (e + 1 - s) })).filter(r => r.words >= MIN_RUN && r.distinct >= 0.5)
}
export function backMatterSignals(text) {
  const out = []
  const d = DENSE.exec(text); if (d) out.push({ kind: 'dense scripture-reference run (an index)', at: d.index })
  for (const [re, label] of FURNITURE) { const m = re.exec(text); if (m) out.push({ kind: label, at: m.index }) }
  return out
}
export function scanFolder(folder, source, opts = {}) {
  const findings = []
  for (const f of fs.readdirSync(folder).filter(x => x.endsWith('.json')).sort()) {
    const book = f.slice(0, -5), doc = JSON.parse(fs.readFileSync(path.join(folder, f), 'utf8')), items = chapterTexts(doc).sort((x, y) => x[0] - y[0])
    for (const [n, t] of items) for (const s of backMatterSignals(t)) findings.push({ source, book, chapter: n, check: 'back-matter', detail: s.kind, at: s.at })
    const W = items.map(([, t]) => words(t))
    for (let i = 0; i + 1 < items.length; i++) {
      if (items[i + 1][0] !== items[i][0] + 1) continue
      const runs = tailHeadRuns(W[i], W[i + 1])
      if (runs.length) findings.push({ source, book, chapter: items[i][0], nextChapter: items[i + 1][0], check: 'tail-head', detail: `${runs.length} run(s) of identical text shared between the end of chapter ${items[i][0]} and the start of chapter ${items[i + 1][0]}, longest ${Math.max(...runs.map(r => r.words))} words`, words: Math.max(...runs.map(r => r.words)) })
    }
    // within-book copy (information): shingles of a chapter that also occur in another chapter of the same book
    if (!opts.within) continue
    const owner = new Map(), S = new Map()
    for (const [n, t] of items) { const sh = shingles(words(t)); S.set(n, sh); for (const h of new Set(sh)) { const o = owner.get(h); if (o) o.add(n); else owner.set(h, new Set([n])) } }
    for (const [n] of items) { const sh = S.get(n); if (sh.length < 200) continue; const dup = sh.filter(h => owner.get(h).size > 1).length / sh.length; if (dup >= 0.10) findings.push({ source, book, chapter: n, check: 'within-book-copy', detail: `${(dup * 100).toFixed(1)}% of this chapter's 12-word runs also occur in another chapter of ${book}`, fraction: Number(dup.toFixed(3)) }) }
  }
  return findings
}
const FOLDERS = { mhc: 'MHC', jfb: 'JFB', calvin: 'Calvin', scofield: 'Scofield', wesley: 'Wesley', spurgeon: 'Spurgeon', 'barnes-nt': 'Barnes-NT', tyndale: 'Tyndale', 'barnes-legacy': 'Barnes', clarke: 'Clarke', vincent: 'Vincent', meyer: 'Meyer' }
export function scanLibrary(libDir, opts = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(libDir, 'manifest.json'), 'utf8')), all = [], scanned = []
  for (const s of manifest.sources.filter(x => x.kind === 'commentary')) {
    const dir = path.join(libDir, 'commentary', FOLDERS[s.id] || s.id)
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue
    scanned.push(s.id); all.push(...scanFolder(dir, s.id, opts))
  }
  const ex = fs.existsSync(path.join(libDir, 'scan-exceptions.json')) ? JSON.parse(fs.readFileSync(path.join(libDir, 'scan-exceptions.json'), 'utf8')).exceptions || [] : []
  const key = f => `${f.source}|${f.book}|${f.chapter}|${f.check}`
  const exKeys = new Map(ex.map(e => [`${e.source}|${e.book}|${e.chapter}|${e.check}`, e]))
  for (const f of all) { const e = exKeys.get(key(f)); if (e) f.explained = e.reason }
  const staleExceptions = ex.filter(e => !all.some(f => key(f) === `${e.source}|${e.book}|${e.chapter}|${e.check}`))
  return { scanned, findings: all, staleExceptions }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const libDir = process.argv[2] || 'library', { scanned, findings, staleExceptions } = scanLibrary(libDir, { within: process.argv.includes('--within') })
  if (process.argv.includes('--json')) console.log(JSON.stringify({ scanned, findings, staleExceptions }, null, 1))
  else {
    const gate = f => f.check !== 'within-book-copy' && !f.explained
    const by = {}; for (const f of findings) { const k = `${f.source}: ${f.check}${f.explained ? ' (explained)' : ''}`; by[k] = (by[k] || 0) + 1 }
    console.log(`Scanned ${scanned.length} commentary sources: ${scanned.join(', ')}`)
    for (const [k, v] of Object.entries(by).sort()) console.log(`  ${k}: ${v}`)
    for (const f of findings.filter(gate)) console.log(`UNEXPLAINED ${f.source} ${f.book} ${f.chapter}: ${f.check}: ${f.detail}`)
    for (const e of staleExceptions) console.log(`STALE EXCEPTION (no longer found; remove it) ${e.source} ${e.book} ${e.chapter} ${e.check}`)
    console.log(`${findings.filter(gate).length} unexplained tail/head or back-matter finding(s).`)
  }
  process.exit(findings.some(f => f.check !== 'within-book-copy' && !f.explained) ? 1 : 0)
}
