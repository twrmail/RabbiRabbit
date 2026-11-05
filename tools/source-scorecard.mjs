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
import { scanLibrary } from './guardian-scans.mjs'

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
    // a replace-all on a field the original does not have (the standardised `source` line of MHC, JFB and Calvin is added at build time by
    // build-library.mjs; it is metadata and gate 4 does not compare it) has nothing to re-apply to the original
    if (r.op === 'replace-all' && o[r.target] === undefined) continue
    if (r.op === 'add-field') continue   // a source line added to the library copy; metadata, not compared in gate 4
    used.push(r.id)
    if (r.op === 'replace-all') {
      let s = JSON.stringify(o[r.target])
      for (const [a, b] of r.pairs) s = s.split(JSON.stringify(a).slice(1, -1)).join(JSON.stringify(b).slice(1, -1))
      o = { ...o, [r.target]: JSON.parse(s) }
    } else if (r.op === 'strip-leading') {
      const esc = r.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const s = JSON.stringify(o.chapters).replace(new RegExp('("\\d+":")\\s*' + esc + '\\s*', 'g'), '$1')
      o = { ...o, chapters: JSON.parse(s) }
    } else if (r.op === 'rename-key') {
      // written separately from apply-library-fixes.mjs: rebuild the object from its entries
      const ent = Object.entries(o[r.target] || {})
      if (ent.some(([k]) => k === r.from) && !ent.some(([k]) => k === r.to)) o = { ...o, [r.target]: Object.fromEntries(ent.map(([k, v]) => [k === r.from ? r.to : k, v])) }
    } else if (r.op === 'add-chapters') {
      // written separately: reads the patch file itself and hashes with its own call; on any mismatch it adds nothing,
      // so the comparison with the original then fails visibly
      const pf = path.resolve(libDir, '..', r.patchFile)
      if (exists(pf)) {
        const patch = readJSON(pf), have = o[r.target] || {}, extra = {}
        let ok = true
        for (const [k, v] of Object.entries(patch.chapters)) {
          if (crypto.createHash('sha256').update(v.text, 'utf8').digest('hex') !== v.sha256) { ok = false; break }
          if (!(k in have)) extra[k] = v.text
        }
        if (ok) o = { ...o, [r.target]: { ...have, ...extra } }
      }
    } else if (r.op === 'insert-text') {
      // written separately: builds the new text from pieces and accepts it only if its sha256 equals the recorded "after" hash
      const pf = path.resolve(libDir, '..', r.patchFile)
      if (exists(pf)) {
        const patch = readJSON(pf), sha = x => crypto.createHash('sha256').update(x, 'utf8').digest('hex')
        const chs = { ...(o.chapters || {}) }; let intro = o.intro
        for (const ent of patch.chapters.filter(e => e.book === code)) {
          const text = ent.chapter === 'intro' ? intro : chs[ent.chapter]
          if (typeof text !== 'string' || sha(text) !== ent.beforeSha256) continue
          const parts = []; let last = 0
          for (const x of [...ent.inserts].sort((a, b) => a.offset - b.offset)) { parts.push(text.slice(last, x.offset), patch.insert); last = x.offset }
          parts.push(text.slice(last))
          const res = parts.join('')
          if (sha(res) !== ent.afterSha256) continue
          if (ent.chapter === 'intro') intro = res; else chs[ent.chapter] = res
        }
        o = { ...o, chapters: chs, ...(intro !== undefined ? { intro } : {}) }
      }
    } else if (r.op === 'insert-blocks') {
      // written separately: builds the new text from pieces and accepts it only if its sha256 equals the recorded "after" hash
      const pf = path.resolve(libDir, '..', r.patchFile)
      if (exists(pf) && Array.isArray(o.chapters)) {
        const patch = readJSON(pf), sha = x => crypto.createHash('sha256').update(x, 'utf8').digest('hex')
        o = { ...o, chapters: o.chapters.map(ch => {
          const e = patch.chapters.find(x => x.book === code && x.chapter === ch.chapter)
          if (!e || sha(ch.commentary) !== e.beforeSha256) return ch
          const parts = []; let last = 0
          for (const x of [...e.inserts].sort((a, b) => a.offset - b.offset)) { parts.push(ch.commentary.slice(last, x.offset), '\n\n', x.text); last = x.offset }
          parts.push(ch.commentary.slice(last))
          const res = parts.join('')
          return sha(res) === e.afterSha256 ? { ...ch, commentary: res } : ch
        }) }
      }
    } else if (r.op === 'move-blocks') {
      // written separately: cuts the recorded tail (offset, length and hash checked), puts the recorded text at the start, and accepts the result only if its sha256 equals the recorded "after" hash
      const pf = path.resolve(libDir, '..', r.patchFile)
      if (exists(pf) && Array.isArray(o.chapters)) {
        const patch = readJSON(pf), sha = x => crypto.createHash('sha256').update(x, 'utf8').digest('hex')
        o = { ...o, chapters: o.chapters.map(ch => {
          const e = patch.chapters.find(x => x.book === code && x.chapter === ch.chapter)
          if (!e || sha(ch.commentary) !== e.beforeSha256) return ch
          let t = ch.commentary
          if (e.cut) { const tail = t.slice(e.cut.offset); if (tail.length !== e.cut.length || sha(tail) !== e.cut.sha256) return ch; t = t.slice(0, e.cut.offset).trimEnd() }
          if (e.prepend !== null) { if (sha(e.prepend) !== e.prependSha256) return ch; t = e.prepend + '\n\n' + t }
          return sha(t) === e.afterSha256 ? { ...ch, commentary: t } : ch
        }) }
      }
    } else if (r.op === 'hold-blocks') {
      // written separately: cuts the recorded tail only if the held items (checked by their own hashes) add up to exactly that tail
      const pf = path.resolve(libDir, '..', r.patchFile), hf = path.resolve(libDir, '..', r.heldFile)
      if (exists(pf) && exists(hf) && Array.isArray(o.chapters)) {
        const patch = readJSON(pf), held = readJSON(hf).items || [], sha = x => crypto.createHash('sha256').update(x, 'utf8').digest('hex')
        o = { ...o, chapters: o.chapters.map(ch => {
          const e = patch.chapters.find(x => x.book === code && x.chapter === ch.chapter)
          if (!e || sha(ch.commentary) !== e.beforeSha256) return ch
          const tail = ch.commentary.slice(e.cut.offset, e.cut.offset + e.cut.length)
          if (tail.length !== e.cut.length || sha(tail) !== e.cut.sha256) return ch
          const its = e.heldIds.map(id => held.find(i => i.id === id))
          if (its.some(i => !i || sha(i.text) !== i.sha256) || its.map(i => i.text).join('') !== tail) return ch
          const before = ch.commentary.slice(0, e.cut.offset).trimEnd(), after = ch.commentary.slice(e.cut.offset + e.cut.length).trimStart()
          const t = after ? before + '\n\n' + after : before
          return sha(t) === e.afterSha256 ? { ...ch, commentary: t } : ch
        }) }
      }
    } else if (r.op === 'add-blocks') {
      // written separately: puts the recorded text at the start of the chapter and accepts the result only if its sha256 equals the recorded "after" hash
      const pf = path.resolve(libDir, '..', r.patchFile)
      if (exists(pf) && Array.isArray(o.chapters)) {
        const patch = readJSON(pf), sha = x => crypto.createHash('sha256').update(x, 'utf8').digest('hex')
        o = { ...o, chapters: o.chapters.map(ch => {
          const e = patch.chapters.find(x => x.book === code && x.chapter === ch.chapter)
          if (!e || sha(ch.commentary) !== e.beforeSha256 || sha(e.prepend) !== e.prependSha256) return ch
          const t = e.prepend + '\n\n' + ch.commentary
          return sha(t) === e.afterSha256 ? { ...ch, commentary: t } : ch
        }) }
      }
    } else if (r.op === 'replace-chapters') {
      // written separately: swaps in the patch text for a chapter only if our text hashes to the recorded "before" and the new text to "after"
      const pf = path.resolve(libDir, '..', r.patchFile)
      if (exists(pf) && Array.isArray(o.chapters)) {
        const patch = readJSON(pf), sha = x => crypto.createHash('sha256').update(x, 'utf8').digest('hex')
        o = { ...o, chapters: o.chapters.map(ch => {
          const e = patch.chapters.find(x => x.book === code && x.chapter === ch.chapter)
          return e && sha(ch.commentary) === e.beforeSha256 && sha(e.text) === e.afterSha256 ? { ...ch, commentary: e.text } : ch
        }) }
      }
    } else if (r.op === 'restructure-chapters') {
      // written separately: slices from the patch offsets and accepts a piece only if its sha256 matches the patch
      const pf = path.resolve(libDir, '..', r.patchFile)
      if (exists(pf)) {
        const patch = readJSON(pf), sha = x => crypto.createHash('sha256').update(x, 'utf8').digest('hex')
        const chs = { ...(o.chapters || {}) }
        for (const ent of patch.entries.filter(e => e.book === code)) {
          const src = chs[ent.chapter]
          if (typeof src !== 'string' || sha(src) !== ent.beforeSha256) continue
          const out = ent.pieces.map(pc => src.slice(pc.start, pc.end))
          if (!out.every((t, i) => sha(t) === ent.pieces[i].sha256)) continue
          ent.pieces.forEach((pc, i) => { chs[pc.chapter] = out[i] })
        }
        o = { ...o, chapters: Object.fromEntries(Object.entries(chs).sort((a, b) => +a[0] - +b[0])) }
      }
    } else if (r.op === 'split-intro') {
      const text = o[r.field], at = typeof text === 'string' ? text.indexOf(r.anchor) : -1
      if (at >= 0 && text.indexOf(r.anchor, at + 1) < 0 && !(r.chapter in (o[r.target] || {}))) {
        o = { ...o, [r.field]: text.slice(0, at).trimEnd(), [r.target]: { ...o[r.target], [r.chapter]: text.slice(at) } }
      }
    }
  }
  return { obj: o, used }
}
const codes = Array.isArray(manifest.bookCodes) ? manifest.bookCodes : manifest.bookCodes.split(/\s+/)
const srcLines = new Map()   // each source's own `source` line, kept for the Gate 2 / Gate 6 rules applied with the register
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

const TAGS = { m: '[measured]', r: '[recorded]', e: '[earlier]', p: '[provenance register]' }
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
  srcLines.set(src.id, srcStr)
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
  if (src.kind === 'bible') {
    // Bibles: the original is ONE file in data/ (web/kjv/asv: books[{code, chapters[{chapter, verses[{verse, text}]}]}]; bsb: books{CODE:{chapter:{verse:text}}}).
    // Each book is rebuilt into the library shape, the recorded fixes are re-applied, and every verse is compared. Missing verses, extra verses,
    // emptied verses and changed text are counted separately, so an empty or missing verse is never "normalised" into agreement.
    const origFile = src.originalLocation ? path.join(repoRoot, src.originalLocation) : null
    if (origFile && exists(origFile) && fs.statSync(origFile).isFile()) {
      const o0 = readJSON(origFile), byCode = {}
      if (Array.isArray(o0.books)) for (const bk of o0.books) byCode[bk.code] = bk.chapters.map(c => ({ chapter: c.chapter, verses: Object.fromEntries(c.verses.map(v => [String(v.verse), v.text])) }))
      else for (const [code, chs] of Object.entries(o0.books || {})) byCode[code] = Object.entries(chs).sort((a, b) => a[0] - b[0]).map(([n, vs]) => ({ chapter: Number(n), verses: vs }))
      const st = { books: 0, same: 0, noOrig: [], missingVerse: 0, extraVerse: 0, emptied: 0, changed: 0, chapterMismatch: 0, origEmpty: 0 }, where = []; const fixUsed = {}
      for (const b of present) {
        st.books++
        const lib = readJSON(path.join(libDir, '..', src.folder, b + '.json'))
        if (!byCode[b]) { st.noOrig.push(b); continue }
        const fx = applyRecordedFixes(src.id, b, { chapters: byCode[b] }); fx.used.forEach(id => { fixUsed[id] = (fixUsed[id] || 0) + 1 })
        const oc = fx.obj.chapters, lc = lib.chapters; let bad = false
        const nums = new Set([...oc.map(c => c.chapter), ...lc.map(c => c.chapter)])
        for (const n of nums) {
          const a = oc.find(c => c.chapter === n), l = lc.find(c => c.chapter === n)
          if (!a || !l) { st.chapterMismatch++; bad = true; where.push(`${b} ${n} chapter ${a ? 'missing from library' : 'not in original'}`); continue }
          for (const vk of new Set([...Object.keys(a.verses), ...Object.keys(l.verses)])) {
            const x = a.verses[vk], y = l.verses[vk]
            if (x === undefined) { st.extraVerse++; bad = true; where.push(`${b} ${n}:${vk} extra`) }
            else if (y === undefined) { st.missingVerse++; bad = true; where.push(`${b} ${n}:${vk} missing`) }
            else if (x === y) { if (x === '') st.origEmpty++ }
            else if (y === '' ) { st.emptied++; bad = true; where.push(`${b} ${n}:${vk} emptied`) }
            else { st.changed++; bad = true; where.push(`${b} ${n}:${vk} changed`) }
          }
        }
        if (!bad) st.same++
      }
      const ok = st.same === st.books && !st.noOrig.length
      g.gates[4] = [ok ? 'PASS' : 'FAIL', [E('m', `${st.same} of ${st.books} books equal the original verse by verse after re-applying the recorded fixes (${Object.keys(fixUsed).join(', ') || 'none'}); missing verses ${st.missingVerse}, extra verses ${st.extraVerse}, emptied verses ${st.emptied}, changed text ${st.changed}, chapter mismatches ${st.chapterMismatch}, no original found ${st.noOrig.length}${st.origEmpty ? `; ${st.origEmpty} verses are empty in the original and in the library` : ''}${where.length ? '; first: ' + where.slice(0, 5).join(', ') : ''}`), 'This proves library = the copy we hold in data/. It does not prove data/ matches the published edition (gate 2).']]
    } else g.gates[4] = ['UNKNOWN', [E('e', 'library/ vs data/ compared verse by verse (validate-library.mjs, Oct 24). Not rechecked here: the original file was not found next to library/.')]]
  }

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
    lic = [found === true ? 'UNKNOWN' : found === false ? 'FAIL' : 'UNKNOWN', [E('r', `licence: ${license || srcStr.slice(0, 120)}`), found === null ? 'Worker file not given, so the attribution could not be checked.' : E('m', `Worker file ${found ? 'names' : 'does NOT name'} "${m}"`), src.id === 'tyndale' ? 'Share-alike: our converted files are reshaped copies; if they count as adaptations they must be offered under CC BY-SA 4.0 or a compatible licence, with changes indicated. Not yet reviewed.' : '']]
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
  srcLines.set(src.id, d && typeof d.source === 'string' ? d.source : '')
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
      // recorded fixes (library/fixes.json, op set-entry-text): re-apply them to the original with code separate from apply-library-fixes.mjs;
      // PASS only if the result equals the library file exactly. Only ADDING or EXTENDING a bio is allowed: the original text must be the start of the new text.
      const textRules = st === 'FAIL' && fixes ? fixes.rules.filter(r => r.source === src.id && r.op === 'set-entry-text') : []
      if (textRules.length) {
        try {
          const repoRoot = path.dirname(path.resolve(libDir))
          let want = JSON.parse(fs.readFileSync(origFile, 'utf8')), changedBios = 0, problem = null, corrected = 0
          for (const r of textRules) {
            const patch = readJSON(path.join(repoRoot, r.patchFile)), table = { ...want[r.target] }
            for (const [k, e] of Object.entries(patch.entries)) {
              const cur = table[k] && table[k].bio || ''
              if (!table[k] || crypto.createHash('sha256').update(e.bio).digest('hex') !== e.sha256 || (e.oldSha256 ? crypto.createHash('sha256').update(cur).digest('hex') !== e.oldSha256 : (cur && !e.bio.startsWith(cur)))) { problem = `patch entry ${k} is not a valid addition or extension`; break }
              if (cur !== e.bio) { changedBios++; if (e.oldSha256) corrected++ }
              table[k] = { ...table[k], bio: e.bio }
            }
            want = { ...want, [r.target]: table }
          }
          if (!problem && isDeepStrictEqual(want, d)) { st = 'PASS'; extra = `Not byte-identical: ${changedBios} bios were added or completed by recorded fixes (${textRules.map(r => r.id).join(', ')}); re-applied to the original here, the result equals the library file exactly, and ${corrected ? corrected + ' of them are corrections that replace an earlier text named by its sha256, every other existing bio only grew' : 'no existing bio text was shortened or changed'}.` }
          else if (problem) extra = problem
        } catch { /* leave FAIL */ }
      }
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

// ---- provenance register (library/provenance.json): evidence lines only, never a status change ----
// Stage B: the register is shown next to gates 2 and 6. A recorded witness or licence statement does not turn UNKNOWN/FAIL into PASS here;
// that needs a separately reviewed rule. The register itself is checked strictly: wrong ids, a missing source or an unknown level stop the run.
const provPath = path.join(libDir, 'provenance.json')
let provLevels = null
if (exists(provPath)) {
  const prov = readJSON(provPath)
  const mIds = manifest.sources.map(x => x.id), pIds = prov.sources.map(x => x.sourceId)
  const problems = []
  for (const id of mIds) if (!pIds.includes(id)) problems.push(`no provenance entry for manifest source "${id}"`)
  for (const id of pIds) if (!mIds.includes(id)) problems.push(`provenance entry "${id}" is not in the manifest`)
  for (const id of pIds) if (pIds.indexOf(id) !== pIds.lastIndexOf(id)) problems.push(`duplicate provenance entry "${id}"`)
  for (const e of prov.sources) {
    if (!(e.evidenceLevel in prov.evidenceLevels)) problems.push(`${e.sourceId}: unknown evidenceLevel "${e.evidenceLevel}"`)
    if (e.evidenceLevel === 'witnessed' && !(e.witnesses || []).length) problems.push(`${e.sourceId}: level "witnessed" but no witness recorded`)
    if (!e.rights || !e.rights.claim || !e.rights.scope) problems.push(`${e.sourceId}: rights needs a claim and a scope`)
    const os = e.repositoryCopy && e.repositoryCopy.originStatus, cov = e.rights && e.rights.repositoryCopyCoverage
    const okOs = prov.allowedValues.originStatus, okCov = prov.allowedValues.repositoryCopyCoverage
    if (!okOs.includes(os)) problems.push(`${e.sourceId}: originStatus "${os}" is not one of ${okOs.join('/')}`)
    if (!okCov.includes(cov)) problems.push(`${e.sourceId}: repositoryCopyCoverage "${cov}" is not one of ${okCov.join('/')}`)
    if ((e.evidenceLevel === 'established') !== (os === 'established')) problems.push(`${e.sourceId}: evidenceLevel "${e.evidenceLevel}" is inconsistent with originStatus "${os}" (both must say established, or neither)`)
    if (os === 'recorded-in-repo' && e.evidenceLevel === 'unidentified') problems.push(`${e.sourceId}: origin recorded in the repo but level is "unidentified"`)
    if (cov === 'established' && !(e.rights.statementText && e.rights.dateChecked)) problems.push(`${e.sourceId}: repositoryCopyCoverage "established" needs the exact statementText and a dateChecked`)
    if (cov === 'established' && e.evidenceLevel !== 'established') problems.push(`${e.sourceId}: rights coverage of our copy cannot be established while its origin is not (level "${e.evidenceLevel}")`)
    for (const c of e.rightsComponents || []) if (!c.component || !c.claim || !c.status) problems.push(`${e.sourceId}: each rightsComponent needs component, claim and status`)
    for (const w of e.witnesses || []) if (!['measured', 'page-read', 'recorded-only'].includes(w.status)) problems.push(`${e.sourceId}: witness "${w.name}" has status "${w.status}"`)
  }
  if (problems.length) { console.error('provenance.json problems:\n- ' + problems.join('\n- ')); process.exit(1) }
  provLevels = {}
  for (const e of prov.sources) {
    const g = card.find(x => x.id === e.sourceId)
    provLevels[e.evidenceLevel] = (provLevels[e.evidenceLevel] || 0) + 1
    const w = (e.witnesses || []).map(x => `${x.name} (${x.status}${x.agreement ? '; ' + x.agreement : ''})`).join('; ') || 'none recorded'
    g.gates[2][1].push(E('p', `evidence level "${e.evidenceLevel}" (${prov.evidenceLevels[e.evidenceLevel]}); witnesses: ${w}`))
    if (e.openQuestions && e.openQuestions.length) g.gates[2][1].push(E('p', `${e.openQuestions.length} open question(s): ${e.openQuestions.join(' | ')}`))
    g.gates[6][1].push(E('p', `rights claim "${e.rights.claim}" from ${e.rights.claimSource}, scope: ${e.rights.scope}; applies to our copy: ${e.rights.repositoryCopyCoverage}; checked ${e.rights.dateChecked || 'unknown date'}`))
    for (const c of e.rightsComponents || []) g.gates[6][1].push(E('p', `rights component: ${c.component}: ${c.claim} (${c.status}; ${c.source || 'no source'})`))
    if (e.obligations && e.obligations.length) g.gates[6][1].push(E('p', `obligations: ${e.obligations.join(' | ')}`))

    // ---- Gate 2 and Gate 6 rules (tools/GATE-DEFINITIONS.md). PASS needs every criterion; a witness or a licence statement alone never does. ----
    const line = srcLines.get(e.sourceId) || ''
    const yearIn = x => /\b(1[5-9]\d\d|20[0-2]\d)\b/.test(x || '')
    if (g.scope !== 'retired') {
      // Gate 2
      const recs = (e.acquisition && e.acquisition.records) || []
      const c1 = !!line && !/not recorded|not identified|origin and edition/i.test(line) && yearIn(line)
      const c2 = !!line && /via |from |rebuilt|CCEL|seven1m|bereanbibles|lyteword|tyndaleopenresources|openbible|HelloAO|scrollmapper/i.test(line)
      const c3 = recs.some(r => r.kind === 'measured' || r.kind === 'git-history')
      const c4 = !!(e.acquisition && e.acquisition.versionMarker)
      g.gates[2][1].push(E('p', `Gate 2 criteria: (1) work and edition named in the file's source line: ${c1 ? 'yes' : 'NO'}; (2) digital origin named in the file: ${c2 ? 'yes' : 'NO'}; (3) a measured match or git-history record in the register: ${c3 ? 'yes' : 'NO'}; (4) a version marker in the register (acquisition.versionMarker): ${c4 ? 'yes' : 'NO'}`))
      if (g.gates[2][0] !== 'FAIL' && c1 && c2 && c3 && c4) g.gates[2][0] = 'PASS'
      // Gate 6
      const claim = (e.rights && e.rights.claim) || '', obligations = e.obligations || []
      const licensed = /CC BY/i.test(claim + ' ' + ((manifest.sources.find(x => x.id === e.sourceId) || {}).license || ''))
      if (licensed) {
        const m = e.sourceId === 'tyndale' ? 'Tyndale' : e.sourceId === 'xref' ? 'OpenBible' : null
        const shown = m && worker ? new RegExp(m, 'i').test(worker) : null
        const sa = /SA|share/i.test(claim)
        const saOk = !sa || !!e.shareAlikeDecision
        const recorded = !!(claim && e.rights.claimSource && obligations.length)
        g.gates[6][1].push(E('p', `Gate 6 criteria (licensed): licence, source and conditions recorded: ${recorded ? 'yes' : 'NO'}; attribution shown by the Worker: ${shown === null ? 'not checked' : shown ? 'yes' : 'NO'}; share-alike decision written down (shareAlikeDecision): ${sa ? (saOk ? 'yes' : 'NO') : 'not applicable'}`))
        if (g.gates[6][0] === 'UNKNOWN' && recorded && shown === true && saOk) g.gates[6][0] = 'PASS'
      } else if (/public domain/i.test(claim)) {
        const w = e.work || {}
        const dateText = [w.year, w.date, w.firstPublished, (e.repositoryCopy || {}).edition, line].filter(Boolean).join(' ')
        const claimed = /claimed|per repo/i.test((e.repositoryCopy || {}).edition || '')
        const workId = !!(w.title && w.author) && yearIn(dateText) && !(claimed && !yearIn([w.year, w.date, w.firstPublished, line].filter(Boolean).join(' ')))
        const digLic = !!(e.rights.digitalEditionLicence || /conversion|CC0/i.test(claim))
        g.gates[6][1].push(E('p', `Gate 6 criteria (public domain by age): work and date identified (a date only claimed in the repo does not count): ${workId ? 'yes' : 'NO'}; licence of the digital edition recorded (rights.digitalEditionLicence, "none found" counts once checked): ${digLic ? 'yes' : 'NO'}`))
        if (g.gates[6][0] === 'UNKNOWN' && workId && digLic) g.gates[6][0] = 'PASS'
      }
    }
  }
}

// ---- held material (library/held/*.json): text cut from a source because it is not what that source's chapter should hold ----
// Checked strictly (a problem stops the run): every item must hash to its own text, ids must be unique, the rule that cut it must exist, and
// every item that a hold-blocks rule names must be in the patch. It never changes a gate result; it adds an evidence line under gate 3, so
// a cut is never invisible. An item whose text is still in the library chapter is reported as "not yet cut" (the rule has not been applied).
const heldDir = path.join(libDir, 'held')
let heldSummary = null
if (exists(heldDir)) {
  const problems = [], fixesDoc = readJSON(path.join(libDir, 'fixes.json')), shaH = x => crypto.createHash('sha256').update(x, 'utf8').digest('hex'), seen = new Set()
  heldSummary = { files: 0, items: 0, words: 0, stillInLibrary: 0 }
  for (const hf of fs.readdirSync(heldDir).filter(f => f.endsWith('.json')).sort()) {
    const doc = readJSON(path.join(heldDir, hf)); heldSummary.files++
    for (const it of doc.items || []) {
      heldSummary.items++; heldSummary.words += it.words || 0
      if (seen.has(it.id)) problems.push(`${hf}: duplicate held id ${it.id}`); seen.add(it.id)
      if (shaH(it.text) !== it.sha256) problems.push(`${hf}: ${it.id} does not match its own sha256`)
      if (it.words !== it.text.split(/\s+/).filter(Boolean).length) problems.push(`${hf}: ${it.id} word count is wrong`)
      if (!['translation', 'index', 'placeholder', 'dedication', 'table', 'title-page', 'back-matter', 'unresolved'].includes(it.classification)) problems.push(`${hf}: ${it.id} has unknown classification "${it.classification}"`)
      if (it.status !== 'held') problems.push(`${hf}: ${it.id} has status "${it.status}" (expected held)`)
      const rule = fixesDoc.rules.find(r => r.id === it.removedByRule)
      if (!rule) problems.push(`${hf}: ${it.id} names rule "${it.removedByRule}" which is not in fixes.json`)
      const g = card.find(x => x.id === it.source), f = path.join(libDir, '..', it.foundIn.file)
      if (!g) problems.push(`${hf}: ${it.id} names source "${it.source}" which is not in the manifest`)
      else if (exists(f)) {
        const ch = (readJSON(f).chapters || []).find(c => c.chapter === it.foundIn.chapter)
        if (ch && ch.commentary.includes(it.text)) heldSummary.stillInLibrary++
      }
    }
  }
  // Reversibility: for every hold-blocks cut that has been applied, the original chapter is rebuilt from the library chapter and the held items
  // (head + the whitespace the cut removed + the held items in order + the removed whitespace + the rest) and must hash to the recorded "before"
  // sha256. Rules are walked last to first so that a chapter cut by several rules is unwound one rule at a time. Each item's recorded offset
  // must equal where it sat in the chapter, and each item must name a proposed destination.
  const holdRules = fixesDoc.rules.filter(x => x.op === 'hold-blocks'), cur = {}, rebuilt = {}, notRebuilt = []
  const libCh = (book, n, src) => { const f = path.join(libDir, 'commentary', 'Calvin', book + '.json'); return exists(f) ? ((readJSON(f).chapters || []).find(c => c.chapter === n) || {}).commentary : undefined }
  const heldKeys = new Set(holdRules.flatMap(r => readJSON(path.join(libDir, '..', r.patchFile)).chapters.map(e => e.book + ' ' + e.chapter)))
  for (const r of [...fixesDoc.rules].reverse().filter(x => x.op === 'hold-blocks' || x.op === 'move-blocks')) {
    if (r.op === 'move-blocks') {   // a move after a hold on the same chapter (e.g. a table added at the start) is unwound first, so the hold can then be checked
      const mp = readJSON(path.join(libDir, '..', r.patchFile))
      for (const e of mp.chapters) {
        const key = e.book + ' ' + e.chapter; if (!heldKeys.has(key)) continue
        if (!holdRules.some(h => fixesDoc.rules.indexOf(h) < fixesDoc.rules.indexOf(r) && readJSON(path.join(libDir, '..', h.patchFile)).chapters.some(x => x.book === e.book && x.chapter === e.chapter))) continue   // only a move that comes AFTER a hold on this chapter has to be unwound
        if (!(key in cur)) cur[key] = libCh(e.book, e.chapter)
        const text = cur[key]
        if (typeof text !== 'string' || shaH(text) !== e.afterSha256 || shaH(text) === e.beforeSha256) continue
        let back = text
        if (e.prepend !== null && e.prepend !== undefined) { if (!back.startsWith(e.prepend + '\n\n')) { problems.push(`rule ${r.id}: ${key} does not start with the text this rule added`); continue } back = back.slice(e.prepend.length + 2) }
        if (e.cut) {
          const dest = e.movedTo && mp.chapters.find(x => x.book === e.movedTo.book && x.chapter === e.movedTo.chapter)
          if (!dest || typeof dest.prepend !== 'string' || typeof e.gapBefore !== 'string') { notRebuilt.push(`${key} (a cut by ${r.id} cannot be rebuilt from the patch)`); continue }
          back = back + e.gapBefore + dest.prepend
        }
        if (shaH(back) !== e.beforeSha256) problems.push(`rule ${r.id}: ${key} cannot be unwound to its recorded before state`)
        else cur[key] = back
      }
      continue
    }
    const patch = readJSON(path.join(libDir, '..', r.patchFile)), hdoc = readJSON(path.join(libDir, '..', r.heldFile)), hid = new Map(hdoc.items.map(i => [i.id, i]))
    for (const e of patch.chapters) {
      for (const id of e.heldIds) if (!hid.has(id)) problems.push(`rule ${r.id}: ${e.book} ${e.chapter} names held item ${id} which is not in ${r.heldFile}`)
      if (e.heldIds.some(id => !hid.has(id))) continue
      const key = e.book + ' ' + e.chapter, items = e.heldIds.map(id => hid.get(id)), region = items.map(i => i.text).join('')
      let at = e.cut.offset
      for (const it of items) { if (it.foundIn.offsetInChapterBeforeCut !== at) problems.push(`rule ${r.id}: ${key} item ${it.id} records offset ${it.foundIn.offsetInChapterBeforeCut} but sat at ${at}`); at += it.text.length }
      for (const it of items) if (!it.proposedDestination) problems.push(`${it.id}: no proposed destination recorded`)
      if (!(key in cur)) cur[key] = libCh(e.book, e.chapter)
      const text = cur[key]
      if (typeof text !== 'string') { notRebuilt.push(`${key} (library file not present)`); continue }
      if (shaH(text) === e.beforeSha256) continue            // this cut has not been applied here; nothing to rebuild
      if (shaH(text) !== e.afterSha256) { notRebuilt.push(`${key} (chapter text is neither the recorded before nor after state of ${r.id})`); continue }
      if (typeof e.gapBefore !== 'string' || (e.gapAfter !== null && typeof e.gapAfter !== 'string')) { problems.push(`rule ${r.id}: ${key} does not record the whitespace the cut removed (gapBefore/gapAfter)`); continue }
      const hl = e.cut.offset - e.gapBefore.length
      const orig = e.gapAfter === null ? text.slice(0, hl) + e.gapBefore + region : text.slice(0, hl) + e.gapBefore + region + e.gapAfter + text.slice(hl + 2)
      if (e.gapAfter !== null && text.slice(hl, hl + 2) !== '\n\n') problems.push(`rule ${r.id}: ${key} the join in the library text is not the expected blank line`)
      if (e.gapAfter === null && text.length !== hl) problems.push(`rule ${r.id}: ${key} the library text is longer than the part before the cut`)
      if (shaH(orig) !== e.beforeSha256) problems.push(`rule ${r.id}: ${key} CANNOT be rebuilt: the library chapter plus the held text does not give the recorded original`)
      else { cur[key] = orig; rebuilt[r.id] = (rebuilt[r.id] || 0) + 1 }
    }
  }
  if (problems.length) { console.error('library/held problems:\n- ' + problems.join('\n- ')); process.exit(1) }
  heldSummary.rebuilt = Object.values(rebuilt).reduce((a, b) => a + b, 0); heldSummary.notRebuilt = notRebuilt
  const by = {}
  for (const hf of fs.readdirSync(heldDir).filter(f => f.endsWith('.json'))) for (const it of readJSON(path.join(heldDir, hf)).items) { by[it.source] ||= { n: 0, w: 0, c: {} }; by[it.source].n++; by[it.source].w += it.words; by[it.source].c[it.classification] = (by[it.source].c[it.classification] || 0) + 1 }
  for (const [id, v] of Object.entries(by)) {
    const g = card.find(x => x.id === id)
    g.facts.held = { items: v.n, words: v.w, byClass: v.c, cutsRebuiltExactly: heldSummary.rebuilt, cutsNotChecked: notRebuilt.length }
    g.gates[3][1].push(E('m', `HELD, NOT MISSING: ${v.n} classified item(s), ${v.w.toLocaleString()} words, cut from the commentary and kept word for word in library/held (${Object.entries(v.c).map(([k, n]) => n + ' ' + k).join(', ')}). Not counted as missing commentary and not served as commentary. ${heldSummary.rebuilt} cut(s) were rebuilt from the library chapter plus the held text and match the recorded original exactly${notRebuilt.length ? '; not checked: ' + notRebuilt.join('; ') : ''}`))
  }
}

// ---- moved text: a move-blocks patch that names where text goes (movedTo / movedFrom) must add to the destination exactly what it cut from the source ----
// Checked strictly (a problem stops the run): the cut's sha256 and length must equal those of the text added at the destination, both ends must name
// each other, and once the rule has been applied the library chapter at the destination must contain the moved text. It adds an evidence line under
// gate 3; it never changes a gate result.
let movedSummary = null
{
  const problems = [], fx = readJSON(path.join(libDir, 'fixes.json')), shaM = x => crypto.createHash('sha256').update(x, 'utf8').digest('hex'); let checked = 0, notYet = 0, blocks = 0
  const bySource = {}
  for (const r of fx.rules.filter(x => x.op === 'move-blocks')) {
    const pf = path.join(libDir, '..', r.patchFile); if (!exists(pf)) continue
    const patch = readJSON(pf)
    for (const e of patch.chapters) {
      if (!e.movedTo && !e.movedFrom) continue
      if (e.movedFrom && !patch.chapters.some(x => x.book === e.movedFrom.book && x.chapter === e.movedFrom.chapter && x.movedTo && x.movedTo.book === e.book && x.movedTo.chapter === e.chapter)) problems.push(`rule ${r.id}: ${e.book} ${e.chapter} says its text came from ${e.movedFrom.book} ${e.movedFrom.chapter}, which does not say it sent it`)
      if (!e.movedTo) continue
      blocks++
      const d = patch.chapters.find(x => x.book === e.movedTo.book && x.chapter === e.movedTo.chapter)
      if (!d || typeof d.prepend !== 'string') { problems.push(`rule ${r.id}: ${e.book} ${e.chapter} sends text to ${e.movedTo.book} ${e.movedTo.chapter}, which adds nothing`); continue }
      if (shaM(d.prepend) !== e.cut.sha256 || d.prepend.length !== e.cut.length) { problems.push(`rule ${r.id}: the text cut from ${e.book} ${e.chapter} is not the text added to ${d.book} ${d.chapter}`); continue }
      if (!d.movedFrom || d.movedFrom.book !== e.book || d.movedFrom.chapter !== e.chapter) problems.push(`rule ${r.id}: ${d.book} ${d.chapter} does not say it received the text from ${e.book} ${e.chapter}`)
      const dest = (() => { const f = path.join(libDir, 'commentary', 'Calvin', d.book + '.json'); return exists(f) ? ((readJSON(f).chapters || []).find(c => c.chapter === d.chapter) || {}).commentary : undefined })()
      const src = (() => { const f = path.join(libDir, 'commentary', 'Calvin', e.book + '.json'); return exists(f) ? ((readJSON(f).chapters || []).find(c => c.chapter === e.chapter) || {}).commentary : undefined })()
      if (typeof dest === 'string' && dest.includes(d.prepend)) checked++
      else if (typeof src === 'string' && shaM(src) === e.beforeSha256) notYet++
      else if (typeof dest === 'string') problems.push(`rule ${r.id}: the text moved from ${e.book} ${e.chapter} is not at the start of ${d.book} ${d.chapter} in the library`)
      bySource[patch.source] = (bySource[patch.source] || 0) + 1
    }
  }
  if (problems.length) { console.error('moved text problems:\n- ' + problems.join('\n- ')); process.exit(1) }
  if (blocks) {
    movedSummary = { blocks, checked, notYet }
    for (const [id, n] of Object.entries(bySource)) { const g = card.find(x => x.id === id); if (g) { g.facts.movedText = { blocks: n, verifiedAtDestination: checked, notYetApplied: notYet }; g.gates[3][1].push(E('m', `MOVED, NOT LOST: ${n} block(s) of front matter, arguments, dedications and chapter-opening tables were cut from the wrong chapter and added to the right one; for each, the cut and the added text have the same length and sha256 and the text is found at the destination in the library`)) } }
  }
}

// ---- boundary and back-matter scans (tools/guardian-scans.mjs) ----
{
  const scan = scanLibrary(libDir)
  for (const id of scan.scanned) {
    const g = card.find(x => x.id === id); if (!g) continue
    const mine = scan.findings.filter(f => f.source === id), open = mine.filter(f => !f.explained), done = mine.filter(f => f.explained)
    g.facts.scans = { unexplained: open.length, explained: done.length, staleExceptions: scan.staleExceptions.filter(e => e.source === id).length }
    if (open.length) {
      if (g.gates[3][0] === 'PASS') g.gates[3][0] = 'FAIL'
      g.gates[3][1].push(E('m', `SCAN FINDINGS NOT EXPLAINED (${open.length}): ${open.map(f => `${f.book} ${f.chapter} ${f.check}${f.detail ? ' (' + f.detail.slice(0, 60) + ')' : ''}`).join('; ')}. See tools/guardian-scans.mjs; explain in library/scan-exceptions.json only after checking, or repair.`))
    } else g.gates[3][1].push(E('m', `boundary and back-matter scans: no unexplained finding in ${id} (end of each chapter against the start of the next; CCEL title-page text; index runs)${done.length ? `; ${done.length} accepted with a recorded reason in library/scan-exceptions.json, each present in the untouched original` : ''}`))
  }
  if (scan.staleExceptions.length) { console.error('scan-exceptions.json has stale entries (finding no longer present):\n- ' + scan.staleExceptions.map(e => `${e.source} ${e.book} ${e.chapter} ${e.check}`).join('\n- ')); process.exit(1) }
}

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
md += `\nGate results over ${card.length} sources: ${Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(', ')}. **Fully verified sources (all applicable gates PASS): ${card.filter(g => [1, 2, 3, 4, 5, 6, 7].every(i => ['PASS', 'N/A'].includes(g.gates[i][0]))).length}.**${movedSummary ? `\n\nMoved text: ${movedSummary.checked} of ${movedSummary.blocks} moved block(s) found at their destination chapter${movedSummary.notYet ? ', ' + movedSummary.notYet + ' not yet applied' : ''}; for each, the text cut equals the text added (same length and sha256).` : ''}${heldSummary ? `\n\nHeld material: ${heldSummary.items} item(s), ${heldSummary.words.toLocaleString()} words in ${heldSummary.files} file(s) in library/held; ${heldSummary.stillInLibrary} still present in the library text (not yet cut). ${heldSummary.rebuilt} applied cut(s) rebuilt exactly from the library plus the held text. Held material is classified and visible here; it is not counted as missing commentary.` : ''}${provLevels ? `\n\nProvenance register evidence levels: ${Object.entries(provLevels).map(([k, v]) => `${v} ${k}`).join(', ')}. These describe evidence; they do not change any gate result.` : ''}\n\n## Detail and next action per source\n`
for (const g of card) {
  md += `\n### ${g.name} (${g.id}) - ${g.scope}, ${g.status}\n**Next action:** ${g.next[0]}\n\n`
  for (let i = 1; i <= 7; i++) { const [st, ev] = g.gates[i]; md += `- **${i}. ${names[i]}: ${st}**${ev.filter(Boolean).length ? '\n' + ev.filter(Boolean).map(e => `  - ${e}`).join('\n') : ''}\n` }
}
fs.writeFileSync(outPrefix + '.md', md)
fs.writeFileSync(outPrefix + '.json', JSON.stringify({ generatedFrom: libDir, sourceSnapshot: manifest.sourceSnapshot, sources: card }, null, 1))
console.log(md.split('## Detail')[0])
console.log(`wrote ${outPrefix}.md and ${outPrefix}.json`)