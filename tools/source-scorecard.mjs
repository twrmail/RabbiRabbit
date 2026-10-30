// RabbiRabbit source scorecard (Step 0). READ-ONLY: reads library/ and (optionally) the Worker file; writes only the report files named below.
// Usage (from the repo root, or point at any copy of library/):
//   node source-scorecard.mjs library [worker.js] [--out scorecard]     writes scorecard.md, scorecard.json
// Seven gates per source; states PASS / FAIL / UNKNOWN / N/A. Every evidence line is tagged:
//   [measured]   computed by this script from the files it was given
//   [recorded]   a statement written in the manifest or in the data file itself (not independently confirmed)
//   [earlier]    result from an earlier session or run, NOT rechecked here (with its source)
// A PASS needs evidence that meets the criterion; "no evidence yet" is UNKNOWN, never PASS.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

const args = process.argv.slice(2)
const outIdx = args.indexOf('--out')
const outPrefix = outIdx >= 0 ? args.splice(outIdx, 2)[1] : 'scorecard'
const [libDir, workerFile] = args
if (!libDir) { console.error('usage: node source-scorecard.mjs <library-dir> [worker.js] [--out prefix]'); process.exit(2) }
const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8'))
const exists = p => fs.existsSync(p)
const manifest = readJSON(path.join(libDir, 'manifest.json'))
// library/fixes.json: the recorded, counted text fixes (library = data + these rules). The re-application below is written
// separately from apply-library-fixes.mjs on purpose (different string handling), so a bug in one does not hide in the other.
const fixes = exists(path.join(libDir, 'fixes.json')) ? readJSON(path.join(libDir, 'fixes.json')) : null
function applyRecordedFixes(srcId, code, obj) {
  const used = []; let o = obj
  if (!fixes) return { obj: o, used }
  for (const r of fixes.rules) {
    if (r.source !== srcId || !r.files.includes(code)) continue
    used.push(r.id)
    if (r.op === 'replace-all') {
      let s = JSON.stringify(o[r.target])
      for (const [a, b] of r.pairs) s = s.split(JSON.stringify(a).slice(1, -1)).join(JSON.stringify(b).slice(1, -1))
      o = { ...o, [r.target]: JSON.parse(s) }
    } else if (r.op === 'strip-leading') {
      const esc = r.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const s = JSON.stringify(o.chapters).replace(new RegExp('("\\d+":")\\s*' + esc + '\\s*', 'g'), '$1')
      o = { ...o, chapters: JSON.parse(s) }
    }
  }
  return { obj: o, used }
}
const codes = Array.isArray(manifest.bookCodes) ? manifest.bookCodes : manifest.bookCodes.split(/\s+/)
const worker = workerFile && exists(workerFile) ? fs.readFileSync(workerFile, 'utf8') : null

// ---- reference structure: the KJV files in the library (chapters and verse counts) ----
const kjv = {}
for (const c of codes) {
  const p = path.join(libDir, 'bible', 'KJV', c + '.json'); if (!exists(p)) continue
  const d = readJSON(p); kjv[c] = {}
  for (const ch of d.chapters) kjv[c][ch.chapter] = Math.max(...Object.keys(ch.verses).map(Number))
}
const kjvChapters = Object.values(kjv).reduce((n, b) => n + Object.keys(b).length, 0)

// ---- per-source readers: return { book -> [{chapter, text, keys:[verse numbers]|null}] } ----
function readBooks(src) {
  const folder = path.join(path.dirname(libDir) === '.' ? '.' : path.dirname(libDir), src.folder)
  const dir = exists(folder) ? folder : path.join(libDir, '..', src.folder)
  const out = {}
  if (!exists(dir) || !fs.statSync(dir).isDirectory()) return out
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
    let d; try { d = readJSON(path.join(dir, f)) } catch { out[f.replace('.json', '')] = 'PARSE-ERROR'; continue }
    const code = f.replace('.json', '')
    let chs = []
    if (src.id === 'wesley') {
      chs = Object.entries(d.chapters || {}).map(([k, v]) => ({ chapter: +k, text: String(v), keys: null }))
      if (d.intro) chs.push({ chapter: 0, text: String(d.intro), keys: null, intro: true })
    } else if (['spurgeon', 'barnes-nt', 'tyndale'].includes(src.id)) {
      chs = (d.chapters || []).map(c => ({ chapter: c.chapter, text: Object.values(c.verses || {}).join('\n') + (c.overview || c.preface || ''), keys: Object.keys(c.verses || {}).map(Number) }))
    } else if (src.kind === 'bible') {
      chs = (d.chapters || []).map(c => ({ chapter: c.chapter, text: Object.values(c.verses || {}).join(' '), keys: Object.keys(c.verses || {}).map(Number), verses: c.verses }))
    } else if (src.kind === 'xref') {
      chs = [{ chapter: 1, text: '', keys: null, refs: d.refs || [] }]
    } else {
      chs = (d.chapters || []).map(c => ({ chapter: c.chapter, text: String(c.commentary || ''), keys: null }))
    }
    out[code] = { chapters: chs, source: d.source || null, year: d.year || null, name: d.name || d.translation || null }
  }
  return out
}

const TAGS = { m: '[measured]', r: '[recorded]', e: '[earlier]' }
const E = (t, s) => `${TAGS[t]} ${s}`
const card = []

// Gate 7: is there an automatic check on every relevant change? Decided once for the whole repo.
const repoRootDir = path.dirname(path.resolve(libDir))
const isRepo = exists(path.join(repoRootDir, '.git'))
const wfDir = path.join(repoRootDir, '.github', 'workflows')
const wfFiles = exists(wfDir) ? fs.readdirSync(wfDir).filter(f => /\.ya?ml$/.test(f)) : []
const wfTexts = wfFiles.map(f => ({ f, text: fs.readFileSync(path.join(wfDir, f), 'utf8') }))
const wfScore = wfTexts.find(w => /source-scorecard/.test(w.text) && /library\/\*\*/.test(w.text))
function regressionGate() {
  if (process.env.GITHUB_ACTIONS === 'true' && wfScore)
    return ['PASS', [E('m', `this report was produced inside GitHub Actions (run ${process.env.GITHUB_RUN_ID || '?'}) by workflow ${wfScore.f}, which triggers on changes under library/ and fails if any gate is worse than library-baseline.json`)]]
  if (isRepo && wfFiles.length === 0) return ['FAIL', [E('m', 'this is a git repository and .github/workflows does not exist or has no workflow files: nothing checks changes automatically')]]
  if (wfScore) return ['UNKNOWN', [E('m', `workflow ${wfScore.f} is installed and runs this scorecard on changes under library/; this report was not produced inside Actions, so a run on GitHub is the evidence still needed (Actions tab)`)]]
  if (wfFiles.length) return ['FAIL', [E('m', `workflows present (${wfFiles.join(', ')}) but none runs this scorecard on library/ changes`)]]
  return ['UNKNOWN', [E('m', 'not run inside a git repository (no .git next to library/), so installed workflows cannot be seen'), E('r', 'Tom\'s Codespace check, Oct 29: ls .github/workflows -> No such file or directory (no workflows installed)')]]
}

function scoreText(src) {
  const books = readBooks(src)
  const present = Object.keys(books).filter(b => books[b] !== 'PARSE-ERROR')
  const g = { id: src.id, name: src.displayName || src.id, kind: src.kind, scope: src.scope, status: src.status, gates: {}, facts: {}, next: [] }
  const parseErr = Object.keys(books).filter(b => books[b] === 'PARSE-ERROR')
  // structure vs KJV chapters
  let missingCh = [], extraCh = [], emptyCh = [], chTotal = 0, dupCh = [], lens = [], dirty = { html: 0, entity: 0, fffd: 0, moji: 0, ctrl: 0 }, short = 0
  const where = { html: [], entity: [], fffd: [], moji: [], ctrl: [] }, entKinds = {}
  const keyIssues = { nonInt: 0, outOfRange: [], heading: [], versif: [], versesWithEntry: 0, versesTotal: 0 }
  for (const b of present) {
    const chs = books[b].chapters.filter(c => !c.intro)
    const seen = new Set()
    for (const c of chs) {
      chTotal++
      if (seen.has(c.chapter)) dupCh.push(`${b} ${c.chapter}`); seen.add(c.chapter)
      if (kjv[b] && !kjv[b][c.chapter]) extraCh.push(`${b} ${c.chapter}`)
      const t = c.text.trim()
      if (src.kind !== 'xref') {
        if (!t) emptyCh.push(`${b} ${c.chapter}`)
        else { lens.push(t.length); if (t.length < 40) short++ }
        const hit = (k, re) => { if (re.test(c.text)) { dirty[k]++; if (where[k].length < 4) where[k].push(`${b} ${c.chapter}`) } }
        hit('html', /<\/?[a-z][a-z0-9]*(\s[^>]*)?>/i); hit('fffd', /�/); hit('moji', /Ã[\u0080-¿]|â€|Â[ -¿]/); hit('ctrl', /[\x00-\x08\x0B\x0C\x0E-\x1F]/)
        const ents = c.text.match(/&(?:[a-z]{2,8}|#\d+);/gi)
        if (ents) { dirty.entity++; if (where.entity.length < 4) where.entity.push(`${b} ${c.chapter}`); ents.forEach(e => { entKinds[e] = (entKinds[e] || 0) + 1 }) }
      }
      if (c.keys && kjv[b] && kjv[b][c.chapter]) {
        const max = kjv[b][c.chapter]
        for (const k of c.keys) {
          if (!Number.isInteger(k)) keyIssues.nonInt++
          else if (k === 0) keyIssues.heading.push(`${b} ${c.chapter}:0`)                 // psalm superscription
          else if (k === max + 1) keyIssues.versif.push(`${b} ${c.chapter}:${k}`)        // one past the KJV count: a different versification
          else if (k < 1 || k > max) keyIssues.outOfRange.push(`${b} ${c.chapter}:${k}`)
        }
        if (src.kind !== 'bible') { keyIssues.versesWithEntry += c.keys.filter(k => k >= 1 && k <= max).length; keyIssues.versesTotal += max }
      }
    }
    if (kjv[b]) for (const ch of Object.keys(kjv[b])) if (!seen.has(+ch)) missingCh.push(`${b} ${ch}`)
  }
  const modal = (() => { const m = {}; lens.forEach(l => m[l] = (m[l] || 0) + 1); const e = Object.entries(m).sort((a, b) => b[1] - a[1])[0]; return e ? { len: +e[0], n: e[1] } : { len: 0, n: 0 } })()
  const plateau = lens.length ? modal.n / lens.length : 0
  const missingBooks = codes.filter(c => !present.includes(c))
  g.facts = { filesRead: present.length, parseErrors: parseErr, chapters: chTotal, missingBooks: missingBooks.length, missingChaptersInPresentBooks: missingCh.length, chaptersNotInKJVStructure: extraCh, emptyChapters: emptyCh.length, duplicateChapters: dupCh, modalLength: modal, dirty, shortChapters: short }

  // ---- Gate 1 completeness ----
  if (src.kind === 'bible') {
    const absent = [], empty = []
    for (const b of present) for (const c of books[b].chapters) if (kjv[b] && kjv[b][c.chapter]) {
      const max = kjv[b][c.chapter]
      for (let v = 1; v <= max; v++) { const raw = c.verses[String(v)]; if (raw === undefined) absent.push(`${b} ${c.chapter}:${v}`); else if (!String(raw).trim() || String(raw).trim() === '[]') empty.push(`${b} ${c.chapter}:${v}`) }
    }
    g.facts.versesAbsentVsKJVNumbering = absent.length; g.facts.versesEmptyOrPlaceholder = empty.length
    const ok = missingBooks.length === 0 && missingCh.length === 0 && dupCh.length === 0
    g.gates[1] = ok ? ['PASS', [E('m', `${present.length}/66 books, ${chTotal} chapters = KJV structure (${kjvChapters}); verse numbers absent vs KJV numbering: ${absent.length} (${absent.slice(0, 18).join(', ')}${absent.length > 18 ? ', ...' : ''}); empty/placeholder: ${empty.length} (${empty.join(', ') || 'none'})`), E('r', 'manifest and Worker treat empty = edition prints no text, missing = no such verse number')]]
      : ['FAIL', [E('m', `missing books ${missingBooks.join(' ')}; missing chapters ${missingCh.slice(0, 10).join(', ')}`)]]
  } else if (src.kind === 'xref') {
    g.gates[1] = [missingBooks.length === 0 ? 'PASS' : 'FAIL', [E('m', `${present.length}/66 files, ${books[present[0]] ? 'refs per file read' : ''}`)]]
  } else if (src.scope === 'retired') {
    g.gates[1] = ['FAIL', [E('r', src.retiredReason || 'retired'), E('m', `${present.length} files, ${chTotal} chapters; ${(plateau * 100).toFixed(0)}% of chapters have the identical length ${modal.len}`)]]
  } else if (src.scope === 'full') {
    const bad = missingBooks.length || missingCh.length || extraCh.length || emptyCh.length || dupCh.length || parseErr.length
    g.gates[1] = [bad ? 'FAIL' : 'PASS', [E('m', `${present.length}/66 books, ${chTotal} chapters vs KJV structure ${kjvChapters}; missing books ${missingBooks.length}, missing chapters ${missingCh.length}, extra/unknown chapters ${extraCh.length} ${extraCh.slice(0, 6).join(', ')}, empty chapters ${emptyCh.length} ${emptyCh.slice(0, 6).join(', ')}, duplicates ${dupCh.length}`), E('m', 'structure only: this cannot detect a chapter that is present but incomplete (see gate 3)')]]
  } else if (src.scope === 'incomplete') {
    g.gates[1] = ['FAIL', [E('m', `${present.length}/66 books, ${chTotal} chapters; missing chapters in present books: ${missingCh.length} (${missingCh.length > 60 ? missingCh.slice(0, 60).join(', ') + ', ...' : missingCh.join(', ')}); chapters outside KJV structure: ${extraCh.join(', ') || 'none'}; empty: ${emptyCh.length}`), E('r', 'manifest status: incomplete')]]
  } else {
    g.gates[1] = ['UNKNOWN', [E('m', `${present.length}/66 books present; ${missingCh.length} chapters missing inside present books (${missingCh.length > 60 ? missingCh.slice(0, 60).join(', ') + ', ...' : missingCh.join(', ')}); extra/unknown chapters ${extraCh.length}; empty chapters ${emptyCh.length}`), E('r', `declared scope: ${src.declared}`), 'Scope is partial by design: whether every book/chapter the author wrote is present needs the original work\'s table of contents, which is not in the repo.']]
    if (extraCh.length || dupCh.length) g.gates[1][0] = 'FAIL'
  }

  // ---- Gate 2 provenance ----
  const first = present[0] && books[present[0]]
  const srcStr = (first && first.source) || (src.kind === 'bible' ? [first && first.name, first && first.year].filter(Boolean).join(' ') : '')
  const license = src.license || ''
  const rec = {
    edition: !/not recorded|origin and edition/i.test(srcStr) && (/\b(1[5-9]\d\d|20\d\d)\b/.test(srcStr) || (first && first.year)) ? true : false,
    year: /\b(1[5-9]\d\d|20\d\d)\b/.test(srcStr) || !!(first && first.year),
    origin: /via |from |rebuilt|CCEL|seven1m|bereanbibles|lyteword|tyndaleopenresources|openbible/i.test(srcStr),
    upstreamHash: !!src.sha256_16 && false,   // no per-book upstream hash is recorded in the manifest (only the whole-data fingerprint)
  }
  const notRecorded = /not recorded/i.test(srcStr)
  g.facts.provenanceRecorded = { text: srcStr.slice(0, 160), ...rec }
  g.gates[2] = [notRecorded ? 'FAIL' : 'UNKNOWN', [E('r', `file says: "${srcStr.slice(0, 150)}"`), E('m', `recorded: year ${rec.year ? 'yes' : 'NO'}, origin ${rec.origin ? 'yes' : 'NO'}, upstream hash NO (manifest holds only the whole-data fingerprint ${manifest.sourceSnapshot})`), notRecorded ? 'The data file itself says the origin/edition was never recorded: a known defect.' : 'Edition identity not independently established.']]

  // ---- Gate 3 cleanliness ----
  const hits = []
  if (plateau >= 0.10 && modal.n >= 5) hits.push(`truncation signature: ${modal.n} of ${lens.length} chapters (${(plateau * 100).toFixed(0)}%) have the identical length ${modal.len}`)
  const W = k => ` (e.g. ${where[k].join(', ')})`
  if (dirty.fffd) hits.push(`${dirty.fffd} chapters with U+FFFD replacement characters${W('fffd')}`)
  if (dirty.moji) hits.push(`${dirty.moji} chapters with mojibake patterns${W('moji')}`)
  if (dirty.ctrl) hits.push(`${dirty.ctrl} chapters with control characters${W('ctrl')}`)
  if (dirty.html) hits.push(`${dirty.html} chapters with HTML tags${W('html')}`)
  if (dirty.entity) hits.push(`${dirty.entity} chapters with literal HTML entities: ${Object.entries(entKinds).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} x${v}`).join(', ')}${W('entity')}`)
  if (short && src.scope === 'full') hits.push(`${short} non-empty chapters under 40 characters`)
  if (emptyCh.length) hits.push(`${emptyCh.length} empty chapters`)
  const infoNotes = []
  if (short && src.scope !== 'full') infoNotes.push(`${short} very short chapters (under 40 characters): expected for selective notes, not counted as a defect`)
  if (src.kind === 'xref') g.gates[3] = ['N/A', ['Cross-reference table: no prose to damage; row validity is gate 5.']]
  else g.gates[3] = [hits.length ? 'FAIL' : 'PASS', hits.length ? [E('m', hits.join('; ')), ...infoNotes.map(n => E('m', n))] : [E('m', `no hits on: identical-length plateau, replacement characters, mojibake, control characters, HTML tags/entities, empty chapters (${lens.length} chapters)`), ...infoNotes.map(n => E('m', n)), 'Cannot detect silent omissions or a chapter cut at a natural boundary.']]
  for (const oi of ((fixes && fixes.openIssues) || []).filter(x => x.source === src.id)) g.gates[3][1].push(E('r', `open issue ${oi.id} (${oi.location}): ${oi.description} Not auto-fixed: ${oi.notFixedBecause}`))
  if (fixes) g.gates[3][1].push(...fixes.rules.filter(r => r.source === src.id).map(r => E('r', `fix recorded in library/fixes.json: ${r.id} (${JSON.stringify(r.expectedCount)} changes)`)))
  if (src.id === 'mhc') g.gates[3][1].push(E('e', 'Henry audit baseline (repo-kit, Oct 19 copy): 4 HTML fragments in 1 Cor, 6 verse overlaps, 7 stray words, 242 unusual chapter endings'))

  // ---- Gate 4 text preservation ----
  const notesInRepo = exists(path.join(libDir, 'notes'))
  // measured comparison against the original file(s) in data/, when they are present next to library/
  let cmp = null
  const repoRoot = path.dirname(path.resolve(libDir))
  const origDir = src.originalLocation ? path.join(repoRoot, src.originalLocation) : null
  if (origDir && src.kind !== 'bible' && exists(origDir) && fs.statSync(origDir).isDirectory()) {
    const META = new Set(['book', 'sourceId', 'originalBook', 'source', 'name'])
    let same = 0; const diff = [], metaOnly = {}, fixUsed = {}; let noOrig = []
    for (const b of present) {
      const lib = readJSON(path.join(libDir, '..', src.folder, b + '.json'))
      const cand = [b + '.json', ...(lib.originalBook ? [lib.originalBook + '.json'] : []), ...(b === 'NAH' ? ['NAM.json'] : [])].map(f => path.join(origDir, f)).find(exists)
      if (!cand) { noOrig.push(b); continue }
      const orig0 = readJSON(cand)
      const fx = applyRecordedFixes(src.id, b, orig0), orig = fx.obj
      fx.used.forEach(id => { fixUsed[id] = (fixUsed[id] || 0) + 1 })
      let ok = true
      for (const k of new Set([...Object.keys(lib), ...Object.keys(orig)])) {
        if (META.has(k)) { if (JSON.stringify(lib[k]) !== JSON.stringify(orig[k])) metaOnly[k] = (metaOnly[k] || 0) + 1; continue }
        if (!isDeepStrictEqual(lib[k], orig[k])) { ok = false; diff.push(`${b}.${k}`); break }
      }
      if (ok) same++
    }
    cmp = { same, diff, noOrig, metaOnly, fixUsed, total: present.length }
  }
  g.gates[4] = src.scope === 'retired'
    ? ['N/A', ['Retired and never served.']]
    : cmp && cmp.total ? [cmp.diff.length === 0 && cmp.noOrig.length === 0 ? 'PASS' : 'FAIL', [E('m', `${cmp.same} of ${cmp.total} library files have content (everything except listed metadata fields) deep-equal to the original in ${src.originalLocation}; different: ${cmp.diff.length} ${cmp.diff.slice(0, 5).join(', ')}; no original found: ${cmp.noOrig.length} ${cmp.noOrig.slice(0, 5).join(', ')}; metadata-only differences: ${JSON.stringify(cmp.metaOnly)}${Object.keys(cmp.fixUsed).length ? '; recorded fixes re-applied to the originals before comparing: ' + Object.keys(cmp.fixUsed).join(', ') : ''}`), 'This proves library = the copy we hold in data/. It does not prove data/ matches the published work (gate 2) and is not the notes-shape rejoin test (not built for this source in the repo).', src.id === 'jfb' ? E('e', 'JFB notes pilot: rejoin byte-exact on 1,189/1,189 chapters, validator PASS in Tom\'s Codespace (Oct 26); output not in the repo') : '']]
    : ['UNKNOWN', ['data/ originals not found next to library/, so not compared here.']]
  if (src.kind === 'bible') g.gates[4] = ['UNKNOWN', [E('e', 'library/ vs data/ compared verse by verse (validate-library.mjs, Oct 24). Not rechecked here.')]]

  // ---- Gate 5 verse coverage ----
  if (src.scope === 'retired') g.gates[5] = ['N/A', ['Retired.']]
  else if (src.kind === 'bible') g.gates[5] = ['PASS', [E('m', `every verse is keyed by its number; ${keyIssues.outOfRange.length} keys outside KJV chapter ranges ${keyIssues.outOfRange.slice(0, 5).join(', ')}`), 'A Bible edition is its own verse index.']]
  else if (src.kind === 'xref') {
    let bad = 0, vers = [], n = 0
    for (const b of present) for (const r of books[b].chapters[0].refs) {
      n++; const bt = kjv[b], tt = kjv[r.tb]
      if (!bt || !bt[r.fc] || !tt || !tt[r.tc]) { bad++; continue }
      const fOk = r.fv >= 1 && r.fv <= bt[r.fc], tOk = r.tv >= 1 && r.tv <= tt[r.tc]
      if (fOk && tOk) continue
      if ((r.fv === bt[r.fc] + 1 || fOk) && (r.tv === tt[r.tc] + 1 || tOk)) vers.push(`${b} ${r.fc}:${r.fv} -> ${r.tb} ${r.tc}:${r.tv}`)   // one past the KJV count
      else bad++
    }
    g.gates[5] = [bad ? 'FAIL' : 'PASS', [E('m', `${n} cross-reference rows; ${bad} with a verse or chapter that does not exist even allowing a different versification; ${vers.length} rows point one verse past the KJV count (${vers.slice(0, 3).join('; ') || 'none'}): different versification, listed not hidden`)]]
  } else if (['spurgeon', 'barnes-nt', 'tyndale'].includes(src.id)) {
    const bad = keyIssues.nonInt + keyIssues.outOfRange.length
    g.gates[5] = [bad ? 'FAIL' : 'UNKNOWN', [E('m', `verse-keyed; ${keyIssues.versesWithEntry} of ${keyIssues.versesTotal} verses (in books present) have an entry; keys outside the chapter's real range: ${keyIssues.outOfRange.length} ${keyIssues.outOfRange.slice(0, 6).join(', ')}; non-numeric keys ${keyIssues.nonInt}`), E('m', `allowed variants: ${keyIssues.heading.length} keys numbered 0 (psalm superscriptions: ${keyIssues.heading.slice(0, 4).join(', ')}${keyIssues.heading.length > 4 ? ', ...' : ''}); ${keyIssues.versif.length} keys one past the KJV verse count (a different versification: ${keyIssues.versif.slice(0, 4).join(', ') || 'none'})`), bad ? '' : 'Keys are valid; whether the text under key N is about verse N is not independently validated.']]
  } else g.gates[5] = ['FAIL', [E('m', 'chapter text with no explicit verse coverage in the repo: the Worker finds verses with code at request time'), src.id === 'jfb' ? E('e', 'JFB notes shape with explicit coverage built and validated (pilot, Oct 26); it also found 12 verses the old reader served wrongly') : src.id === 'scofield' ? 'Scofield notes are anchored to words, not verses: verse coverage may never apply; label it as word-anchored.' : src.id === 'wesley' ? 'Wesley paragraphs are verse-numbered inside the chapter string; not yet indexed.' : '']]

  // ---- Gate 6 licensing ----
  const needsAttr = /CC BY/i.test(license + srcStr)
  const wk = n => worker ? new RegExp(n, 'i').test(worker) : null
  let lic
  if (needsAttr) {
    const m = src.id === 'tyndale' ? 'Tyndale' : src.id === 'xref' ? 'OpenBible' : null
    const found = m ? wk(m) : null
    lic = [found === true ? 'UNKNOWN' : found === false ? 'FAIL' : 'UNKNOWN', [E('r', `licence: ${license || srcStr.slice(0, 120)}`), found === null ? 'Worker file not given, so the attribution could not be checked.' : E('m', `Worker file ${found ? 'names' : 'does NOT name'} "${m}"`), src.id === 'tyndale' ? 'Share-alike: our converted files are adaptations; the repo\'s own licence for them must be compatible. Not yet reviewed.' : '']]
  } else if (/public domain|CC0/i.test(license + srcStr) && !notRecorded) lic = ['UNKNOWN', [E('r', `licence recorded: ${license || srcStr.slice(0, 100)}`), 'Recorded by whoever built the file; public-domain status depends on the exact edition and has not been independently confirmed.']]
  else lic = ['UNKNOWN', [E('r', license ? `licence recorded: ${license}` : 'no licence recorded in the manifest'), notRecorded ? 'Public-domain status depends on the edition, and the edition is not recorded.' : '']]
  if (src.scope === 'retired') lic = ['N/A', ['Retired and never served; settle licence when choosing replacements.']]
  g.gates[6] = lic

  // ---- Gate 7 regression control ----
  g.gates[7] = src.scope === 'retired' ? ['N/A', ['Retired.']] : regressionGate()
  return g
}

// ---- reference / lookup files ----
function scoreRef(src) {
  const p = path.join(path.dirname(libDir) === '.' ? '.' : path.dirname(libDir), src.folder)
  const full = exists(p) ? p : path.join(libDir, '..', src.folder)
  const g = { id: src.id, name: src.displayName || src.id, kind: src.kind, scope: 'reference', status: src.status, gates: {}, facts: {}, next: [] }
  if (!exists(full)) { g.gates[1] = ['FAIL', [E('m', `file ${src.folder} not found`)]]; for (let i = 2; i <= 7; i++) g.gates[i] = ['UNKNOWN', []]; return g }
  const buf = fs.readFileSync(full); const sha = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16)
  let d; try { d = JSON.parse(buf.toString('utf8')) } catch { d = null }
  const count = d == null ? null : Array.isArray(d) ? d.length : Object.keys(d).length
  g.facts = { bytes: buf.length, entries: count, sha256_16: sha, manifestSha: src.sha256_16 || null }
  const keys = d && !Array.isArray(d) ? Object.keys(d) : []
  let range = ''
  if (src.id === 'strongs-hebrew' || src.id === 'strongs-greek') {
    const pre = src.id === 'strongs-hebrew' ? 'H' : 'G', nums = keys.filter(k => k[0] === pre).map(k => +k.slice(1)).filter(Number.isFinite)
    const max = Math.max(...nums), gaps = []; const set = new Set(nums); for (let i = 1; i <= max; i++) if (!set.has(i)) gaps.push(i)
    range = `${nums.length} entries numbered ${pre}1-${pre}${max}; ${gaps.length} numbers in that range without an entry${gaps.length ? ' (' + gaps.slice(0, 12).join(', ') + (gaps.length > 12 ? ', ...' : '') + ')' : ''}`
  }
  g.gates[1] = ['UNKNOWN', [E('m', `${count} top-level entries, ${buf.length} bytes${range ? '; ' + range : ''}`), 'Whether this matches the full published work is not established.']]
  g.gates[2] = ['UNKNOWN', [E('r', `manifest records originalLocation ${src.originalLocation || '(none)'} and sha256_16 ${src.sha256_16 || '(none)'}`), 'No edition, year or upstream origin recorded.']]
  g.gates[3] = [d == null ? 'FAIL' : 'UNKNOWN', [d == null ? E('m', 'file does not parse as JSON') : E('m', 'parses as JSON; no damage signatures run for this file type yet')]]
  const origFile = src.originalLocation ? path.join(path.dirname(path.resolve(libDir)), src.originalLocation) : null
  if (origFile && exists(origFile) && fs.statSync(origFile).isFile()) {
    const osha = crypto.createHash('sha256').update(fs.readFileSync(origFile)).digest('hex').slice(0, 16)
    let st = osha === sha ? 'PASS' : 'FAIL', extra = 'Byte-identical to the copy we hold in data/; not proof that data/ matches the published work.'
    if (osha !== sha) {
      try {   // re-keyed copy: same values under standardised keys?
        const a = JSON.parse(fs.readFileSync(origFile, 'utf8')), b = d
        const vs = o => Object.values(o).map(v => JSON.stringify(v)).sort().join('\n')
        const ka = new Set(Object.keys(a)), renamed = Object.keys(b).filter(k => !ka.has(k)).length
        if (a && b && !Array.isArray(a) && !Array.isArray(b) && vs(a) === vs(b)) { st = 'PASS'; extra = `Not byte-identical: ${renamed} keys were renamed to the standard book codes (e.g. DEUT -> DEU); every value is identical to the original. Deliberate standardisation recorded in the manifest build (Oct 24).` }
      } catch { /* leave FAIL */ }
    }
    g.gates[4] = [st, [E('m', `library file sha256_16 ${sha} ${osha === sha ? '=' : '!='} original ${src.originalLocation} ${osha}${src.sha256_16 ? '; manifest says ' + src.sha256_16 : ''}`), extra]]
  } else g.gates[4] = ['UNKNOWN', [E('m', 'original in data/ not found next to library/' + (src.sha256_16 ? `; manifest hash ${src.sha256_16} vs file ${sha} ${src.sha256_16 === sha ? 'agree' : 'DIFFER'}` : '')), E('e', 'library/ vs data/ was validated Oct 24')]]
  g.gates[5] = ['N/A', ['Not a verse-indexed commentary.']]
  const lic = { characters: 'Contains Theographic Bible Metadata (CC BY-SA 4.0): needs attribution. ' + (worker ? (/Theographic/i.test(worker) ? 'Worker names Theographic [measured].' : 'Worker does NOT name Theographic [measured]: attribution missing.') : '') }[src.id]
  g.gates[6] = [src.id === 'characters' && worker && !/Theographic/i.test(worker) ? 'FAIL' : 'UNKNOWN', [E('r', src.note || 'no licence recorded in the manifest'), lic || '']]
  g.gates[7] = regressionGate()
  return g
}

for (const s of manifest.sources) card.push(['commentary', 'xref', 'bible'].includes(s.kind) ? scoreText(s) : scoreRef(s))

// ---- next actions (the single most important one per source) ----
const NEXT = {
  mhc: 'Identify the edition (Concise vs Complete), then convert to the notes shape as the reference implementation; install the report-only workflow.',
  jfb: 'Add the validated notes records to the repo; serve whole notes instead of cutting at 2,000 characters; record edition/origin.',
  wesley: 'Recover the missing Psalms 100-150 and move 2 John to chapter 1 from a verified copy, recording what changed; then notes shape.',
  calvin: 'Audit chapter coverage per book (and Genesis 1:1); record origin and edition.',
  scofield: 'Label as word-anchored; add 3 John only if the original has notes there; no verse coverage claims.',
  spurgeon: 'Check that text under each verse key matches that verse (sampled review); record upstream hash.',
  'barnes-nt': 'Confirm which edition CCEL supplied; sampled anchoring review; consider it a candidate to replace the retired whole-Bible Barnes for the NT.',
  tyndale: 'Settle share-alike for the adapted files and attribution wording with the licence text; sampled anchoring review.',
  xref: 'Record dataset version and date; attribution already checked in the Worker.',
  'barnes-legacy': 'Replace with a complete edition (see candidates list); do not repair.', clarke: 'Replace with a complete edition; do not repair.',
  vincent: 'Replace with a complete edition; do not repair.', meyer: 'Replace with a complete edition (the Greek was garbled too).',
  bsb: 'Confirm the edition name (Berean Standard Bible vs Study Bible) and the public-domain statement at the publisher; record the upstream hash.',
  web: 'Record the exact WEB edition/date and upstream hash.', kjv: 'Record which KJV text this is (the 1769 Oxford text is recorded) and the upstream hash.', asv: 'Record the upstream copy and hash.',
  characters: 'Add the CC BY-SA attribution to the sources footer; record the Theographic version.',
}
for (const g of card) g.next = [NEXT[g.id] || 'Record edition, origin and licence; decide whether it needs validation checks.']

// ---- output ----
const sym = { PASS: 'PASS', FAIL: 'FAIL', UNKNOWN: 'UNKNOWN', 'N/A': 'N/A' }
const names = { 1: 'Complete', 2: 'Provenance', 3: 'Clean', 4: 'Preserved', 5: 'Verse coverage', 6: 'Licence', 7: 'Regression' }
let md = `# RabbiRabbit source scorecard\n\nGenerated by source-scorecard.mjs from \`${libDir}\` (manifest snapshot \`${manifest.sourceSnapshot}\`, ${manifest.sources.length} sources)${worker ? ` and Worker file \`${path.basename(workerFile)}\`` : ' (no Worker file given: attribution checks are UNKNOWN)'}. Read-only.\n\nEvidence tags: **[measured]** computed from the files now; **[recorded]** written in the manifest/data file, not independently confirmed; **[earlier]** an earlier result, not rechecked. A PASS needs evidence that meets the criterion; no evidence is UNKNOWN.\n\n## Summary\n\n| Source | ${Object.values(names).join(' | ')} |\n|---|${Object.values(names).map(() => '---').join('|')}|\n`
for (const g of card) md += `| ${g.name} (${g.id}) | ${[1, 2, 3, 4, 5, 6, 7].map(i => sym[g.gates[i][0]]).join(' | ')} |\n`
const tally = {}; for (const g of card) for (let i = 1; i <= 7; i++) tally[g.gates[i][0]] = (tally[g.gates[i][0]] || 0) + 1
md += `\nGate results over ${card.length} sources: ${Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(', ')}. **Fully verified sources (all applicable gates PASS): ${card.filter(g => [1, 2, 3, 4, 5, 6, 7].every(i => ['PASS', 'N/A'].includes(g.gates[i][0]))).length}.**\n\n## Detail and next action per source\n`
for (const g of card) {
  md += `\n### ${g.name} (${g.id}) - ${g.scope}, ${g.status}\n**Next action:** ${g.next[0]}\n\n`
  for (let i = 1; i <= 7; i++) { const [st, ev] = g.gates[i]; md += `- **${i}. ${names[i]}: ${st}**${ev.filter(Boolean).length ? '\n' + ev.filter(Boolean).map(e => `  - ${e}`).join('\n') : ''}\n` }
}
fs.writeFileSync(outPrefix + '.md', md)
fs.writeFileSync(outPrefix + '.json', JSON.stringify({ generatedFrom: libDir, sourceSnapshot: manifest.sourceSnapshot, sources: card }, null, 1))
console.log(md.split('## Detail')[0])
console.log(`wrote ${outPrefix}.md and ${outPrefix}.json`)