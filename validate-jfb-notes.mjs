// Independent validator for the JFB notes pilot. Reads the WRITTEN notes files and the ORIGINAL JFB files from disk
// (no code shared with the converter besides Node's fs/crypto). Read-only.
//   node validate-jfb-notes.mjs <original JFB dir> <notes dir containing JFB/>
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
const [, , origDir, notesDir] = process.argv
const sha = s => crypto.createHash('sha256').update(s).digest('hex')
const fails = []
let chapters = 0, notesTotal = 0, books = 0
const origFiles = fs.readdirSync(origDir).filter(f => f.endsWith('.json')).sort()
const noteFiles = fs.readdirSync(path.join(notesDir, 'JFB')).filter(f => f.endsWith('.json')).sort()
if (origFiles.join() !== noteFiles.join()) fails.push(`book files differ: original ${origFiles.length}, notes ${noteFiles.length}`)
for (const f of origFiles) {
  if (!noteFiles.includes(f)) continue
  books++
  const o = JSON.parse(fs.readFileSync(path.join(origDir, f), 'utf8'))
  const n = JSON.parse(fs.readFileSync(path.join(notesDir, 'JFB', f), 'utf8'))
  if (n.book !== o.book) fails.push(`${f}: book field ${n.book} vs ${o.book}`)
  if (n.chapters.length !== o.chapters.length) fails.push(`${f}: chapter count ${n.chapters.length} vs ${o.chapters.length}`)
  for (const oc of o.chapters) {
    const nc = n.chapters.find(c => c.chapter === oc.chapter)
    chapters++
    if (!nc) { fails.push(`${f} ch ${oc.chapter}: missing`); continue }
    const orig = oc.commentary || ''
    const rejoined = nc.notes.map(x => x.text).join('')
    notesTotal += nc.notes.length
    if (rejoined !== orig) fails.push(`${f} ch ${oc.chapter}: rejoined text differs from original (${rejoined.length} vs ${orig.length} chars)`)
    if (nc.originalSha256 !== sha(orig)) fails.push(`${f} ch ${oc.chapter}: stored original hash does not match the original file`)
    nc.notes.forEach((x, i) => {
      if (x.ordinal !== i + 1) fails.push(`${f} ch ${oc.chapter}: ordinal ${x.ordinal} at position ${i + 1}`)
      if (x.coverage && x.coverage.verses && (x.coverage.start !== x.coverage.verses[0] || x.coverage.end !== x.coverage.verses.at(-1))) fails.push(`${f} ch ${oc.chapter} ${x.id}: coverage start/end disagree with its verse list`)
      // coverage must be derivable from the note's own first line: re-derive it independently
      if (x.kind === 'verse' || x.kind === 'grouped') {
        const m = /^\s*(\d+)((?:\s*[-–,]\s*\d+)*)\.\s/.exec(x.text)
        if (!m) fails.push(`${f} ch ${oc.chapter} ${x.id}: marked ${x.kind} but text does not begin with a verse number`)
        else {
          // re-derive the whole verse list from the printed marker with a separate implementation:
          // "a-b" = every verse from the previous number to b; "a, b" = just those numbers
          const vs = [+m[1]]; let last = +m[1]
          for (const t of m[2].matchAll(/([-–,])\s*(\d+)/g)) {
            const nn = +t[2]
            if (t[1] === ',') vs.push(nn); else for (let v = last + 1; v <= nn; v++) vs.push(v)
            last = nn
          }
          const want = [...new Set(vs)].sort((a, b) => a - b).join(',')
          if (want !== x.coverage.verses.join(',')) fails.push(`${f} ch ${oc.chapter} ${x.id}: printed marker gives verses [${want}] but coverage says [${x.coverage.verses.join(',')}]`)
        }
      }
      if (!['chapter-header', 'section', 'verse', 'grouped', 'section-text', 'intro'].includes(x.kind)) fails.push(`${f} ch ${oc.chapter} ${x.id}: unknown kind ${x.kind}`)
    })
  }
}
console.log(`validated ${books} books, ${chapters} chapters, ${notesTotal} notes`)
console.log(fails.length ? `RESULT: FAIL (${fails.length})\n` + fails.slice(0, 30).join('\n') : 'RESULT: PASS (0 failures)')
process.exit(fails.length ? 1 : 0)