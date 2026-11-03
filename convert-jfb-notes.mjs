// JFB -> common "notes" shape. PILOT, read-only on its inputs. Usage:
//   node convert-jfb-notes.mjs <dir-with-JFB-per-book-json> <dir-with-KJV-per-book-json> <out-dir>
// Writes <out-dir>/JFB/<CODE>.json and <out-dir>/jfb-notes-report.txt
//
// One note = one contiguous slice of the original chapter text (whole lines, newline included), so that
// joining a chapter's notes reproduces the original chapter text byte for byte (Gate 1).
// What each note COVERS (verses) is derived from explicit markers only: a leading verse number
// ("16. For God...", "14-16.", "9, 10.") or a section heading ("Ge 1:6-8. Second Day.").
// Nothing is inferred from nearness.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { jfbVersesOf, JFB_HEADING, jfbExtract } from './jfb-v32-reference.mjs'

const [, , jfbDir, kjvDir, outDir] = process.argv
if (!jfbDir || !kjvDir || !outDir) { console.error('usage: node convert-jfb-notes.mjs <jfbDir> <kjvDir> <outDir>'); process.exit(1) }
const sha = s => crypto.createHash('sha256').update(s).digest('hex')
const CODES = fs.readdirSync(jfbDir).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))
const BUILD = { schemaVersion: 1, builder: 'convert-jfb-notes.mjs', pilot: true }
const SEE_ON = /^(For the exposition, )?see on\b/i

// ---------- conversion ----------
function convertChapter(book, chapter, text) {
  const notes = []
  if (text === '') return notes
  const lines = text.split('\n')
  let cur = null, sectionId = null
  const start = (kind, extra, line) => {
    cur = { id: `JFB-${book}-${chapter}-${notes.length + 1}`, ordinal: notes.length + 1, kind, sectionId: kind === 'section' || kind === 'chapter-header' ? null : sectionId, coverage: null, ...extra, text: line }
    notes.push(cur)
  }
  lines.forEach((raw, i) => {
    const line = raw + (i < lines.length - 1 ? '\n' : '')
    if (/^CHAPTER\s+\d+/.test(raw)) { start('chapter-header', {}, line); sectionId = null; return }
    const h = JFB_HEADING.exec(raw)
    if (h && +h[2] === chapter) {
      const cov = jfbVersesOf(h[3] + h[4] + '. ')
      const verses = cov ? [...cov.verses].sort((a, b) => a - b) : null
      start('section', {
        heading: h[5].trim().replace(/\.$/, ''),
        rangeAsPrinted: (h[3] + h[4]).replace(/\s+/g, ''),
        coverage: verses ? { verses, start: verses[0], end: verses[verses.length - 1], basis: 'section-heading' } : null,
      }, line)
      sectionId = cur.id
      return
    }
    const n = jfbVersesOf(raw)
    if (n) {
      const verses = [...n.verses].sort((a, b) => a - b)
      start(verses.length === 1 ? 'verse' : 'grouped', {
        markerAsPrinted: n.marker.replace(/\.$/, ''),
        coverage: { verses, start: verses[0], end: verses[verses.length - 1], basis: 'leading-verse-number' },
      }, line)
      return
    }
    // unnumbered line: continues the current note if that note can own continuation text
    if (cur && ['verse', 'grouped', 'section-text', 'intro'].includes(cur.kind)) { cur.text += line; return }
    if (cur && cur.kind === 'section') { start('section-text', { coverage: null }, line); return }
    start('intro', { coverage: null }, line)
  })
  // pointer flag: a section whose body only points elsewhere
  for (let k = 0; k < notes.length; k++) {
    if (notes[k].kind !== 'section') continue
    let body = ''
    for (let j = k + 1; j < notes.length && notes[j].kind !== 'section' && notes[j].kind !== 'chapter-header'; j++) body += notes[j].text
    body = body.trim()
    notes[k].bodyIsPointer = !!body && SEE_ON.test(body)
    if (notes[k].bodyIsPointer) notes[k].pointerText = body.split('\n')[0].trim()
  }
  flagSuspects(notes)
  return notes
}

// Anchor-status flags. The note's TEXT is never changed; a suspect note stays in the data (so the rejoin test
// still holds) but never anchors a verse request. Two deterministic rules, both from explicit structure:
//  A: a numbered item BEFORE the chapter's first section heading, when a later note claims the same verse(s)
//     -> likely the book/section introduction's own numbered outline (Psalms 1, Proverbs 1)
//  B: after A, a numbered note that breaks the chapter's ascending verse order (not in the longest
//     non-decreasing run) -> likely a numbering slip or a note filed under the wrong chapter
function flagSuspects(notes) {
  for (const n of notes) if (n.kind === 'verse' || n.kind === 'grouped') n.anchorStatus = 'ok'
  const numbered = notes.filter(n => n.anchorStatus)
  const firstSec = notes.findIndex(n => n.kind === 'section')
  if (firstSec >= 0) {
    const later = new Set()
    for (const n of notes.slice(firstSec)) if (n.anchorStatus) n.coverage.verses.forEach(v => later.add(v))
    for (const n of notes.slice(0, firstSec)) {
      if (n.anchorStatus && n.coverage.verses.some(v => later.has(v))) { n.anchorStatus = 'suspect'; n.anchorReason = 'A: numbered item before the first section heading, same verse claimed again after it' }
    }
  }
  const rest = numbered.filter(n => n.anchorStatus === 'ok')
  const len = new Array(rest.length).fill(1), prev = new Array(rest.length).fill(-1)
  for (let i = 0; i < rest.length; i++) for (let j = 0; j < i; j++) {
    if (rest[j].coverage.start <= rest[i].coverage.start && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j }
  }
  let best = -1
  for (let i = 0; i < rest.length; i++) if (best < 0 || len[i] >= len[best]) best = i   // ties: prefer the later end, keeps chapter-final order
  const keep = new Set()
  for (let i = best; i >= 0; i = prev[i]) keep.add(i)
  rest.forEach((n, i) => { if (!keep.has(i)) { n.anchorStatus = 'suspect'; n.anchorReason = 'B: breaks the ascending verse order of this chapter' } })
}

// ---------- resolver: answers a verse request from the notes alone (no raw-text regexes) ----------
export function resolve(notes, verse, cap = 2000) {
  const first = notes.findIndex(n => n.kind === 'verse' && n.anchorStatus === 'ok' && n.coverage.verses.includes(verse))
  const grp = notes.findIndex(n => n.kind === 'grouped' && n.anchorStatus === 'ok' && n.coverage.verses.includes(verse))
  const startIdx = first >= 0 ? first : grp
  if (startIdx >= 0) {
    let out = notes[startIdx].text
    for (let i = startIdx + 1; i < notes.length; i++) {
      const n = notes[i]
      if (n.kind === 'section' || n.kind === 'chapter-header') break
      if ((n.kind === 'verse' || n.kind === 'grouped') && n.coverage.start > verse) break
      out += n.text
    }
    let text = out.trim()
    const how = first >= 0 ? 'verse' : 'grouped'
    if (how === 'grouped') text = '[JFB comments on these verses together: ' + notes[startIdx].markerAsPrinted + ']\n' + text
    return { text: text.slice(0, cap).trim(), how, noteId: notes[startIdx].id }
  }
  const sIdx = notes.findIndex(n => n.kind === 'section' && n.coverage && n.coverage.verses.includes(verse))
  if (sIdx >= 0) {
    let body = ''
    for (let j = sIdx + 1; j < notes.length && notes[j].kind !== 'section' && notes[j].kind !== 'chapter-header'; j++) body += notes[j].text
    body = body.trim()
    if (!body || SEE_ON.test(body)) return { text: null, how: 'pointer', noteId: notes[sIdx].id }
    const s = notes[sIdx]
    const title = s.heading ? ' ("' + s.heading + '")' : ''
    const label = '[JFB comments on verses ' + s.rangeAsPrinted + ' together as one passage' + title + '; it has no separate note on verse ' + verse + ']\n'
    return { text: (label + body).slice(0, cap).trim(), how: 'section', noteId: s.id }
  }
  return { text: null, how: null }
}

// ---------- run ----------
const report = []
const fail = { rejoin: [], coverage: [], order: [], dupExact: [], emptyNote: [] }
const kindCount = {}
const chapterCoverage = { chaptersTotal: 0, notes: 0 }
const suspects = []
const allNotes = {}
const diffRows = []
const compare = { verses: 0, same: 0, diff: [], hows: {}, v32Hows: {}, noChapter: 0 }
fs.mkdirSync(path.join(outDir, 'JFB'), { recursive: true })

for (const code of CODES) {
  const src = JSON.parse(fs.readFileSync(path.join(jfbDir, code + '.json'), 'utf8'))
  const kjv = JSON.parse(fs.readFileSync(path.join(kjvDir, code + '.json'), 'utf8'))
  const maxV = Object.fromEntries(kjv.chapters.map(c => [c.chapter, Math.max(...Object.keys(c.verses).map(Number))]))
  const outChapters = []
  const byChapter = {}
  for (const c of src.chapters) {
    const notes = convertChapter(code, c.chapter, c.commentary || '')
    byChapter[c.chapter] = { notes, text: c.commentary || '' }
    allNotes[code + ' ' + c.chapter] = notes
    for (const n of notes) if (n.anchorStatus === 'suspect') suspects.push(`${code} ${c.chapter} ${n.id} [${n.markerAsPrinted}] ${n.anchorReason.slice(0, 1)}  "${n.text.slice(0, 60).replace(/\n/g, ' | ')}"`)
    chapterCoverage.chaptersTotal++; chapterCoverage.notes += notes.length
    // Gate 1: exact rejoin
    const rejoined = notes.map(n => n.text).join('')
    if (rejoined !== (c.commentary || '')) fail.rejoin.push(`${code} ${c.chapter}`)
    if (notes.some(n => n.text === '')) fail.emptyNote.push(`${code} ${c.chapter}`)
    // Gate 2 (automatic invariants)
    const mv = maxV[c.chapter]
    let prevFirst = 0, seenExact = new Map()
    for (const n of notes) {
      kindCount[n.kind] = (kindCount[n.kind] || 0) + 1
      if (n.coverage) {
        if (mv === undefined) fail.coverage.push(`${code} ${c.chapter}: JFB chapter not in KJV`)
        else if (n.coverage.end > mv || n.coverage.start < 1) fail.coverage.push(`${code} ${c.chapter} ${n.id} ${n.kind} ${n.markerAsPrinted || n.rangeAsPrinted} (KJV max verse ${mv})`)
      }
      if (n.kind === 'verse' || n.kind === 'grouped') {
        if (n.coverage.start < prevFirst) fail.order.push(`${code} ${c.chapter} ${n.id} starts at ${n.coverage.start} after ${prevFirst}`)
        prevFirst = Math.max(prevFirst, n.coverage.start)
      }
      if (n.kind === 'verse') {
        const v = n.coverage.start
        if (seenExact.has(v)) fail.dupExact.push(`${code} ${c.chapter}:${v} (${seenExact.get(v)} and ${n.id})`)
        else seenExact.set(v, n.id)
      }
    }
    outChapters.push({ chapter: c.chapter, originalLength: (c.commentary || '').length, originalSha256: sha(c.commentary || ''), notes })
  }
  fs.writeFileSync(path.join(outDir, 'JFB', code + '.json'), JSON.stringify({ book: code, sourceId: 'jfb', edition: 'unknown', build: BUILD, chapters: outChapters }))
  // compare the notes resolver with v32's raw-text extractor on every KJV verse
  for (const kc of kjv.chapters) {
    const bc = byChapter[kc.chapter]
    for (const vs of Object.keys(kc.verses)) {
      const v = +vs
      compare.verses++
      let a, b
      if (!bc) { compare.noChapter++; a = { text: null, how: null }; b = { text: null, how: null } }
      else { a = jfbExtract(bc.text, kc.chapter, v, 2000); b = resolve(bc.notes, v, 2000) }
      compare.hows['notes:' + (b.how || 'none')] = (compare.hows['notes:' + (b.how || 'none')] || 0) + 1
      compare.v32Hows['v32:' + (a.how || 'none')] = (compare.v32Hows['v32:' + (a.how || 'none')] || 0) + 1
      if ((a.text || null) === (b.text || null) && (a.how || null) === (b.how || null)) compare.same++
      else { compare.diff.push(`${code} ${kc.chapter}:${v}`); diffRows.push([`${code} ${kc.chapter}:${v}`, a.how || 'none', (a.text || '').slice(0, 70).replace(/\n/g, ' | '), b.how || 'none', (b.text || '').slice(0, 70).replace(/\n/g, ' | ')]) }
    }
  }
}

const L = []
L.push(`JFB -> notes pilot. ${new Date().toISOString()}  (read-only on inputs; schema v${BUILD.schemaVersion})`)
L.push(`Books ${CODES.length}, chapters ${chapterCoverage.chaptersTotal}, notes ${chapterCoverage.notes}`)
L.push('Note kinds: ' + Object.entries(kindCount).sort().map(([k, n]) => `${k} ${n}`).join(', '))
L.push('', '== GATE 1: text preservation (rejoin all notes of a chapter == original chapter text, byte for byte)')
L.push(`   chapters that fail: ${fail.rejoin.length}${fail.rejoin.length ? '  ' + fail.rejoin.slice(0, 20).join('; ') : ''}`)
L.push(`   empty notes: ${fail.emptyNote.length}`)
L.push('', '== GATE 2a: automatic invariants (flags for review, not proof of error)')
L.push(`   coverage outside the KJV chapter's verses: ${fail.coverage.length}`); fail.coverage.slice(0, 40).forEach(x => L.push('      ' + x))
L.push(`   verse notes out of order inside a chapter: ${fail.order.length}`); fail.order.slice(0, 25).forEach(x => L.push('      ' + x))
L.push(`   two single-verse notes for the same verse: ${fail.dupExact.length}`); fail.dupExact.slice(0, 25).forEach(x => L.push('      ' + x))
L.push('', `== Cross-check: notes resolver vs v32 raw-text extractor, every KJV verse (${compare.verses})`)
L.push(`   identical text and method: ${compare.same}   different: ${compare.diff.length}   (verses in chapters JFB lacks: ${compare.noChapter})`)
L.push('   by method (notes resolver): ' + Object.entries(compare.hows).sort().map(([k, n]) => `${k.replace('notes:', '')} ${n}`).join(', '))
L.push('   by method (v32 reference):  ' + Object.entries(compare.v32Hows).sort().map(([k, n]) => `${k.replace('v32:', '')} ${n}`).join(', '))
compare.diff.slice(0, 40).forEach(x => L.push('      ' + x))
fs.writeFileSync(path.join(outDir, 'jfb-notes-report.txt'), L.join('\n') + '\n')
console.log(L.join('\n'))

// ---------- fixtures (Gate 2b): hand-checkable cases with expected results ----------
// Expectations come from the v32 sandbox report's spot checks and from text read in this session.
const FIX = [
  // [book, chapter, verse, expected how, expected text starts with]
  ['JHN', 3, 16, 'verse', '16. For God so loved'],
  ['JHN', 3, 15, 'grouped', '[JFB comments on these verses together: 14-16]'],
  ['ROM', 8, 28, 'verse', '28. And'],
  ['GEN', 1, 1, 'verse', '1. In the beginning'],
  ['GEN', 1, 7, 'section', '[JFB comments on verses 6-8 together as one passage ("Second Day"); it has no separate note on verse 7]'],
  ['GEN', 1, 10, 'section', '[JFB comments on verses 9-13 together as one passage ("Third Day")'],
  ['MAT', 22, 15, 'pointer', null],
  ['PSA', 23, 1, 'verse', '1.'],
  ['PSA', 1, 1, 'verse', '1. Blessed'],            // v32 served the introduction outline "1. Didactic."
  ['PRO', 1, 2, 'verse', '2. To know'],             // v32 served the introduction's "2. The antithetic..."
  ['HEB', 13, 7, 'verse', '7. Remember'],           // v32 served "7. Two manifestations of brotherly love"
  ['MAT', 5, 3, 'verse', '3. Blessed'],             // two clause notes on one verse: both are served
]
L.push('', '== GATE 2b: fixed cases with expected results')
let fixFail = 0
for (const [b, ch, v, how, starts] of FIX) {
  const r = resolve(allNotes[b + ' ' + ch], v, 2000)
  const ok = r.how === how && (starts === null ? r.text === null : (r.text || '').startsWith(starts))
  if (!ok) fixFail++
  L.push(`   ${ok ? 'PASS' : 'FAIL'}  ${b} ${ch}:${v}  expect ${how}${starts ? ' "' + starts.slice(0, 40) + '"' : ''}  got ${r.how}${r.text ? ' "' + r.text.slice(0, 50).replace(/\n/g, ' | ') + '"' : ''}`)
}
L.push(`   fixed cases failing: ${fixFail} of ${FIX.length}`)
L.push('', `== Suspect notes (anchorStatus=suspect): ${suspects.length}   (rule A = intro outline duplicated after heading; rule B = breaks ascending order)`)
suspects.forEach(x => L.push('   ' + x))
L.push('', `== Verses where the notes resolver differs from v32: ${diffRows.length}   (full list: diff-vs-v32.tsv)`)
diffRows.slice(0, 60).forEach(r => L.push(`   ${r[0]}\n      v32   ${r[1]}: ${r[2]}\n      notes ${r[3]}: ${r[4]}`))
fs.writeFileSync(path.join(outDir, 'diff-vs-v32.tsv'), ['verse\tv32_how\tv32_start\tnotes_how\tnotes_start', ...diffRows.map(r => r.join('\t'))].join('\n') + '\n')
fs.writeFileSync(path.join(outDir, 'jfb-notes-report.txt'), L.join('\n') + '\n')
console.log(L.slice(L.findIndex(x => x.startsWith('== GATE 2b')) - 1).join('\n'))