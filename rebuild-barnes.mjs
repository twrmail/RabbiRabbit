#!/usr/bin/env node
// rebuild-barnes.mjs  (v2 -- rewritten against the REAL file layout)
//
// Rebuilds Barnes' Notes on the New Testament from CCEL's full-text
// download, replacing the current data, which is hard-truncated to
// exactly 2,000 characters per chapter.
//
//   Source: https://www.ccel.org/ccel/b/barnes/ntnotes/cache/ntnotes.txt
//   (public domain, ~23 MB, ~379k lines, NEW TESTAMENT ONLY)
//
// REAL LAYOUT (confirmed from your terminal output, not guessed):
//   - Every verse's commentary starts at a heading line like
//         "  THE EPISTLE TO THE ROMANS - Chapter 8 - Verse 28"
//     (7,334 of these in the file) and runs until the next such heading,
//     a chapter-only heading ("BOOK - Chapter 8"), or a line of underscores.
//   - Text is hard-wrapped at ~72 columns with 3 leading spaces.
//   - Blocks end with cross-reference lines like  {d} "begat Isaac" Ge 21:2-5
//   - Some verses are placeholders: "No specific Barnes text on this verse."
//   - Some verses are stubs: 'Verses 2-16. See Barnes on "Mt 1:3".'
//     (resolved to the target verse's real text when it can be found)
//   - 1 Corinthians (81/437 headings) and 2 Corinthians (0/257) do NOT use
//     this heading layout for most of their verses. The coverage report
//     below will show them as LOW -- they need a second look.
//
// ── RUNNING ──────────────────────────────────────────────────────────
//   node rebuild-barnes.mjs --test     parse, print coverage + Rom 8:28 +
//                                      Mt 1:2, write NOTHING
//   node rebuild-barnes.mjs            parse and write ./Barnes_rebuilt/{CODE}.json
//   node rebuild-barnes.mjs --file X   use a local file instead of ntnotes-raw.txt
//
// Output shape (same pattern as Tyndale/Spurgeon/Wesley):
//   { book, name, source, chapters: [ { chapter, verses: { "1": "...", ... } } ] }

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'

const SOURCE_URL = 'https://www.ccel.org/ccel/b/barnes/ntnotes/cache/ntnotes.txt'
const RAW_CACHE_FILE = 'ntnotes-raw.txt'
const OUT_DIR = 'Barnes_rebuilt'

const args = process.argv.slice(2)
const isTest = args.includes('--test')
const fileIdx = args.indexOf('--file')
const localFile = fileIdx >= 0 ? args[fileIdx + 1] : null

// Title text exactly as it appears in the real file's verse headings.
const TITLE_TO_CODE = {
  'THE GOSPEL ACCORDING TO MATTHEW': 'MAT',
  'THE GOSPEL ACCORDING TO MARK': 'MRK',
  'THE GOSPEL ACCORDING TO LUKE': 'LUK',
  'THE GOSPEL ACCORDING TO JOHN': 'JHN',
  'THE ACTS OF THE APOSTLES': 'ACT',
  'THE EPISTLE TO THE ROMANS': 'ROM',
  'THE FIRST EPISTLE OF PAUL THE APOSTLE TO THE CORINTHIANS': '1CO',
  'THE SECOND EPISTLE OF PAUL THE APOSTLE TO THE CORINTHIANS': '2CO',
  'THE EPISTLE OF PAUL THE APOSTLE TO THE GALATIANS': 'GAL',
  'EPHESIANS': 'EPH',
  'EPISTLE TO THE PHILIPPIANS': 'PHP',
  'THE EPISTLE OF PAUL TO THE COLOSSIANS': 'COL',
  'THE FIRST EPISTLE TO THE THESSALONIANS': '1TH',
  'THE SECOND EPISTLE TO THE THESSALONIANS': '2TH',
  'THE FIRST EPISTLE OF PAUL TO TIMOTHY': '1TI',
  'THE SECOND EPISTLE OF PAUL TO TIMOTHY': '2TI',
  'THE EPISTLE OF PAUL TO TITUS': 'TIT',
  'EPISTLE OF PAUL TO PHILEMON': 'PHM',
  'THE EPISTLE OF PAUL THE APOSTLE TO THE HEBREWS': 'HEB',
  'THE GENERAL EPISTLE OF JAMES': 'JAS',
  'THE FIRST EPISTLE GENERAL OF PETER': '1PE',
  'THE SECOND EPISTLE GENERAL OF PETER': '2PE',
  'THE FIRST EPISTLE GENERAL OF JOHN': '1JN',
  'SECOND EPISTLE OF JOHN': '2JN',
  'THIRD EPISTLE OF JOHN': '3JN',
  'THE GENERAL EPISTLE OF JUDE': 'JUD',
  'REVELATION OF ST. JOHN THE DIVINE': 'REV',
}

const BOOK_NAMES = {
  MAT: 'Matthew', MRK: 'Mark', LUK: 'Luke', JHN: 'John', ACT: 'Acts', ROM: 'Romans',
  '1CO': '1 Corinthians', '2CO': '2 Corinthians', GAL: 'Galatians', EPH: 'Ephesians',
  PHP: 'Philippians', COL: 'Colossians', '1TH': '1 Thessalonians', '2TH': '2 Thessalonians',
  '1TI': '1 Timothy', '2TI': '2 Timothy', TIT: 'Titus', PHM: 'Philemon', HEB: 'Hebrews',
  JAS: 'James', '1PE': '1 Peter', '2PE': '2 Peter', '1JN': '1 John', '2JN': '2 John',
  '3JN': '3 John', JUD: 'Jude', REV: 'Revelation',
}

// Real verse counts per book, to measure coverage.
const EXPECTED_VERSES = {
  MAT: 1071, MRK: 678, LUK: 1151, JHN: 879, ACT: 1007, ROM: 433, '1CO': 437, '2CO': 257,
  GAL: 149, EPH: 155, PHP: 104, COL: 95, '1TH': 89, '2TH': 47, '1TI': 113, '2TI': 83,
  TIT: 46, PHM: 25, HEB: 303, JAS: 108, '1PE': 105, '2PE': 61, '1JN': 105, '2JN': 13,
  '3JN': 14, JUD: 25, REV: 404,
}

const CHAPTER_COUNTS = {
  MAT: 28, MRK: 16, LUK: 24, JHN: 21, ACT: 28, ROM: 16, '1CO': 16, '2CO': 13, GAL: 6, EPH: 6,
  PHP: 4, COL: 4, '1TH': 5, '2TH': 3, '1TI': 6, '2TI': 4, TIT: 3, PHM: 1, HEB: 13, JAS: 5,
  '1PE': 5, '2PE': 3, '1JN': 5, '2JN': 1, '3JN': 1, JUD: 1, REV: 22,
}

// Barnes' own cross-reference abbreviations (as seen in "See Barnes on "Mt 1:3"").
// A stub is only resolved when its cited book matches the current book.
const ABBR = {
  MAT: ['Mt'], MRK: ['Mr', 'Mk'], LUK: ['Lu', 'Lk'], JHN: ['Joh', 'Jn'], ACT: ['Ac'],
  ROM: ['Ro'], '1CO': ['1Co'], '2CO': ['2Co'], GAL: ['Ga'], EPH: ['Eph'],
  PHP: ['Php', 'Phil'], COL: ['Col'], '1TH': ['1Th'], '2TH': ['2Th'], '1TI': ['1Ti'],
  '2TI': ['2Ti'], TIT: ['Tit'], PHM: ['Phm', 'Phile'], HEB: ['Heb'], JAS: ['Jas'],
  '1PE': ['1Pe'], '2PE': ['2Pe'], '1JN': ['1Jo', '1Jn'], '2JN': ['2Jo'], '3JN': ['3Jo'],
  JUD: ['Jude', 'Jud'], REV: ['Re', 'Rev'],
}

const HEAD = /^\s*(.+?) - Chapter (\d+) - Verse (\d+)\s*$/
const CHAP_ONLY = /^\s*(.+?) - Chapter (\d+)\s*$/
const SEP = /^\s*_{10,}\s*$/

async function loadSource() {
  const path = localFile || RAW_CACHE_FILE
  if (existsSync(path)) {
    console.log(`Using local file: ${path}`)
    return readFileSync(path, 'utf-8')
  }
  console.log(`Downloading ${SOURCE_URL} ...`)
  const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(90000) })
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)
  const text = await res.text()
  writeFileSync(RAW_CACHE_FILE, text)
  return text
}

// Book-title banners ("THE GOSPEL ACCORDING TO MARK") sit between books; once a
// verse block no longer ends at a separator line they would otherwise be
// appended to the previous book's last verse.
const TITLE_SET = new Set(Object.keys(TITLE_TO_CODE))

// Clean a segment's raw lines into a list of reflowed paragraphs.
function paragraphsOf(lines) {
  const out = []
  for (const p of lines.join('\n').split(/\n\s*\n/)) {
    const para = p.split('\n').map(l => l.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    if (!para) continue
    if (/^\{[A-Za-z0-9]{1,3}\}/.test(para)) continue                      // cross-reference / footnote list: {a} {1}
    if (/^[A-Za-z0-9 ]{3,30} Verses? [\d\-, ]+$/.test(para)) continue        // label like "Matthew Verses 2-16"
    if (TITLE_SET.has(para.replace(/[.\s]+$/, ''))) continue                // book-title banner
    const cleaned = para.replace(/\{[A-Za-z0-9]{1,3}\}/g, '').replace(/\s+/g, ' ').trim()
    if (cleaned) out.push(cleaned)
  }
  return out
}

// ---- Verse-marker and cross-reference patterns ---------------------------
// A paragraph that STARTS with "Verse 28." / "Verses 2-16:" / "Verses 5, 6." /
// "Verses 2,3 As it is written" / "Verse 21 His name" is a structural marker.
const NUMLIST = '\\d+(?:\\s*(?:[-\\u2013\\u2014,&]|and)\\s*\\d+)*'
const MARK = new RegExp('^Ver(?:ses?)?\\s+(' + NUMLIST + ')\\s*(?:[.:]|(?=\\s+[A-Z]))')
const STRIP_MARK = new RegExp('^Ver(?:ses?)?\\s+' + NUMLIST + '\\s*[.:]?\\s*')
const markRange = m => { const n = m[1].match(/\d+/g).map(Number); return [n[0], n[n.length - 1]] }

// Barnes' cross-reference pointers: See Barnes on "Mt 3:3"  /  See Barnes "1 Co 1:12"  /  See Barnes on "16:13"
const CITE = '(?:(?:[1-3]\\s?)?[A-Za-z]+\\.?\\s+)?\\d+:\\d+(?:\\s*[-\\u2013,]\\s*\\d+)*'
const SEEREF_SRC = 'See Barnes(?: on)?\\s+"?\\s*' + CITE + '(?:\\s*,?\\s*also\\s+' + CITE + ')*"?[.,;]?'
const SEEREF_G = new RegExp(SEEREF_SRC, 'gi')
const SEEREF_1 = new RegExp(SEEREF_SRC, 'i')
const TARGET = /See Barnes(?: on)?\s+"?\s*(?:((?:[1-3]\s?)?[A-Za-z]+)\.?\s+)?(\d+):(\d+)/i
const PLACEHOLDER_G = /No (?:specific )?Barnes text on this verse\.?/gi
const PLACEHOLDER_1 = /No (?:specific )?Barnes text on this verse/i

const REV_ABBR = {}
for (const [code, list] of Object.entries(ABBR)) for (const a of list) REV_ABBR[a.toLowerCase()] = code

// Set to false to leave cross-book "See Barnes on Mt 3:3" verses empty instead of
// pointing at the parallel passage's note (labelled as such).
const RESOLVE_CROSSBOOK = true
const RESOLVED_COPY_CAP = 2500   // resolved copies are truncated; the original keeps its full text

const probeIdx = args.indexOf('--probe')
const PROBE = probeIdx >= 0 ? { code: args[probeIdx + 1], ch: parseInt(args[probeIdx + 2], 10) } : null

function parseBarnes(text) {
  const lines = text.replace(/\r/g, '').split('\n')
  const store = {}            // code -> chapter -> verse -> text
  const prefaces = {}         // code -> chapter -> text  (book intros, chapter analyses)
  const stats = { duplicates: 0, placeholders: 0, stubsResolved: 0, stubsResolvedCross: 0, stubsDropped: 0, unknownTitles: {}, prefaceChars: 0, prefaceChapters: 0, droppedStubs: [], trace: [] }
  const stubs = []            // pure pointers awaiting resolution
  const rangeNotes = []       // { code, ch, A, B } notes that cover several verses
  const fates = {}            // `${code}|${ch}|${v}` -> what happened to that verse
  const setFate = (code, ch, v, f) => { fates[`${code}|${ch}|${v}`] = f }

  function addVerse(code, ch, v, t) {
    if (!t || t.replace(STRIP_MARK, '').trim().length < 3) { setFate(code, ch, v, 'empty-marker-only'); return }
    const hasPlace = PLACEHOLDER_1.test(t)
    const hasRef = SEEREF_1.test(t)
    if (hasPlace || hasRef) {
      // What is left once the marker, placeholder phrase and pointer are removed?
      const residual = t.replace(STRIP_MARK, '').replace(PLACEHOLDER_G, '').replace(SEEREF_G, '').replace(/\s+/g, ' ').trim()
      if (residual.length < 40) {
        // A pure placeholder or pure pointer -- no real note of its own.
        const tm = hasRef ? TARGET.exec(t) : null
        if (!tm) {
          if (hasRef) { stubs.push({ code, ch, v, unparsable: true, text: t }) }
          else { stats.placeholders++; setFate(code, ch, v, 'placeholder') }
          return
        }
        const abbr = tm[1] ? tm[1].replace(/\s+/g, '').toLowerCase() : null
        const tch = parseInt(tm[2], 10), tv = parseInt(tm[3], 10)
        const tcode = abbr ? REV_ABBR[abbr] : code
        if (tcode === code && tch === ch && tv === v) { stats.placeholders++; setFate(code, ch, v, 'placeholder (self-reference)'); return }
        stubs.push({ code, ch, v, abbr, tcode, tch, tv, text: t })
        return
      }
      // else: a real note that merely mentions a cross-reference -- keep it.
    }
    store[code] ??= {}
    store[code][ch] ??= {}
    const existing = store[code][ch][v]
    if (existing) {
      stats.duplicates++
      if (existing.length >= t.length) return
    }
    store[code][ch][v] = t
    setFate(code, ch, v, 'stored')
  }

  // Process one segment: a verse-heading block (headV = that verse) or a
  // bare chapter region with no per-verse headings (headV = null). Either
  // way, split on the block's own "Verse N." markers so no verse swallows
  // its neighbors, and divert long text that precedes the verse's own note
  // (book introductions, "ANALYSIS OF THE CHAPTER") into a preface.
  function processSegment(seg) {
    if (!seg) return
    const { code, ch, headV, lines: segLines } = seg
    const paras = paragraphsOf(segLines)
    if (!paras.length) return
    const tr = PROBE && PROBE.code === code && PROBE.ch === ch ? stats.trace : null
    if (tr) tr.push(`[segment] headV=${headV} paragraphs=${paras.length} chars=${paras.reduce((n, p) => n + p.length, 0)}`)

    let cur = headV
    let leadOpen = true
    const lead = []
    const pre = []
    const verses = new Map()
    const push = (v, p) => { if (!verses.has(v)) verses.set(v, []); verses.get(v).push(p) }
    const leadChars = () => lead.reduce((n, p) => n + p.length, 0)
    const segRanges = []

    function resolveLead(markerFound) {
      if (!leadOpen) return
      leadOpen = false
      if (!lead.length) return
      const leadText = lead.join('\n\n')
      let where
      if (headV === null) { pre.push(...lead); where = 'preface (bare chapter)' }
      else if (markerFound && leadText.length >= 400) { pre.push(...lead); where = 'preface (long text before own note)' }
      else if (!markerFound && /INTRODUCTION|ANALYSIS OF THE CHAPTER/i.test(leadText.slice(0, 300))) { pre.push(...lead); where = 'preface (intro pattern, no own marker)' }
      else { for (const p of lead) push(headV, p); where = `kept with verse ${headV}` }
      if (tr) tr.push(`   lead ${leadText.length} chars, markerFound=${markerFound} -> ${where}`)
    }

    for (const p of paras) {
      const m = MARK.exec(p)
      let newCur = cur
      let ownMarker = false
      if (m) {
        const [A, B] = markRange(m)
        if (cur === null) { if (A <= 10) { newCur = A; ownMarker = true } }
        else if (A <= cur && cur <= B) ownMarker = true          // this block's own verse (or a range covering it)
        else if (A > cur && A <= cur + 20) {
          if (leadOpen && leadChars() >= 400) { /* stray "Verse N." inside a long introduction: plain text */ }
          else newCur = A                                        // forward: next verse starts here
        }
        // else: backward reference or implausible jump, treat as plain text
        if (B > A && B - A <= 40 && (newCur === A || (ownMarker && cur === A))) segRanges.push([A, B])
        if (tr) tr.push(`   marker "${p.slice(0, 40)}" A=${A} B=${B} cur=${cur} -> ${ownMarker ? 'own' : newCur !== cur ? 'switch to ' + newCur : 'ignored'}`)
      } else if (headV !== null && leadOpen && cur === headV && new RegExp(`^${headV}\\.\\s+\\S`).test(p)) {
        ownMarker = true                                         // Matthew style: "1. The book of the generation"
        if (tr) tr.push(`   leading-number marker "${p.slice(0, 40)}" -> own`)
      }

      if (leadOpen) {
        if (ownMarker) resolveLead(true)
        else if (newCur !== cur) resolveLead(false)
        else { lead.push(p); continue }
      }
      cur = newCur
      if (cur === null) pre.push(p); else push(cur, p)
    }
    resolveLead(false)

    for (const [v, ps] of verses) addVerse(code, ch, v, ps.join('\n\n'))
    for (const [A, B] of segRanges) rangeNotes.push({ code, ch, A, B })
    if (pre.length) {
      prefaces[code] ??= {}
      const t = pre.join('\n\n')
      prefaces[code][ch] = prefaces[code][ch] ? prefaces[code][ch] + '\n\n' + t : t
      stats.prefaceChars += t.length
      stats.prefaceChapters++
    }
  }

  let seg = null
  for (const line of lines) {
    const h = HEAD.exec(line)
    if (h) {
      processSegment(seg)
      const title = h[1].replace(/\s+/g, ' ').trim()
      const code = TITLE_TO_CODE[title]
      if (!code) {
        stats.unknownTitles[title] = (stats.unknownTitles[title] || 0) + 1
        seg = null
      } else {
        seg = { code, ch: parseInt(h[2], 10), headV: parseInt(h[3], 10), lines: [] }
      }
      continue
    }
    const c = CHAP_ONLY.exec(line)
    if (c) {
      processSegment(seg)
      const code = TITLE_TO_CODE[c[1].replace(/\s+/g, ' ').trim()]
      seg = code ? { code, ch: parseInt(c[2], 10), headV: null, lines: [] } : null
      continue
    }
    if (SEP.test(line)) {
      // A separator line is only a visual rule. Some verse blocks contain one in
      // the middle, and everything after it (including the rest of a chapter in
      // the bare layout) belongs to the same segment -- so it is a paragraph
      // break, never an end of block. Segments end at the next heading.
      if (seg) { (seg.seps ??= []).push(seg.lines.length); seg.lines.push('') }
      continue
    }
    if (seg) seg.lines.push(line)
  }
  // The very last segment (Rev 22:21) runs to end-of-file, and the file has
  // trailing matter after Revelation. Cut it at the first separator that follows
  // some text, and say what was cut so it can be checked.
  if (seg) {
    let cut = -1
    for (const i of seg.seps || []) {
      if (seg.lines.slice(0, i).some(l => l.trim())) { cut = i; break }
    }
    if (cut >= 0) {
      const dropped = seg.lines.slice(cut)
      stats.eofTail = { lines: dropped.length, chars: dropped.join('\n').length, head: dropped.join(' ').replace(/[_\s]+/g, ' ').trim().slice(0, 300) }
      seg.lines = seg.lines.slice(0, cut)
    }
  }
  processSegment(seg)

  // Resolve pure pointers ('See Barnes on "Mt 1:3"') to the target verse's real
  // text. Up to 3 passes so a pointer to a pointer can chain. Cross-book pointers
  // (Luke -> Matthew parallels) carry a visible label saying so.
  const pending = stubs.slice()
  for (let pass = 0; pass < 3 && pending.length; pass++) {
    for (let i = pending.length - 1; i >= 0; i--) {
      const sx = pending[i]
      if (sx.unparsable) continue
      if (!sx.tcode) continue
      const crossBook = sx.tcode !== sx.code
      if (crossBook && !RESOLVE_CROSSBOOK) continue
      const target = store[sx.tcode]?.[sx.tch]?.[sx.tv]
      if (!target) continue
      let body = target.length > RESOLVED_COPY_CAP ? target.slice(0, RESOLVED_COPY_CAP).replace(/\s+\S*$/, '') + ' ...' : target
      if (crossBook) body = `[Barnes refers readers to his note on ${BOOK_NAMES[sx.tcode]} ${sx.tch}:${sx.tv}, the parallel passage.]\n\n${body}`
      store[sx.code] ??= {}
      store[sx.code][sx.ch] ??= {}
      if (!store[sx.code][sx.ch][sx.v]) {
        store[sx.code][sx.ch][sx.v] = body
        if (crossBook) { stats.stubsResolvedCross++; setFate(sx.code, sx.ch, sx.v, 'stub-resolved-crossbook') }
        else { stats.stubsResolved++; setFate(sx.code, sx.ch, sx.v, 'stub-resolved') }
      }
      pending.splice(i, 1)
    }
  }
  // Range notes ("Verses 6, 7.") are stored under their first verse; let the other
  // verses they cover find the note too -- but only where that verse has no note
  // and no block of its own (so headed layouts, where every verse has its own
  // heading, are untouched).
  stats.rangeFilled = 0
  for (const { code, ch, A, B } of rangeNotes) {
    const base = store[code]?.[ch]?.[A]
    if (!base) continue
    const body = base.length > RESOLVED_COPY_CAP ? base.slice(0, RESOLVED_COPY_CAP).replace(/\s+\S*$/, '') + ' ...' : base
    for (let v = A + 1; v <= B; v++) {
      if (store[code][ch][v] || fates[`${code}|${ch}|${v}`]) continue
      store[code][ch][v] = body
      setFate(code, ch, v, 'range-fill')
      stats.rangeFilled++
    }
  }
  for (const sx of pending) {
    let why
    if (sx.unparsable) why = 'stub-unparsable'
    else if (!sx.tcode) why = 'stub-book-not-in-NT'
    else if (sx.tcode !== sx.code && !RESOLVE_CROSSBOOK) why = 'stub-crossbook-disabled'
    else if (store[sx.code]?.[sx.ch]?.[sx.v]) continue
    else why = 'stub-target-missing'
    stats.stubsDropped++
    const label = sx.unparsable ? sx.text.slice(0, 60) : `${sx.abbr || '(same book)'} ${sx.tch}:${sx.tv}`
    setFate(sx.code, sx.ch, sx.v, `${why}: ${label}`)
    stats.droppedStubs.push({ code: sx.code, ch: sx.ch, v: sx.v, why, target: label, text: sx.text })
  }
  return { store, prefaces, stats, fates }
}

function coverageTable(store, fates) {
  console.log('\nBOOK   with Barnes text / expected   |  honest nulls  unresolved  no-block  |  accounted')
  console.log('--------------------------------------------------------------------------------------')
  const low = []
  for (const code of Object.keys(EXPECTED_VERSES)) {
    const exp = EXPECTED_VERSES[code]
    const have = Object.values(store[code] || {}).reduce((n, vs) => n + Object.keys(vs).length, 0)
    let nulls = 0, unresolved = 0
    for (const [k, f] of Object.entries(fates)) {
      if (!k.startsWith(code + '|')) continue
      if (f.startsWith('placeholder') || f === 'empty-marker-only') nulls++
      else if (f.startsWith('stub-') && f !== 'stub-resolved' && f !== 'stub-resolved-crossbook') unresolved++
    }
    const noBlock = Math.max(0, exp - have - nulls - unresolved)
    const accounted = Math.round(((have + nulls) / exp) * 100)
    const flag = accounted < 90 ? '   <-- LOW' : ''
    if (accounted < 90) low.push(code)
    console.log(`${code.padEnd(5)}  ${String(have).padStart(5)} / ${String(exp).padEnd(5)} ${String(Math.round(have / exp * 100)).padStart(3)}%       |  ${String(nulls).padStart(6)}  ${String(unresolved).padStart(10)}  ${String(noBlock).padStart(8)}  |  ${String(accounted).padStart(4)}%${flag}`)
  }
  console.log('(honest nulls = Barnes wrote nothing on that verse; "accounted" = text + honest nulls)')
  return low
}

async function main() {
  const text = await loadSource()
  const { store, prefaces, stats, fates } = parseBarnes(text)

  console.log(`\nParsed ${Object.keys(store).length} books.`)
  console.log(`Placeholders skipped ("No (specific) Barnes text on this verse"): ${stats.placeholders}`)
  console.log(`Pointers resolved: same-book ${stats.stubsResolved}, cross-book (labelled) ${stats.stubsResolvedCross}   dropped (unresolvable): ${stats.stubsDropped}`)
  console.log(`Duplicate verse blocks (kept the longer): ${stats.duplicates}`)
  console.log(`Verses filled from a multi-verse range note (e.g. "Verses 6, 7."): ${stats.rangeFilled}`)
  if (stats.eofTail) console.log(`End-of-file tail cut after Rev 22:21: ${stats.eofTail.lines} lines, ${stats.eofTail.chars} chars. Starts: "${stats.eofTail.head}"`)
  console.log(`Prefaces (book intros / chapter analyses) diverted out of verses: ${stats.prefaceChapters} chapters, ${(stats.prefaceChars / 1000).toFixed(0)}k chars`)
  if (Object.keys(stats.unknownTitles).length) {
    console.log('UNKNOWN book titles in verse headings (need adding to TITLE_TO_CODE):')
    for (const [t, n] of Object.entries(stats.unknownTitles)) console.log(`   ${n} x "${t}"`)
  }
  const low = coverageTable(store, fates)


  // ---- DIAGNOSTICS: why are verses missing? ----
  {
    const reasonOf = f => f.startsWith('stub-') && f !== 'stub-resolved' ? f.split(':')[0] : f
    console.log('\nDROPPED-STUB REASONS (overall):')
    const byWhy = {}
    for (const d of stats.droppedStubs) byWhy[d.why] = (byWhy[d.why] || 0) + 1
    for (const [w, n] of Object.entries(byWhy).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${w}`)
    console.log('  examples (book ch:v -> target | text):')
    const seen = {}
    for (const d of stats.droppedStubs) {
      seen[d.why] = (seen[d.why] || 0) + 1
      if (seen[d.why] <= 4) console.log(`    [${d.why}] ${d.code} ${d.ch}:${d.v} -> "${d.target}" | ${d.text.slice(0, 110)}`)
    }
    console.log('\nPER-BOOK VERSE FATES for books under 97% coverage (heading/marker blocks seen):')
    for (const code of Object.keys(EXPECTED_VERSES)) {
      const have = Object.values(store[code] || {}).reduce((n, vs) => n + Object.keys(vs).length, 0)
      if (have / EXPECTED_VERSES[code] >= 0.97) continue
      const counts = {}
      let seenBlocks = 0
      for (const [k, f] of Object.entries(fates)) {
        if (!k.startsWith(code + '|')) continue
        seenBlocks++
        const r = reasonOf(f)
        counts[r] = (counts[r] || 0) + 1
      }
      const noBlock = Math.max(0, EXPECTED_VERSES[code] - seenBlocks)
      const parts = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r}=${n}`)
      console.log(`  ${code}: ${parts.join('  ')}  no-block-at-all~${noBlock}`)
    }
  }

  // --probe CODE CHAPTER : trace + per-verse fate for one chapter
  if (PROBE) {
    const { code, ch } = PROBE
    console.log(`\nPROBE ${code} ${ch} -- segment trace:`)
    for (const l of stats.trace.slice(0, 80)) console.log('  ' + l)
    if (stats.trace.length > 80) console.log(`  ... (${stats.trace.length - 80} more trace lines)`)
    console.log(`PROBE ${code} ${ch} -- per-verse fate:`)
    const vs = Object.keys(fates).filter(k => k.startsWith(`${code}|${ch}|`)).map(k => parseInt(k.split('|')[2], 10)).sort((a, b) => a - b)
    for (const v of vs) {
      const t = store[code]?.[ch]?.[v]
      console.log(`  ${code} ${ch}:${v}  ${fates[`${code}|${ch}|${v}`]}  ${t ? t.length + ' chars: ' + t.slice(0, 60).replace(/\s+/g, ' ') : ''}`)
    }
  }

  // --gaps CODE : which verses/chapters are missing, per chapter
  const gi = args.indexOf('--gaps')
  if (gi >= 0) {
    const code = args[gi + 1]
    const chCount = CHAPTER_COUNTS[code]
    console.log(`\nGAPS for ${code} (verse numbers missing below the highest verse found in each chapter):`)
    const squash = nums => { const out = []; let i = 0; while (i < nums.length) { let j = i; while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++; out.push(i === j ? `${nums[i]}` : `${nums[i]}-${nums[j]}`); i = j + 1 } return out.join(',') }
    for (let ch = 1; ch <= chCount; ch++) {
      const have = Object.keys(store[code]?.[ch] || {}).map(Number).sort((a, b) => a - b)
      if (!have.length) { console.log(`  ch ${ch}: NOTHING stored`); continue }
      const max = have[have.length - 1]
      const missing = []
      for (let v = 1; v <= max; v++) if (!have.includes(v)) missing.push(v)
      if (missing.length) console.log(`  ch ${ch}: highest=${max} have=${have.length} missing: ${squash(missing)}`)
    }
  }

  // Diagnostic: very long verse blocks usually mean book/NT INTRODUCTIONS got
  // swallowed into a verse (e.g. Mt 1:x), which would make a verse lookup
  // return an introduction instead of that verse's note.
  {
    const all = []
    for (const code of Object.keys(store))
      for (const ch of Object.keys(store[code]))
        for (const v of Object.keys(store[code][ch]))
          all.push({ code, ch, v, len: store[code][ch][v].length, head: store[code][ch][v].slice(0, 70).replace(/\s+/g, ' ') })
    all.sort((a, b) => b.len - a.len)
    console.log('\nLONGEST 15 VERSE BLOCKS (introductions hiding in verses show up here):')
    for (const b of all.slice(0, 15)) console.log(`  ${b.code} ${b.ch}:${b.v}  ${String(b.len).padStart(6)} chars  "${b.head}"`)
    const over = all.filter(b => b.len > 8000).length
    console.log(`  (${over} blocks are over 8,000 chars; ${all.filter(b => /^INTRODUCTION/i.test(b.head)).length} begin with "INTRODUCTION")`)
  }

  if (isTest) {
    const show = (code, ch, v, label) => {
      const t = store[code]?.[ch]?.[v]
      console.log(`\n=== ${label} ===`)
      console.log(t ? t.slice(0, 500) + (t.length > 500 ? ' ...' : '') + `\n[total ${t.length} chars]` : '(none found)')
    }
    show('ROM', 8, 28, 'Romans 8:28')
    show('MAT', 1, 2, 'Matthew 1:2 (stub -> resolved from 1:3 if it worked)')
    show('JHN', 3, 16, 'John 3:16')
    console.log('\nTEST MODE: nothing written.')
    if (low.length) console.log(`Books flagged LOW: ${low.join(', ')} -- see notes at top of the script.`)
    return
  }

  mkdirSync(OUT_DIR, { recursive: true })
  let totalBytes = 0
  for (const code of Object.keys(store)) {
    const chapters = Object.keys(store[code]).map(Number).sort((a, b) => a - b)
      .map(ch => {
        const o = { chapter: ch, verses: store[code][ch] }
        if (prefaces[code]?.[ch]) o.preface = prefaces[code][ch]
        return o
      })
    const body = JSON.stringify({
      book: code,
      name: BOOK_NAMES[code] || code,
      source: "Barnes' Notes on the New Testament (Albert Barnes, public domain, via CCEL)",
      chapters,
    })
    writeFileSync(`${OUT_DIR}/${code}.json`, body)
    totalBytes += body.length
    console.log(`  wrote ${OUT_DIR}/${code}.json  ${(body.length / 1024).toFixed(0)} KB`)
  }
  console.log(`\nDone. ${Object.keys(store).length} files, ${(totalBytes / 1024 / 1024).toFixed(1)} MB total in ./${OUT_DIR}/`)
  if (low.length) console.log(`NOTE: ${low.join(', ')} have LOW coverage -- bring that to Claude before uploading.`)
}

main()
