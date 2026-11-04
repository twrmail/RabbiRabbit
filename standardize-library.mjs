// RabbiRabbit data standardization -- step 1, READ-ONLY.
// Run from the repo root in the Codespace:
//   node standardize-library.mjs --inventory   -> writes library-inventory.json + library-inventory.txt
//   node standardize-library.mjs --plan        -> prints what step 2 WOULD create under library/ (writes nothing)
// It never changes, moves or deletes anything under data/. Step 2 (--build) is not in this file on purpose:
// it comes after Tom and the reviewer read the inventory.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const CODES = 'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAH HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV'.split(' ')
const ALIAS = { DEUT:'DEU', JOSH:'JOS', JUDG:'JDG', RUTH:'RUT', '1SAM':'1SA', '2SAM':'2SA', '1KGS':'1KI', '2KGS':'2KI', '1CHR':'1CH', '2CHR':'2CH', EZRA:'EZR', ESTH:'EST', PS:'PSA', PROV:'PRO', ECCL:'ECC', SONG:'SNG', EZEK:'EZK', JOEL:'JOL', AMOS:'AMO', OBAD:'OBA', JONAH:'JON', ZEPH:'ZEP', ZECH:'ZEC', ACTS:'ACT', '1COR':'1CO', '2COR':'2CO', PHIL:'PHP', '1THESS':'1TH', '2THESS':'2TH', '1TIM':'1TI', '2TIM':'2TI', PHLM:'PHM', '1PET':'1PE', '2PET':'2PE', '1JHN':'1JN', '2JHN':'2JN', '3JHN':'3JN', JUDE:'JUD', NAM:'NAH' }
const canon = c => (CODES.includes(c) ? c : ALIAS[c] || null)

// Where each known source lives today and where it would go (library/ is a NEW root; data/ is untouched).
const KNOWN = [
  { id:'mhc',        from:'data/commentary/MHC',      kind:'per-book', to:'library/commentary/MHC',      op:'copy + add book/source fields' },
  { id:'jfb',        from:'data/commentary/JFB',      kind:'per-book', to:'library/commentary/JFB',      op:'copy + add book/source fields' },
  { id:'calvin',     from:'data/commentary/Calvin',   kind:'per-book', to:'library/commentary/Calvin',   op:'copy + add book/source fields' },
  { id:'scofield',   from:'data/commentary/Scofield', kind:'per-book', to:'library/commentary/Scofield', op:'copy' },
  { id:'wesley',     from:'data/commentary/Wesley',   kind:'per-book', to:'library/commentary/Wesley',   op:'copy as-is (verse split decided after review)' },
  { id:'spurgeon',   from:'data/commentary/TDavid',   kind:'per-book', to:'library/commentary/Spurgeon', op:'copy' },
  { id:'barnes-nt',  from:'data/commentary/Barnes_NT',kind:'per-book', to:'library/commentary/Barnes-NT',op:'copy' },
  { id:'tyndale',    from:'data/commentary/Tyndale',  kind:'per-book', to:'library/commentary/Tyndale',  op:'copy' },
  { id:'tyndale-misplaced', from:'data/Tyndale',      kind:'per-book', to:null, op:'none (duplicate of data/commentary/Tyndale; retire after review)' },
  { id:'barnes-legacy', from:'data/commentary/Barnes/Barnes_commentary.json', kind:'array', to:'library/_retired/Barnes', op:'split per book, retired' },
  { id:'clarke',     from:'data/commentary/Clarke/Clarke_commentary.json',   kind:'array', to:'library/_retired/Clarke', op:'split per book, retired' },
  { id:'vincent',    from:'data/commentary/Vincent/Vincent_commentary.json', kind:'array', to:'library/_retired/Vincent', op:'split per book, retired' },
  { id:'meyer',      from:'data/commentary/Meyer/Meyer_commentary.json',     kind:'array', to:'library/_retired/Meyer', op:'split per book, retired' },
  { id:'bsb',        from:'data/bsb/bsb.json',        kind:'bible',    to:'library/bible/BSB',            op:'split per book' },
  { id:'web',        from:'data/web.json',            kind:'bible',    to:'library/bible/WEB',            op:'split per book (7 verses empty in source: Luke 17:36, Acts 8:37, 15:34, 24:7, Rom 16:25-27)' },
  { id:'kjv',        from:'data/kjv.json',            kind:'bible',    to:'library/bible/KJV',            op:'split per book' },
  { id:'asv',        from:'data/asv.json',            kind:'bible',    to:'library/bible/ASV',            op:'split per book (keeps ASV backtick quote marks; 3 John 1:15 is a "[]" placeholder)' },
  { id:'cross-refs-whole', from:'data/cross-refs.json', kind:'single', to:null, op:'none (same 255,675 refs as data/xref/ per book; confirm identical, then retire)' },
  { id:'xref',       from:'data/xref',                kind:'per-book', to:'library/xref',                 op:'copy' },
  { id:'strongs-h',  from:'data/dict/strongs_hebrew.json',      kind:'single', to:'library/lexicon/strongs_hebrew.json', op:'copy' },
  { id:'strongs-g',  from:'data/dict/strongs_greek.json',       kind:'single', to:'library/lexicon/strongs_greek.json', op:'copy' },
  { id:'concordance',from:'data/dict/strongs_concordance.json', kind:'single', to:'library/lexicon/strongs_concordance.json', op:'copy' },
  { id:'naves',      from:'data/dict/naves/naves_topics.json',  kind:'single', to:'library/topics/naves.json', op:'copy' },
  { id:'topic-scores',from:'data/dict/openbible_topic_scores.json', kind:'single', to:'library/topics/openbible_topic_scores.json', op:'copy' },
  { id:'characters', from:'data/dict/characters.json',          kind:'single', to:'library/people/characters.json', op:'copy' },
  { id:'xref-seed',  from:'data/dict/xref_seed_pool.json',      kind:'single', to:'library/xref/xref_seed_pool.json', op:'copy' },
  { id:'overview-map',from:'data/dict/book_overview_map.json',  kind:'single', to:'library/maps/book_overview_map.json', op:'copy + canonical book keys' },
]

function walk(dir) { const out = []; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) out.push(...walk(p)); else out.push(p) } return out }
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16)

function describe(file, buf) {
  const info = { path: file, bytes: buf.length, sha256_16: sha(buf) }
  if (!file.endsWith('.json')) { info.shape = 'not json'; return info }
  let d; try { d = JSON.parse(buf.toString('utf8')) } catch (e) { info.shape = 'INVALID JSON: ' + e.message.slice(0, 60); return info }
  if (Array.isArray(d)) {
    info.shape = 'array'; info.items = d.length
    if (d[0] && d[0].book !== undefined) {
      info.shape = 'whole-Bible array'; info.books = d.map(b => b.book)
      info.nonCanonicalCodes = info.books.filter(b => !CODES.includes(b))
      const lens = d.flatMap(b => (b.chapters || []).map(c => (c.commentary || '').length))
      info.chapters = lens.length; info.chaptersExactly2000 = lens.filter(x => x === 2000).length
      info.booksWithNoChapters = d.filter(b => !(b.chapters || []).length).map(b => b.book)
    }
    return info
  }
  info.topLevelKeys = Object.keys(d).slice(0, 8)
  if (d.books && typeof d.books === 'object') { info.shape = 'whole-Bible object'; info.books = Object.keys(d.books).length; info.verses = Object.values(d.books).reduce((n, b) => n + Object.values(b).reduce((m, ch) => m + Object.keys(ch).length, 0), 0); return info }
  const ch = d.chapters
  const stem = path.basename(file, '.json')
  info.bookField = d.book ?? null
  info.fileCode = stem; info.canonicalCode = canon(stem)
  if (Array.isArray(ch)) {
    info.shape = ch[0] && ch[0].verses ? 'verse-keyed' : 'chapter text'
    const nums = ch.map(c => c.chapter)
    info.chapters = ch.length; info.duplicateChapters = nums.filter((n, i) => nums.indexOf(n) !== i)
    info.verseNotes = ch.reduce((n, c) => n + (c.verses ? Object.keys(c.verses).length : 0), 0)
    info.chaptersExactly2000 = ch.filter(c => (c.commentary || '').length === 2000).length
  } else if (ch && typeof ch === 'object') {
    info.shape = 'object of chapter strings'; info.chapters = Object.keys(ch).length; info.chapterKeys = Object.keys(ch).slice(0, 3)
  } else if (d.refs) { info.shape = 'xref'; info.refs = d.refs.length }
  else info.shape = 'other'
  info.issues = []
  if (info.canonicalCode && info.canonicalCode !== stem) info.issues.push(`file name ${stem} is not the canonical code ${info.canonicalCode}`)
  if (info.bookField && info.bookField !== stem) info.issues.push(`book field ${info.bookField} differs from file name`)
  if ((info.shape === 'chapter text' || info.shape === 'verse-keyed') && !info.bookField) info.issues.push('no book field')
  if (info.duplicateChapters && info.duplicateChapters.length) info.issues.push('duplicate chapters ' + info.duplicateChapters.join(','))
  return info
}

const mode = process.argv[2]
if (!fs.existsSync('data')) { console.error('Run this from the repo root (the folder that contains data/).'); process.exit(1) }

if (mode === '--inventory') {
  const files = walk('data').filter(f => !f.endsWith('.gitkeep')).sort()
  const rows = files.map(f => describe(f, fs.readFileSync(f)))
  const claimed = KNOWN.map(k => k.from)
  for (const r of rows) r.knownSource = (KNOWN.find(k => r.path === k.from || r.path.startsWith(k.from + '/')) || {}).id || 'UNDECLARED'
  const undeclared = rows.filter(r => r.knownSource === 'UNDECLARED')
  const missingKnown = KNOWN.filter(k => !fs.existsSync(k.from)).map(k => k.from)
  fs.writeFileSync('library-inventory.json', JSON.stringify({ generated: new Date().toISOString(), files: rows.length, undeclared: undeclared.map(r => r.path), missingKnown, rows }, null, 1))
  const lines = [`files: ${rows.length}   undeclared: ${undeclared.length}   known sources missing on disk: ${missingKnown.length}`, '']
  for (const r of rows) lines.push(`${String(r.bytes).padStart(10)}  ${r.path}  [${r.knownSource}] ${r.shape || ''}${r.issues && r.issues.length ? '  ISSUES: ' + r.issues.join('; ') : ''}`)
  if (missingKnown.length) lines.push('', 'Known sources not found:', ...missingKnown)
  fs.writeFileSync('library-inventory.txt', lines.join('\n') + '\n')
  console.log(lines.slice(0, 1).join('\n'))
  console.log('Wrote library-inventory.txt and library-inventory.json. Nothing under data/ was changed.')
  if (undeclared.length) { console.log('\nUndeclared files (first 40):'); undeclared.slice(0, 40).forEach(r => console.log('  ' + r.path)) }
} else if (mode === '--plan') {
  console.log('PLAN ONLY -- nothing is written.\n')
  for (const k of KNOWN) {
    const exists = fs.existsSync(k.from)
    let n = ''
    if (exists && fs.statSync(k.from).isDirectory()) n = ` (${fs.readdirSync(k.from).filter(f => f.endsWith('.json')).length} files)`
    console.log(`${exists ? '   ' : 'MISSING '}${k.from}${n}\n      -> ${k.to || '(not copied)'}   [${k.op}]`)
  }
} else {
  console.log('Usage: node standardize-library.mjs --inventory | --plan   (both read-only)')
}