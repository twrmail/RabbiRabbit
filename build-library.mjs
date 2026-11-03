// RabbiRabbit data standardization -- step 2: build library/ beside data/.
//
//   node build-library.mjs           DRY RUN (default): reads everything, checks parity, writes only build-report.txt
//   node build-library.mjs --write   builds library/ (only if the dry-run checks pass with 0 errors)
//
// Rules this script keeps:
//   * It NEVER writes, moves or deletes anything under data/.
//   * It refuses to run --write if library/ already exists (delete library/ yourself to rebuild).
//   * It builds into library.tmp/ and only renames it to library/ after every check passes.
//   * Source text is never edited. Only file names, the top-level `book` field and the Bible file shape change.
//   * Every copied record is re-read from the written JSON and compared with the original (content, not just counts).
//   * Nothing is committed to GitHub. That is Tom's choice afterwards.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const WRITE = process.argv.includes('--write')
const CODES = 'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAH HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV'.split(' ')
const ALIAS = { DEUT:'DEU', JOSH:'JOS', JUDG:'JDG', RUTH:'RUT', '1SAM':'1SA', '2SAM':'2SA', '1KGS':'1KI', '2KGS':'2KI', '1CHR':'1CH', '2CHR':'2CH', EZRA:'EZR', ESTH:'EST', PS:'PSA', PROV:'PRO', ECCL:'ECC', SONG:'SNG', EZEK:'EZK', JOEL:'JOL', AMOS:'AMO', OBAD:'OBA', JONAH:'JON', ZEPH:'ZEP', ZECH:'ZEC', ACTS:'ACT', '1COR':'1CO', '2COR':'2CO', PHIL:'PHP', '1THESS':'1TH', '2THESS':'2TH', '1TIM':'1TI', '2TIM':'2TI', PHLM:'PHM', '1PET':'1PE', '2PET':'2PE', '1JHN':'1JN', '2JHN':'2JN', '3JHN':'3JN', JUDE:'JUD', NAM:'NAH' }
const canon = c => (CODES.includes(c) ? c : (ALIAS[c] || null))
const order = c => CODES.indexOf(c)

const OUT = WRITE ? 'library.tmp' : null
const errors = []        // anything here blocks --write
const report = []        // per-source results
const manifestSources = []
const written = []       // { path, bytes, sha }

const sha = s => crypto.createHash('sha256').update(s).digest('hex')
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

function emit(rel, obj, raw = null) {
  const text = raw !== null ? raw : JSON.stringify(obj)
  const back = raw !== null ? null : JSON.parse(text)          // re-read what would be written
  if (WRITE) {
    const full = path.join(OUT, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, text)
    const onDisk = fs.readFileSync(full, 'utf8')
    if (onDisk !== text) errors.push(`write check failed: ${rel}`)
  }
  written.push({ path: 'library/' + rel, bytes: Buffer.byteLength(text), sha: sha(text).slice(0, 16) })
  return back
}

// ---------- source table ----------
const PER_BOOK = [
  { id:'mhc',       name:'Matthew Henry',                    from:'data/commentary/MHC',       to:'commentary/MHC',       license:'public domain', status:'active',     servable:true,  defaultSource:"Matthew Henry's Commentary (public domain; origin and edition not recorded in the original files)" },
  { id:'jfb',       name:'Jamieson, Fausset & Brown',        from:'data/commentary/JFB',       to:'commentary/JFB',       license:'public domain', status:'active',     servable:true,  defaultSource:'Jamieson, Fausset & Brown Commentary (public domain; origin not recorded in the original files)' },
  { id:'calvin', scope:'partial-by-design',    name:"Calvin's Commentaries",            from:'data/commentary/Calvin',    to:'commentary/Calvin',    license:'public domain', status:'active',     servable:true,  defaultSource:"Calvin's Commentaries (public domain; origin not recorded in the original files)", declared:'47-48 books (Calvin did not comment on every book)' },
  { id:'scofield', scope:'partial-by-design',  name:'Scofield Reference Notes (1917)',  from:'data/commentary/Scofield',  to:'commentary/Scofield',  license:'public domain', status:'incomplete', servable:true,  declared:'selective notes' },
  { id:'wesley', scope:'incomplete',    name:"Wesley's Explanatory Notes",       from:'data/commentary/Wesley',    to:'commentary/Wesley',    license:'public domain', status:'incomplete', servable:true,  note:'Psalms 100-150 missing; 2 John stored under chapter 5 (copied as-is, fix later as a separate, reviewed change)' },
  { id:'spurgeon', scope:'partial-by-design',  name:'Spurgeon, Treasury of David',      from:'data/commentary/TDavid',    to:'commentary/Spurgeon',  license:'public domain (conversion CC0)', status:'active', servable:true, declared:'Psalms only' },
  { id:'barnes-nt', scope:'partial-by-design', name:"Barnes' Notes (New Testament only)", from:'data/commentary/Barnes_NT', to:'commentary/Barnes-NT', license:'public domain', status:'active',     servable:true,  declared:'27 New Testament books only; never present as whole-Bible Barnes' },
  { id:'tyndale', scope:'partial-by-design',   name:'Tyndale Open Study Notes',         from:'data/commentary/Tyndale',   to:'commentary/Tyndale',   license:'CC BY-SA 4.0, (c) 2022 Tyndale House Publishers; attribution and share-alike required', status:'active', servable:true, declared:'selective notes' },
  { id:'xref',      name:'OpenBible cross-references',       from:'data/xref',                 to:'xref',                 license:'CC BY (OpenBible.info)', status:'active', servable:true },
]
const LEGACY = [
  { id:'barnes-legacy', name:"Barnes' Notes (old whole-Bible file)", from:'data/commentary/Barnes/Barnes_commentary.json',   to:'_retired/Barnes',  reason:'truncated: almost every chapter is exactly 2,000 characters' },
  { id:'clarke',        name:'Adam Clarke (old file)',               from:'data/commentary/Clarke/Clarke_commentary.json',   to:'_retired/Clarke',  reason:'truncated: almost every chapter is exactly 2,000 characters' },
  { id:'vincent',       name:"Vincent's Word Studies (old file)",    from:'data/commentary/Vincent/Vincent_commentary.json', to:'_retired/Vincent', reason:'truncated: every chapter is exactly 2,000 characters' },
  { id:'meyer',         name:"Meyer's NT Commentary (old file)",     from:'data/commentary/Meyer/Meyer_commentary.json',     to:'_retired/Meyer',   reason:'truncated to 2,000 characters per chapter; Greek text garbled' },
]
const BIBLES = [
  { id:'bsb', from:'data/bsb/bsb.json', to:'bible/BSB', abbr:'BSB' },
  { id:'web', from:'data/web.json',     to:'bible/WEB', abbr:'WEB' },
  { id:'kjv', from:'data/kjv.json',     to:'bible/KJV', abbr:'KJV' },
  { id:'asv', from:'data/asv.json',     to:'bible/ASV', abbr:'ASV' },
]
const SINGLES = [
  { id:'strongs-hebrew', from:'data/dict/strongs_hebrew.json',         to:'lexicon/strongs_hebrew.json' },
  { id:'strongs-greek',  from:'data/dict/strongs_greek.json',          to:'lexicon/strongs_greek.json' },
  { id:'concordance',    from:'data/dict/strongs_concordance.json',    to:'lexicon/strongs_concordance.json' },
  { id:'naves',          from:'data/dict/naves/naves_topics.json',     to:'topics/naves.json' },
  { id:'topic-scores',   from:'data/dict/openbible_topic_scores.json', to:'topics/openbible_topic_scores.json' },
  { id:'characters',     from:'data/dict/characters.json',             to:'people/characters.json', note:'contains Theographic Bible Metadata (CC BY-SA 4.0): needs attribution' },
  { id:'xref-seed',      from:'data/dict/xref_seed_pool.json',         to:'seed/xref_seed_pool.json' },
]

// ---------- per-book sources ----------
function bodyOf(d) { return d.chapters !== undefined ? d.chapters : d.refs }
function isEmpty(d) { const b = bodyOf(d); return b === undefined || (Array.isArray(b) ? b.length === 0 : Object.keys(b).length === 0) }

function copyPerBook(s) {
  const r = { id: s.id, from: s.from, to: 'library/' + s.to, filesIn: 0, filesOut: 0, skipped: [], renamed: [], bookFieldChanges: [], contentHashIn: '', contentHashOut: '', mismatches: [] }
  if (!fs.existsSync(s.from)) { errors.push(`${s.id}: ${s.from} not found`); report.push(r); return }
  const files = fs.readdirSync(s.from).filter(f => f.endsWith('.json')).sort()
  const byCode = new Map()
  for (const f of files) {
    r.filesIn++
    const stem = f.slice(0, -5), code = canon(stem)
    if (!code) { r.skipped.push(`${f}: not a single-book file (not copied; stays in data/)`); continue }
    if (byCode.has(code)) { errors.push(`${s.id}: two files map to ${code}: ${byCode.get(code)} and ${f}`); continue }
    byCode.set(code, f)
  }
  const hin = [], hout = [], present = []
  for (const code of [...byCode.keys()].sort((a, b) => order(a) - order(b))) {
    const f = byCode.get(code), d = read(path.join(s.from, f))
    if (isEmpty(d)) { r.skipped.push(`${f}: empty placeholder (no chapters), not copied`); continue }
    if (f !== code + '.json') r.renamed.push(`${f} -> ${code}.json`)
    const out = { book: code, sourceId: s.id }
    if (d.book !== undefined && d.book !== code) { out.originalBook = d.book; r.bookFieldChanges.push(`${f}: book "${d.book}" -> "${code}"`) }
    for (const [k, v] of Object.entries(d)) if (k !== 'book') out[k] = v
    if (out.source === undefined) out.source = s.defaultSource || s.name
    const back = emit(`${s.to}/${code}.json`, out)
    const bin = bodyOf(d), bout = bodyOf(back)
    if (!same(bin, bout)) r.mismatches.push(`${code}: content differs after writing`)
    for (const [k, v] of Object.entries(d)) if (k !== 'book' && !same(v, back[k])) r.mismatches.push(`${code}: field ${k} differs`)
    hin.push(code + JSON.stringify(bin)); hout.push(code + JSON.stringify(bout))
    r.filesOut++; present.push(code)
  }
  r.contentHashIn = sha(hin.join('\n')).slice(0, 16); r.contentHashOut = sha(hout.join('\n')).slice(0, 16)
  r.books = present.length; r.booksMissing = CODES.filter(c => !present.includes(c))
  if (r.mismatches.length) errors.push(`${s.id}: ${r.mismatches.length} content mismatches`)
  report.push(r)
  manifestSources.push({ id: s.id, displayName: s.name, kind: s.id === 'xref' ? 'xref' : 'commentary', folder: 'library/' + s.to, shape: s.id === 'xref' ? 'xref per book' : shapeName(s), license: s.license, status: s.status, scope: s.scope || 'full', servable: s.servable, complete: null, declared: s.declared || 'all 66 books', coverage: { books: present.length, of: 66, missing: r.booksMissing }, booksPresent: present, note: s.note || undefined, originalLocation: s.from })
}
function shapeName(s) { return { wesley: 'object of chapter strings (unchanged)', mhc: 'chapter text', jfb: 'chapter text', calvin: 'chapter text', scofield: 'chapter text' }[s.id] || 'verse-keyed' }

// ---------- retired whole-Bible arrays ----------
function splitLegacy(s) {
  const r = { id: s.id, from: s.from, to: 'library/' + s.to, recordsIn: 0, filesOut: 0, chaptersIn: 0, chaptersOut: 0, codeChanges: [], skipped: [], mismatches: [] }
  if (!fs.existsSync(s.from)) { errors.push(`${s.id}: ${s.from} not found`); report.push(r); return }
  const arr = read(s.from), seen = new Set(), present = []
  for (const b of arr) {
    r.recordsIn++; r.chaptersIn += (b.chapters || []).length
    const code = canon(b.book)
    if (!code) { errors.push(`${s.id}: unknown book code ${b.book}`); continue }
    if (seen.has(code)) { errors.push(`${s.id}: book ${code} appears twice`); continue }
    seen.add(code)
    if (!(b.chapters || []).length) { r.skipped.push(`${b.book}: no chapters in the original`); continue }
    if (code !== b.book) r.codeChanges.push(`${b.book} -> ${code}`)
    const out = { book: code, sourceId: s.id, status: 'retired', servable: false, retiredReason: s.reason }
    if (code !== b.book) out.originalBook = b.book
    for (const [k, v] of Object.entries(b)) if (k !== 'book') out[k] = v
    const back = emit(`${s.to}/${code}.json`, out)
    if (!same(b.chapters, back.chapters)) r.mismatches.push(`${code}: chapters differ`)
    r.chaptersOut += back.chapters.length; r.filesOut++; present.push(code)
  }
  if (r.mismatches.length) errors.push(`${s.id}: ${r.mismatches.length} mismatches`)
  report.push(r)
  manifestSources.push({ id: s.id, displayName: s.name, kind: 'commentary', folder: 'library/' + s.to, shape: 'chapter text', status: 'retired', scope: 'retired', servable: false, complete: false, retiredReason: s.reason, readByWorker: 'never', coverage: { books: present.length, chapters: r.chaptersOut, note: 'chapter count says nothing about completeness: the text of each chapter is cut short' }, booksPresent: present, originalLocation: s.from })
}

// ---------- Bibles ----------
function bibleRows(d) {
  // -> [{code, chapter, verse, text}] from either input shape
  const rows = []
  if (Array.isArray(d.books)) {
    for (const b of d.books) for (const c of b.chapters) for (const v of c.verses) rows.push({ code: b.code, chapter: c.chapter, verse: v.verse, text: v.text })
  } else {
    for (const [code, chs] of Object.entries(d.books)) for (const [ch, vs] of Object.entries(chs)) for (const [v, t] of Object.entries(vs)) rows.push({ code, chapter: +ch, verse: +v, text: t })
  }
  return rows
}
function splitBible(s) {
  const r = { id: s.id, from: s.from, to: 'library/' + s.to, versesIn: 0, versesOut: 0, books: 0, emptyVerses: [], placeholderVerses: [], mismatches: [] }
  if (!fs.existsSync(s.from)) { errors.push(`${s.id}: ${s.from} not found`); report.push(r); return }
  const d = read(s.from), rows = bibleRows(d)
  r.versesIn = rows.length
  const meta = {}
  for (const [k, v] of Object.entries(d)) if (k !== 'books') meta[k] = v
  const books = new Map()
  for (const x of rows) {
    const code = canon(x.code)
    if (!code) { errors.push(`${s.id}: unknown book code ${x.code}`); continue }
    if (!books.has(code)) books.set(code, new Map())
    const chs = books.get(code)
    if (!chs.has(x.chapter)) chs.set(x.chapter, {})
    const vs = chs.get(x.chapter)
    if (vs[String(x.verse)] !== undefined) { errors.push(`${s.id}: duplicate verse ${code} ${x.chapter}:${x.verse}`); continue }
    vs[String(x.verse)] = x.text
    if (!String(x.text).trim()) r.emptyVerses.push(`${code} ${x.chapter}:${x.verse}`)
    else if (/^\[\s*\]$/.test(String(x.text).trim())) r.placeholderVerses.push(`${code} ${x.chapter}:${x.verse} "${x.text}"`)
  }
  for (const code of [...books.keys()].sort((a, b) => order(a) - order(b))) {
    const chapters = [...books.get(code).entries()].sort((a, b) => a[0] - b[0]).map(([chapter, verses]) => ({ chapter, verses }))
    const back = emit(`${s.to}/${code}.json`, { ...meta, translationId: s.abbr, book: code, chapters })
    for (const c of back.chapters) r.versesOut += Object.keys(c.verses).length
    r.books++
  }
  // verse-by-verse content check against the ORIGINAL file, reading back what was written
  const outIndex = new Map()
  for (const code of books.keys()) {
    const text = WRITE ? fs.readFileSync(path.join(OUT, s.to, code + '.json'), 'utf8') : null
    const obj = text ? JSON.parse(text) : { chapters: [...books.get(code).entries()].map(([chapter, verses]) => ({ chapter, verses })) }
    for (const c of obj.chapters) for (const [v, t] of Object.entries(c.verses)) outIndex.set(`${code}|${c.chapter}|${v}`, t)
  }
  for (const x of rows) { const t = outIndex.get(`${canon(x.code)}|${x.chapter}|${x.verse}`); if (t !== x.text) r.mismatches.push(`${x.code} ${x.chapter}:${x.verse}`) }
  if (r.versesIn !== r.versesOut) errors.push(`${s.id}: verses in ${r.versesIn} != out ${r.versesOut}`)
  if (r.mismatches.length) errors.push(`${s.id}: ${r.mismatches.length} verse text mismatches`)
  report.push(r)
  manifestSources.push({ id: s.id, displayName: meta.name || meta.translation || s.abbr, kind: 'bible', folder: 'library/' + s.to, shape: 'bible per book: chapters[{chapter, verses{"n": text}}]', license: meta.license || 'UNKNOWN', status: 'active', servable: true, complete: null, booksPresent: [...books.keys()], verses: r.versesOut, emptyVersesInSource: r.emptyVerses, placeholderVersesInSource: r.placeholderVerses, note: s.id === 'asv' ? 'Backtick-apostrophe pairs (`be\') mark the ASV words printed in italics (supplied by the translators); kept as in the source. 3 John 1:15 is a "[]" placeholder: its words are printed at the end of 1:14.' : undefined, originalLocation: s.from })
}

// ---------- single files (byte-for-byte) and the overview map ----------
function copySingle(s) {
  const r = { id: s.id, from: s.from, to: 'library/' + s.to }
  if (!fs.existsSync(s.from)) { errors.push(`${s.id}: ${s.from} not found`); report.push(r); return }
  const raw = fs.readFileSync(s.from, 'utf8')
  emit(s.to, null, raw)
  if (WRITE && fs.readFileSync(path.join(OUT, s.to), 'utf8') !== raw) errors.push(`${s.id}: copy differs`)
  r.bytes = Buffer.byteLength(raw); r.sha = sha(raw).slice(0, 16); r.check = 'byte-for-byte copy'
  report.push(r)
  manifestSources.push({ id: s.id, kind: 'reference', folder: 'library/' + s.to, status: 'active', servable: true, note: s.note, originalLocation: s.from, sha256_16: r.sha })
}
function copyOverviewMap() {
  const from = 'data/dict/book_overview_map.json', to = 'maps/book_overview_map.json'
  const r = { id: 'overview-map', from, to: 'library/' + to, keyChanges: [], mismatches: [] }
  const d = read(from), out = {}
  for (const [k, v] of Object.entries(d)) {
    if (k.startsWith('_')) { out[k] = v; continue }
    const code = canon(k)
    if (!code) { errors.push(`overview-map: unknown key ${k}`); continue }
    if (out[code] !== undefined) { errors.push(`overview-map: two keys map to ${code}`); continue }
    if (code !== k) r.keyChanges.push(`${k} -> ${code}`)
    out[code] = v
  }
  const back = emit(to, out)
  for (const [k, v] of Object.entries(d)) { const code = k.startsWith('_') ? k : canon(k); if (!same(v, back[code])) r.mismatches.push(k) }
  if (r.mismatches.length) errors.push(`overview-map: ${r.mismatches.length} mismatches`)
  r.books = Object.keys(out).filter(k => !k.startsWith('_')).length
  report.push(r)
  manifestSources.push({ id: 'overview-map', kind: 'map', folder: 'library/' + to, status: 'active', servable: true, note: 'keys changed to the standard book codes', originalLocation: from })
}

// ---------- comparisons for files that are NOT copied ----------
function compareNotCopied() {
  const notes = []
  // JFB whole-Bible files vs the per-book JFB files
  for (const f of ['JFB_commentary.json', 'JFB_commentary_backup.json']) {
    const p = 'data/commentary/JFB/' + f
    if (!fs.existsSync(p)) { notes.push(`${p}: not present`); continue }
    const arr = read(p); let identical = 0, different = 0, missing = 0, exactly2000 = 0
    for (const b of arr) {
      const code = canon(b.book), pb = code && `data/commentary/JFB/${code}.json`
      for (const c of b.chapters || []) if ((c.commentary || '').length === 2000) exactly2000++
      if (!pb || !fs.existsSync(pb)) { missing++; continue }
      if (same(b.chapters, read(pb).chapters)) identical++; else different++
    }
    notes.push(`${p}: not copied. Books identical to the per-book files: ${identical}, different: ${different}, no per-book file: ${missing}; chapters exactly 2,000 chars: ${exactly2000}`)
  }
  // misplaced Tyndale vs commentary/Tyndale
  if (fs.existsSync('data/Tyndale')) {
    let identical = 0, different = []
    for (const f of fs.readdirSync('data/Tyndale').filter(f => f.endsWith('.json'))) {
      const code = canon(f.slice(0, -5)), q = `data/commentary/Tyndale/${code}.json`
      if (fs.existsSync(q) && same(read(path.join('data/Tyndale', f)).chapters, read(q).chapters)) identical++; else different.push(f)
    }
    notes.push(`data/Tyndale: not copied (duplicate). Identical to data/commentary/Tyndale: ${identical}; different or unmatched: ${different.length ? different.join(', ') : 'none'}`)
  }
  // cross-refs.json vs data/xref/
  if (fs.existsSync('data/cross-refs.json')) {
    const whole = read('data/cross-refs.json').refs.map(x => [x.from.book, x.from.chapter, x.from.verse, x.to.book, x.to.chapter, x.to.verse, x.votes].join('|')).sort()
    const per = []
    for (const f of fs.readdirSync('data/xref').filter(f => f.endsWith('.json'))) { const d = read(path.join('data/xref', f)); for (const x of d.refs) per.push([d.book, x.fc, x.fv, x.tb, x.tc, x.tv, x.v].join('|')) }
    per.sort()
    notes.push(`data/cross-refs.json: not copied. ${whole.length} refs vs ${per.length} in data/xref/; ${same(whole, per) ? 'IDENTICAL content' : 'DIFFERENT content (keep both until explained)'}`)
  }
  return notes
}

// ---------- run ----------
if (!fs.existsSync('data')) { console.error('Run this from the repo root (the folder that contains data/).'); process.exit(1) }
if (WRITE && fs.existsSync('library')) { console.error('library/ already exists. Nothing was written. Delete library/ first if you want to rebuild it.'); process.exit(1) }
if (WRITE && fs.existsSync('library.tmp')) fs.rmSync('library.tmp', { recursive: true })

PER_BOOK.forEach(copyPerBook)
LEGACY.forEach(splitLegacy)
BIBLES.forEach(splitBible)
SINGLES.forEach(copySingle)
copyOverviewMap()
const notCopied = compareNotCopied()

function snapshotOf(dir) { const out = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((x, y) => x.name < y.name ? -1 : 1)) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (!e.name.endsWith('.gitkeep')) out.push(p + ' ' + sha(fs.readFileSync(p))) } }; walk(dir); return sha(out.join('\n')).slice(0, 16) }
const manifest = { schemaVersion: 1, generatedBy: 'build-library.mjs', sourceSnapshot: snapshotOf('data'), root: 'library/', bookCodes: CODES.join(' '),
  note: 'Coverage fields are measured from the files written. servable=false means the Worker must never serve it. complete=null means not yet judged against the declared coverage. scope: full = meant to cover all 66 books; partial-by-design = the author did not write on every book (or wrote selective notes); incomplete = known gaps in our copy; retired = damaged, never served. Bible verses: a key with an empty string means the edition prints no text for that verse (it omits it); a missing key means the edition has no such verse number.', sources: manifestSources }
if (WRITE) emit('manifest.json', manifest)

const lines = []
lines.push(`RabbiRabbit library build -- ${WRITE ? 'WRITE' : 'DRY RUN (nothing written)'} -- ${new Date().toISOString()}`)
lines.push(`Errors: ${errors.length}${errors.length ? '  <-- library/ will NOT be created' : ''}`)
errors.forEach(e => lines.push('  ERROR ' + e))
lines.push('')
for (const r of report) {
  lines.push(`== ${r.id}: ${r.from} -> ${r.to}`)
  for (const [k, v] of Object.entries(r)) {
    if (['id', 'from', 'to'].includes(k)) continue
    if (Array.isArray(v)) { if (v.length) lines.push(`   ${k} (${v.length}): ${v.slice(0, 12).join('; ')}${v.length > 12 ? ' ...' : ''}`) }
    else lines.push(`   ${k}: ${v}`)
  }
  if (r.contentHashIn !== undefined) lines.push(`   content parity: ${r.contentHashIn === r.contentHashOut ? 'IDENTICAL' : 'DIFFERENT'}`)
}
lines.push('', '== Files left in data/ and not copied (compared, for the record):')
notCopied.forEach(n => lines.push('   ' + n))
const total = written.reduce((n, w) => n + w.bytes, 0)
lines.push('', `Files ${WRITE ? 'written' : 'that would be written'}: ${written.length}, ${(total / 1e6).toFixed(1)} MB`)

if (WRITE) {
  if (errors.length) { lines.push('', 'Errors found: library.tmp/ left for inspection; library/ NOT created.') }
  else {
    fs.writeFileSync(path.join(OUT, 'PARITY-REPORT.txt'), lines.join('\n') + '\n')
    fs.renameSync(OUT, 'library')
    lines.push('', 'library/ created. data/ was not touched. Nothing was committed.')
  }
}
fs.writeFileSync('build-report.txt', lines.join('\n') + '\n')
console.log(lines.slice(0, 2 + errors.length).join('\n'))
console.log(`Full report: build-report.txt${WRITE && !errors.length ? ' (also library/PARITY-REPORT.txt)' : ''}`)
if (errors.length) process.exit(1)