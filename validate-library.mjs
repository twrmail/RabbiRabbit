// RabbiRabbit -- independent validation of library/ against data/.  READ-ONLY.
// Shares no code with build-library.mjs on purpose: it re-derives every check from the original files.
//   node validate-library.mjs      -> prints a summary, writes validation-report.txt (repo root)
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const CODES = 'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAH HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV'.split(' ')
const OLD = { DEUT:'DEU', NAM:'NAH', PS:'PSA', JOSH:'JOS', JUDG:'JDG', RUTH:'RUT', '1SAM':'1SA', '2SAM':'2SA', '1KGS':'1KI', '2KGS':'2KI', '1CHR':'1CH', '2CHR':'2CH', EZRA:'EZR', ESTH:'EST', PROV:'PRO', ECCL:'ECC', SONG:'SNG', EZEK:'EZK', JOEL:'JOL', AMOS:'AMO', OBAD:'OBA', JONAH:'JON', ZEPH:'ZEP', ZECH:'ZEC', ACTS:'ACT', '1COR':'1CO', '2COR':'2CO', PHIL:'PHP', '1THESS':'1TH', '2THESS':'2TH', '1TIM':'1TI', '2TIM':'2TI', PHLM:'PHM', '1PET':'1PE', '2PET':'2PE', '1JHN':'1JN', '2JHN':'2JN', '3JHN':'3JN', JUDE:'JUD' }
const std = c => CODES.includes(c) ? c : OLD[c]
const J = p => JSON.parse(fs.readFileSync(p, 'utf8'))
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const out = [], fails = []
const say = (...s) => out.push(...s)
const fail = s => { fails.push(s); out.push('   FAIL ' + s) }

if (!fs.existsSync('library/manifest.json')) { console.error('library/manifest.json not found: run build-library.mjs --write first.'); process.exit(1) }
const man = J('library/manifest.json')
say('RabbiRabbit library validation (read-only). Parity definitions:')
say('  commentary/xref "content identical" = the chapters (or refs) array and every other original field are deep-equal to the')
say('    original file; the only allowed differences are listed metadata: book (standard code), sourceId, originalBook, source (added if missing).')
say('  bible "verse identical" = for every (book, chapter, verse) the text string is exactly equal; keys only on one side are listed.')
say('  retired = same chapter arrays as the original whole-Bible record; never servable.')
say('')

// ---------- 1. manifest <-> disk ----------
say('== 1. Manifest vs files on disk')
const listed = new Set()
for (const s of man.sources) {
  const f = s.folder
  if (!fs.existsSync(f)) { fail(`${s.id}: folder/file ${f} missing`); continue }
  if (fs.statSync(f).isDirectory()) {
    const files = fs.readdirSync(f).filter(x => x.endsWith('.json'))
    files.forEach(x => listed.add(path.join(f, x)))
    const codes = files.map(x => x.slice(0, -5))
    const bad = codes.filter(c => !CODES.includes(c)); if (bad.length) fail(`${s.id}: non-standard file names ${bad}`)
    if (s.booksPresent && !eq([...s.booksPresent].sort(), [...codes].sort())) fail(`${s.id}: manifest booksPresent differs from files on disk`)
    for (const c of codes) { const d = J(path.join(f, c + '.json')); if (d.book !== c) fail(`${s.id}/${c}.json: book field ${d.book}`) }
    say(`   ${s.id.padEnd(15)} ${String(files.length).padStart(3)} files  status=${s.status} scope=${s.scope || '-'} servable=${s.servable}${s.retiredReason ? '  reason: ' + s.retiredReason : ''}`)
  } else { listed.add(f); say(`   ${s.id.padEnd(15)}   1 file   status=${s.status} servable=${s.servable}`) }
  if (s.status === 'retired' && s.servable !== false) fail(`${s.id}: retired but servable is not false`)
}
const all = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : all.push(p) } }; walk('library')
const stray = all.filter(p => !listed.has(p) && !['library/manifest.json', 'library/PARITY-REPORT.txt'].includes(p))
stray.length ? fail(`files in library/ not described by the manifest: ${stray.slice(0, 10)}`) : say('   every file in library/ is described by the manifest')

// ---------- 2. commentaries and xref ----------
say('', '== 2. Commentaries and cross-references (per file, content)')
const ALLOWED_META = new Set(['book', 'sourceId', 'originalBook', 'source'])
for (const s of man.sources.filter(s => (s.kind === 'commentary' || s.kind === 'xref') && s.status !== 'retired')) {
  let ok = 0; const metaNotes = []
  for (const file of fs.readdirSync(s.folder).filter(x => x.endsWith('.json'))) {
    const code = file.slice(0, -5), nu = J(path.join(s.folder, file))
    const candidates = [code, ...Object.keys(OLD).filter(k => OLD[k] === code)].map(c => path.join(s.originalLocation, c + '.json')).filter(fs.existsSync)
    if (candidates.length !== 1) { fail(`${s.id}/${file}: ${candidates.length} original files match`); continue }
    const old = J(candidates[0]), body = old.chapters !== undefined ? 'chapters' : 'refs'
    if (!eq(old[body], nu[body])) { fail(`${s.id}/${file}: ${body} differ from ${candidates[0]}`); continue }
    for (const k of Object.keys(old)) if (k !== 'book' && !eq(old[k], nu[k])) fail(`${s.id}/${file}: field ${k} differs`)
    for (const k of Object.keys(nu)) if (!(k in old) && !ALLOWED_META.has(k)) fail(`${s.id}/${file}: unexpected new field ${k}`)
    const changes = []
    if (old.book !== nu.book) changes.push(`book ${old.book === undefined ? '(none)' : old.book} -> ${nu.book}`)
    if (path.basename(candidates[0]) !== file) changes.push(`file ${path.basename(candidates[0])} -> ${file}`)
    if (!('source' in old)) changes.push('source added')
    if (changes.length) metaNotes.push(`${code}: ${changes.join(', ')}`)
    ok++
  }
  const kinds = {}; for (const n of metaNotes) { const k = n.replace(/^\w+: /, '').replace(/book \S+ -> \w+/, m => m.startsWith('book (none)') ? 'book field added' : 'book field changed').replace(/file \S+ -> \S+/, 'file renamed'); kinds[k] = (kinds[k] || 0) + 1 }
  say(`   ${s.id.padEnd(12)} ${ok} files content identical. Metadata-only changes: ${Object.entries(kinds).map(([k, n]) => `${n}x ${k}`).join('; ') || 'none'}`)
  const special = metaNotes.filter(n => /book [A-Z0-9]{3,} ->|file /.test(n)); if (special.length) say(`      named changes: ${special.join('; ')}`)
  say(`      coverage: ${s.coverage ? s.coverage.books + ' of 66 books' : '?'}${s.scope && s.scope !== 'full' ? ' (' + s.scope + ': ' + (s.declared || '') + ')' : ''}${s.note ? ' -- ' + s.note : ''}`)
}

// ---------- 3. retired ----------
say('', '== 3. Retired sources')
for (const s of man.sources.filter(s => s.status === 'retired')) {
  const arr = J(s.originalLocation); let ok = 0; const noChapters = []
  for (const b of arr) {
    const code = std(b.book), p = path.join(s.folder, code + '.json')
    if (!(b.chapters || []).length) { noChapters.push(b.book); if (fs.existsSync(p)) fail(`${s.id}: ${code} has no chapters but a file was written`); continue }
    if (!fs.existsSync(p)) { fail(`${s.id}: ${code} missing`); continue }
    const nu = J(p); if (!eq(nu.chapters, b.chapters)) fail(`${s.id}/${code}: chapters differ`); else ok++
    if (nu.servable !== false || nu.status !== 'retired') fail(`${s.id}/${code}: file not marked retired/unservable`)
  }
  const lens = arr.flatMap(b => (b.chapters || []).map(c => (c.commentary || '').length)), cut = lens.filter(x => x === 2000).length
  say(`   ${s.id.padEnd(14)} ${ok} books identical; servable=${s.servable}; ${cut} of ${lens.length} chapters are exactly 2,000 chars (truncated)${noChapters.length ? '; no chapters in original: ' + noChapters.join(',') : ''}`)
}

// ---------- 4. Bibles ----------
say('', '== 4. Bibles, verse by verse')
const keysOf = {}
for (const s of man.sources.filter(s => s.kind === 'bible')) {
  const src = J(s.originalLocation), old = new Map()
  if (Array.isArray(src.books)) { for (const b of src.books) for (const c of b.chapters) for (const v of c.verses) old.set(`${std(b.code)} ${c.chapter}:${v.verse}`, v.text) }
  else for (const [b, chs] of Object.entries(src.books)) for (const [c, vs] of Object.entries(chs)) for (const [v, t] of Object.entries(vs)) old.set(`${std(b)} ${c}:${v}`, t)
  const nu = new Map()
  for (const f of fs.readdirSync(s.folder)) { const d = J(path.join(s.folder, f)); for (const c of d.chapters) for (const [v, t] of Object.entries(c.verses)) nu.set(`${d.book} ${c.chapter}:${v}`, t) }
  const onlyOld = [...old.keys()].filter(k => !nu.has(k)), onlyNew = [...nu.keys()].filter(k => !old.has(k)), diff = [...old.keys()].filter(k => nu.has(k) && nu.get(k) !== old.get(k))
  const empty = [...nu.entries()].filter(([, t]) => !String(t).trim() || /^\[\s*\]$/.test(String(t).trim())).map(([k, t]) => `${k} (${JSON.stringify(t)})`)
  if (onlyOld.length) fail(`${s.id}: ${onlyOld.length} verses lost: ${onlyOld.slice(0, 8)}`)
  if (onlyNew.length) fail(`${s.id}: ${onlyNew.length} verses invented: ${onlyNew.slice(0, 8)}`)
  if (diff.length) fail(`${s.id}: ${diff.length} verse texts differ: ${diff.slice(0, 8)}`)
  say(`   ${s.id.toUpperCase().padEnd(4)} ${old.size} source verses, ${nu.size} library verses, identical texts: ${old.size - diff.length - onlyOld.length}; blank-or-placeholder verses: ${empty.length ? empty.join('; ') : 'none'}`)
  keysOf[s.id] = new Set(nu.keys())
}
// versification differences, against KJV
if (keysOf.kjv) {
  say('   Verse numbering compared with KJV (31,102):')
  for (const id of Object.keys(keysOf).filter(x => x !== 'kjv')) {
    const extra = [...keysOf[id]].filter(k => !keysOf.kjv.has(k)), missing = [...keysOf.kjv].filter(k => !keysOf[id].has(k))
    say(`     ${id.toUpperCase()}: extra ${extra.length ? extra.join(', ') : 'none'} | missing ${missing.length ? missing.length + ': ' + missing.join(', ') : 'none'}`)
  }
}

// ---------- 5. single files and overview map ----------
say('', '== 5. Reference files')
for (const s of man.sources.filter(s => s.kind === 'reference')) {
  const a = fs.readFileSync(s.originalLocation), b = fs.readFileSync(s.folder)
  a.equals(b) ? say(`   ${s.id.padEnd(15)} byte-for-byte identical`) : fail(`${s.id}: bytes differ`)
}
const om = man.sources.find(s => s.id === 'overview-map')
if (om) { const a = J(om.originalLocation), b = J(om.folder); let ok = 0; for (const [k, v] of Object.entries(a)) { const c = k.startsWith('_') ? k : std(k); eq(v, b[c]) ? ok++ : fail(`overview-map ${k}`) } say(`   overview-map    ${ok} entries identical under standard book codes`) }

say('', `RESULT: ${fails.length ? fails.length + ' FAILURES' : 'PASS (0 failures)'}`)
fs.writeFileSync('validation-report.txt', out.join('\n') + '\n')
console.log(out.slice(-1)[0]); console.log('Full report: validation-report.txt')
if (fails.length) process.exit(1)