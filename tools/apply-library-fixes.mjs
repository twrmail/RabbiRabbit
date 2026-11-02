// Applies library/fixes.json to library/ (the recorded, counted text fixes). DRY RUN by default; --write to change files.
// Usage from the repo root:  node apply-library-fixes.mjs .            (report only)
//                            node apply-library-fixes.mjs . --write    (writes library files; refuses unless every count equals expectedCount)
// Never touches data/. Idempotent: a rule that is already applied reports 0 changes and is not an error.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
const [, , root = '.', flag] = process.argv
const write = flag === '--write'
const check = flag === '--check'   // CI mode: exit 1 unless every rule is already applied
const fixes = JSON.parse(fs.readFileSync(path.join(root, 'library', 'fixes.json'), 'utf8'))
const walk = (o, fn) => Array.isArray(o) ? o.map(v => walk(v, fn)) : (o && typeof o === 'object') ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, walk(v, fn)])) : (typeof o === 'string' ? fn(o) : o)
const results = []
let abort = false
for (const rule of fixes.rules) {
  const counts = {}, pending = []
  for (const code of rule.files) {
    const file = path.join(root, rule.folder, code + '.json')
    const raw = fs.readFileSync(file, 'utf8'), d = JSON.parse(raw)
    const bump = k => { counts[k] = (counts[k] || 0) + 1 }
    let nd = d
    if (rule.op === 'strip-leading') {
      const re = new RegExp('^\\s*' + rule.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*')
      nd = { ...d, chapters: d.chapters.map(ch => ({ ...ch, [rule.target]: Object.fromEntries(Object.entries(ch[rule.target]).map(([k, t]) => { if (re.test(t)) { bump(rule.find); return [k, t.replace(re, '')] } return [k, t] })) })) }
    } else if (rule.op === 'replace-all') {
      nd = { ...d, [rule.target]: walk(d[rule.target], s => { let o = s; for (const [a, b] of rule.pairs) { const n = o.split(a).length - 1; if (n) { for (let i = 0; i < n; i++) bump(a); o = o.split(a).join(b) } } return o }) }
    } else if (rule.op === 'rename-key') {
      // chapters stored under the wrong number: move text from key `from` to key `to` (only if `to` is free)
      const t = d[rule.target]
      if (Object.prototype.hasOwnProperty.call(t, rule.from) && !Object.prototype.hasOwnProperty.call(t, rule.to)) {
        bump(rule.from)
        const nt = {}; for (const [k, v] of Object.entries(t)) nt[k === rule.from ? rule.to : k] = v
        nd = { ...d, [rule.target]: nt }
      }
    } else if (rule.op === 'split-intro') {
      // a chapter's notes were stored inside the book introduction: cut at an exact anchor string (must occur once)
      const intro = d[rule.field], t = d[rule.target]
      if (typeof intro === 'string' && !Object.prototype.hasOwnProperty.call(t, rule.chapter)) {
        const parts = intro.split(rule.anchor)
        if (parts.length === 2) {
          bump(rule.anchor)
          nd = { ...d, [rule.field]: parts[0].replace(/\s+$/, ''), [rule.target]: { ...t, [rule.chapter]: rule.anchor + parts[1] } }
        }
      }
    } else if (rule.op === 'add-chapters') {
      // chapters missing from our copy, taken from a patch file that carries the text and a sha256 per chapter.
      // Refuses to overwrite a chapter we already have, and refuses a chapter whose text does not match its recorded hash.
      const patch = JSON.parse(fs.readFileSync(path.join(root, rule.patchFile), 'utf8'))
      const t = d[rule.target], add = {}
      for (const [k, v] of Object.entries(patch.chapters)) {
        if (crypto.createHash('sha256').update(v.text).digest('hex') !== v.sha256) throw new Error(`patch chapter ${k}: text does not match its recorded sha256`)
        if (Object.prototype.hasOwnProperty.call(t, k)) { if (t[k] !== v.text) throw new Error(`chapter ${k} already exists and differs from the patch; not overwriting`); continue }
        add[k] = v.text; bump('chapters added')
      }
      if (Object.keys(add).length) nd = { ...d, [rule.target]: { ...t, ...add } }
    } else if (rule.op === 'restructure-chapters') {
      // chapter boundaries repaired from a patch of exact offsets. For each entry the patch records the sha256 of the source chapter and,
      // for every piece to keep, its start/end and sha256. The source chapter is changed only if it matches "beforeSha256"; every piece
      // must hash to its recorded value; an existing chapter is replaced only if it matches that piece's recorded replacesSha256.
      // Anything else stops the tool with nothing written. An entry already applied (source chapter equals its first piece) is left alone.
      const patch = JSON.parse(fs.readFileSync(path.join(root, rule.patchFile), 'utf8'))
      const H = x => crypto.createHash('sha256').update(x).digest('hex')
      const chs = { ...d.chapters }
      for (const ent of patch.entries.filter(x => x.book === code)) {
        const src = d.chapters[ent.chapter]
        if (typeof src !== 'string') throw new Error(`${code} ${ent.chapter}: no such chapter`)
        const texts = ent.pieces.map(pc => src.slice(pc.start, pc.end))
        const h = H(src)
        if (h !== ent.beforeSha256 && src.length < ent.length) {
          // already applied (the source chapter is shorter than before); a later fix, such as restored dashes, may since have changed these texts,
          // so only their presence is checked here. The scorecard's Preserved gate re-checks the whole result against data/.
          for (const pc of ent.pieces.slice(1)) if (!(pc.chapter in chs)) throw new Error(`${code} ${pc.chapter}: first piece is in place but this chapter is missing; nothing written`)
          continue
        }
        if (h !== ent.beforeSha256) throw new Error(`${code} ${ent.chapter}: text matches neither the recorded before hash nor the repaired text; nothing written`)
        ent.pieces.forEach((pc, i) => {
          if (H(texts[i]) !== pc.sha256) throw new Error(`${code} ${pc.chapter}: piece does not match its recorded sha256; nothing written`)
          if (i > 0 && pc.chapter in chs && H(chs[pc.chapter]) !== pc.replacesSha256) throw new Error(`${code} ${pc.chapter}: chapter exists and is not the text this fix expects to replace; nothing written`)
        })
        ent.pieces.forEach((pc, i) => { chs[pc.chapter] = texts[i]; if (i > 0) bump('chapters split out') })
        if (ent.removed) bump('tails cut')
      }
      nd = { ...d, chapters: Object.fromEntries(Object.entries(chs).sort((a, b) => +a[0] - +b[0])) }
    } else if (rule.op === 'insert-text') {
      // a listed patch of exact insertions, chapter by chapter. For each chapter the patch records the sha256 of the text
      // before and after. The chapter is changed only if it matches "before", every insertion point is checked against the text
      // around it, and the result must match "after" or the tool stops. A chapter already matching "after" is left alone.
      const patch = JSON.parse(fs.readFileSync(path.join(root, rule.patchFile), 'utf8'))
      const H = x => crypto.createHash('sha256').update(x).digest('hex')
      let nd2 = { ...d, chapters: { ...d.chapters } }
      for (const ent of patch.chapters.filter(x => x.book === code)) {
        const text = ent.chapter === 'intro' ? d.intro : d.chapters[ent.chapter]
        if (typeof text !== 'string') throw new Error(`${code} ${ent.chapter}: no such text`)
        const h = H(text)
        if (h === ent.afterSha256) continue
        if (h !== ent.beforeSha256) throw new Error(`${code} ${ent.chapter}: text matches neither the recorded before nor after hash; nothing written`)
        let out = text
        for (const x of [...ent.inserts].sort((a, b) => b.offset - a.offset)) {
          if (text.slice(Math.max(0, x.offset - x.before.length), x.offset) !== x.before || text.slice(x.offset, x.offset + x.after.length) !== x.after) throw new Error(`${code} ${ent.chapter} @${x.offset}: surrounding text does not match; nothing written`)
          out = out.slice(0, x.offset) + patch.insert + out.slice(x.offset); bump('dashes inserted')
        }
        if (H(out) !== ent.afterSha256) throw new Error(`${code} ${ent.chapter}: result does not match the recorded after hash; nothing written`)
        if (ent.chapter === 'intro') nd2.intro = out; else nd2.chapters[ent.chapter] = out
      }
      nd = nd2
    } else if (rule.op === 'replace-chapters') {
      // whole chapters replaced from a patch file that carries the new text. For each chapter the patch records the sha256 of our text
      // before and of the new text after. A chapter is replaced only if it matches "before"; one already matching "after" is left alone;
      // anything else stops the tool with nothing written. Works on the {chapter, commentary} list used by the Calvin files.
      const patch = JSON.parse(fs.readFileSync(path.join(root, rule.patchFile), 'utf8'))
      const H = x => crypto.createHash('sha256').update(x).digest('hex')
      const ents = patch.chapters.filter(x => x.book === code)
      nd = { ...d, chapters: d.chapters.map(ch => {
        const ent = ents.find(x => x.chapter === ch.chapter)
        if (!ent) return ch
        if (H(ent.text) !== ent.afterSha256) throw new Error(`${code} ${ch.chapter}: patch text does not match its own recorded sha256`)
        const h = H(ch.commentary)
        if (h === ent.afterSha256) return ch
        if (h !== ent.beforeSha256) throw new Error(`${code} ${ch.chapter}: text matches neither the recorded before nor after hash; nothing written`)
        bump('chapters replaced')
        return { ...ch, commentary: ent.text }
      }) }
    } else throw new Error('unknown op ' + rule.op)
    pending.push({ file, out: JSON.stringify(nd) })
  }
  const exp = typeof rule.expectedCount === 'number' ? { [rule.find]: rule.expectedCount } : rule.expectedCount
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const alreadyApplied = total === 0
  const matches = Object.keys(exp).every(k => (counts[k] || 0) === exp[k]) && Object.keys(counts).every(k => k in exp)
  results.push({ id: rule.id, counts, expected: exp, status: alreadyApplied ? 'already applied (0 changes)' : matches ? 'counts match expected' : 'COUNT MISMATCH' })
  if (!alreadyApplied && !matches) abort = true
  rule._pending = pending; rule._apply = !alreadyApplied && matches
}
for (const r of results) console.log(`${r.id}: ${r.status}; changes ${JSON.stringify(r.counts)}; expected ${JSON.stringify(r.expected)}`)
if (abort) { console.log('ABORT: a count differs from expectedCount; nothing written.'); process.exit(1) }
if (check) { const notApplied = results.filter(r => !r.status.startsWith('already')); if (notApplied.length) { console.log('CHECK FAILED: rules not yet applied to library/: ' + notApplied.map(r => r.id).join(', ')); process.exit(1) } console.log('CHECK OK: every recorded fix is applied.'); process.exit(0) }
if (!write) { console.log('Dry run: nothing written. Add --write to apply.'); process.exit(0) }
for (const rule of fixes.rules) if (rule._apply) for (const p of rule._pending) { fs.writeFileSync(p.file, p.out); console.log('wrote', p.file) }
console.log('Done. Re-run without --write: every rule should now say "already applied (0 changes)".')