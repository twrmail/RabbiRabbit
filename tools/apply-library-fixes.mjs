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
const overlay = {}   // file -> text after the rules already worked out in this run (nothing is written until every rule has passed)
let abort = false
// A chapter that a LATER rule has changed no longer matches this rule's "after" hash. It still counts as done for this rule if it is in the
// recorded final state of a later rule that works on the same chapter (so each rule can be re-run on the finished library).
const patchCache = {}
const laterPatch = r => (patchCache[r.patchFile] ||= JSON.parse(fs.readFileSync(path.join(root, r.patchFile), 'utf8')))
const laterRuleOwns = (rule, code, chapter, h) => fixes.rules.slice(fixes.rules.indexOf(rule) + 1).some(r2 =>
  r2.patchFile && r2.folder === rule.folder && ['replace-chapters', 'insert-blocks', 'move-blocks', 'add-blocks', 'hold-blocks'].includes(r2.op) &&
  laterPatch(r2).chapters.some(e => e.book === code && e.chapter === chapter && e.afterSha256 === h))
for (const rule of fixes.rules) {
  const counts = {}, pending = []
  for (const code of rule.files) {
    const file = path.join(root, rule.folder, code + '.json')
    const raw = overlay[file] ?? fs.readFileSync(file, 'utf8'), d = JSON.parse(raw)   // a later rule on the same file starts from what the earlier rules in this run produced
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
        if (h === ent.afterSha256 || laterRuleOwns(rule, code, ch.chapter, h)) return ch
        if (h !== ent.beforeSha256) throw new Error(`${code} ${ch.chapter}: text matches neither the recorded before nor after hash; nothing written`)
        bump('chapters replaced')
        return { ...ch, commentary: ent.text }
      }) }
    } else if (rule.op === 'insert-blocks') {
      // whole paragraphs inserted into a chapter, from a patch that carries each block's text and exact place. For each chapter the patch
      // records the sha256 before and after. The chapter is changed only if it matches "before"; each place is checked against the 40
      // characters on either side; the result must match "after" or the tool stops. A chapter already matching "after" is left alone.
      // Works on the {chapter, commentary} list used by the Henry and Calvin files. Each block goes in as: blank line, then the text.
      const patch = JSON.parse(fs.readFileSync(path.join(root, rule.patchFile), 'utf8'))
      const H = x => crypto.createHash('sha256').update(x).digest('hex')
      const ents = patch.chapters.filter(x => x.book === code)
      nd = { ...d, chapters: d.chapters.map(ch => {
        const ent = ents.find(x => x.chapter === ch.chapter)
        if (!ent) return ch
        const h = H(ch.commentary)
        if (h === ent.afterSha256 || laterRuleOwns(rule, code, ch.chapter, h)) return ch
        if (h !== ent.beforeSha256) throw new Error(`${code} ${ch.chapter}: text matches neither the recorded before nor after hash; nothing written`)
        let out = ch.commentary
        for (const x of [...ent.inserts].sort((a, b) => b.offset - a.offset)) {
          if (ch.commentary.slice(Math.max(0, x.offset - x.before.length), x.offset) !== x.before || ch.commentary.slice(x.offset, x.offset + x.after.length) !== x.after) throw new Error(`${code} ${ch.chapter} @${x.offset}: surrounding text does not match; nothing written`)
          out = out.slice(0, x.offset) + '\n\n' + x.text + out.slice(x.offset); bump('quotation blocks inserted')
        }
        if (H(out) !== ent.afterSha256) throw new Error(`${code} ${ch.chapter}: result does not match the recorded after hash; nothing written`)
        return { ...ch, commentary: out }
      }) }
    } else if (rule.op === 'move-blocks') {
      // text that sits at the end of the wrong chapter goes to the start of the chapter it belongs to. For each chapter the patch records the
      // sha256 before and after; an optional "cut" removes the tail of the chapter (offset, length and sha256 of the removed text are checked
      // first), and an optional "prepend" text is put at the start with a blank line after it. A chapter already matching "after" is left alone;
      // one matching neither "before" nor "after" stops the tool with nothing written.
      const patch = JSON.parse(fs.readFileSync(path.join(root, rule.patchFile), 'utf8'))
      const H = x => crypto.createHash('sha256').update(x).digest('hex')
      const ents = patch.chapters.filter(x => x.book === code)
      nd = { ...d, chapters: d.chapters.map(ch => {
        const ent = ents.find(x => x.chapter === ch.chapter)
        if (!ent) return ch
        if (ent.prepend !== null && H(ent.prepend) !== ent.prependSha256) throw new Error(`${code} ${ch.chapter}: patch text does not match its own recorded sha256`)
        const h = H(ch.commentary)
        if (h === ent.afterSha256 || laterRuleOwns(rule, code, ch.chapter, h)) return ch
        if (h !== ent.beforeSha256) throw new Error(`${code} ${ch.chapter}: text matches neither the recorded before nor after hash; nothing written`)
        let out = ch.commentary
        if (ent.cut) {
          const tail = out.slice(ent.cut.offset)
          if (tail.length !== ent.cut.length || H(tail) !== ent.cut.sha256) throw new Error(`${code} ${ch.chapter}: the tail to cut does not match the recorded length and sha256; nothing written`)
          out = out.slice(0, ent.cut.offset).replace(/\s+$/, ''); bump('misplaced tails cut')
        }
        if (ent.prepend !== null) { out = ent.prepend + '\n\n' + out; bump('chapters opened with moved text') }
        if (H(out) !== ent.afterSha256) throw new Error(`${code} ${ch.chapter}: result does not match the recorded after hash; nothing written`)
        return { ...ch, commentary: out }
      }) }
    } else if (rule.op === 'add-blocks') {
      // text that our copy never had (no other copy in data/ or library/ holds it) goes at the start of its chapter, followed by a blank line.
      // The patch records each chapter's sha256 before and after and the sha256 of the added text. A chapter already matching "after" is left
      // alone; one matching neither "before" nor "after" stops the tool with nothing written.
      const patch = JSON.parse(fs.readFileSync(path.join(root, rule.patchFile), 'utf8'))
      const H = x => crypto.createHash('sha256').update(x).digest('hex')
      const ents = patch.chapters.filter(x => x.book === code)
      nd = { ...d, chapters: d.chapters.map(ch => {
        const ent = ents.find(x => x.chapter === ch.chapter)
        if (!ent) return ch
        if (H(ent.prepend) !== ent.prependSha256) throw new Error(`${code} ${ch.chapter}: patch text does not match its own recorded sha256`)
        const h = H(ch.commentary)
        if (h === ent.afterSha256 || laterRuleOwns(rule, code, ch.chapter, h)) return ch
        if (h !== ent.beforeSha256) throw new Error(`${code} ${ch.chapter}: text matches neither the recorded before nor after hash; nothing written`)
        const out = ent.prepend + '\n\n' + ch.commentary; bump('chapter arguments added')
        if (H(out) !== ent.afterSha256) throw new Error(`${code} ${ch.chapter}: result does not match the recorded after hash; nothing written`)
        return { ...ch, commentary: out }
      }) }
    } else if (rule.op === 'hold-blocks') {
      // a tail that is not commentary on its chapter is cut and kept, word for word, in the held file (rule.heldFile). The patch records each
      // chapter's sha256 before and after, the cut (offset, length, sha256) and the ids of the held items. Before anything is cut the tool
      // checks that every held item hashes to its own recorded sha256 and that the items, joined in order, are exactly the text being cut,
      // so nothing can be cut without being kept. A chapter already matching "after" is left alone; one matching neither stops the tool.
      const patch = JSON.parse(fs.readFileSync(path.join(root, rule.patchFile), 'utf8'))
      const held = JSON.parse(fs.readFileSync(path.join(root, rule.heldFile), 'utf8')).items
      const H = x => crypto.createHash('sha256').update(x).digest('hex')
      const ents = patch.chapters.filter(x => x.book === code)
      nd = { ...d, chapters: d.chapters.map(ch => {
        const ent = ents.find(x => x.chapter === ch.chapter)
        if (!ent) return ch
        const h = H(ch.commentary)
        if (h === ent.afterSha256 || laterRuleOwns(rule, code, ch.chapter, h)) return ch
        if (h !== ent.beforeSha256) throw new Error(`${code} ${ch.chapter}: text matches neither the recorded before nor after hash; nothing written`)
        const tail = ch.commentary.slice(ent.cut.offset, ent.cut.offset + ent.cut.length)
        if (tail.length !== ent.cut.length || H(tail) !== ent.cut.sha256) throw new Error(`${code} ${ch.chapter}: the text to cut does not match the recorded length and sha256; nothing written`)
        const items = ent.heldIds.map(id => held.find(i => i.id === id))
        if (items.some(i => !i)) throw new Error(`${code} ${ch.chapter}: a held item named in the patch is missing from the held file; nothing written`)
        if (items.some(i => H(i.text) !== i.sha256)) throw new Error(`${code} ${ch.chapter}: a held item does not match its own sha256; nothing written`)
        if (items.map(i => i.text).join('') !== tail) throw new Error(`${code} ${ch.chapter}: the held items do not add up to the text being cut; nothing written`)
        // the cut may be a tail or a block in the middle of the chapter; in the middle, the text before and the text after are joined with a blank line
        const head = ch.commentary.slice(0, ent.cut.offset).replace(/\s+$/, ''), rest = ch.commentary.slice(ent.cut.offset + ent.cut.length).replace(/^\s+/, '')
        const out = rest ? head + '\n\n' + rest : head; bump(rule.countLabel || 'back-matter tails held and cut')
        if (H(out) !== ent.afterSha256) throw new Error(`${code} ${ch.chapter}: result does not match the recorded after hash; nothing written`)
        return { ...ch, commentary: out }
      }) }
    } else throw new Error('unknown op ' + rule.op)
    pending.push({ file, out: JSON.stringify(nd) }); overlay[file] = JSON.stringify(nd)
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