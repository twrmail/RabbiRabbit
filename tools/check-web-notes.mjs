// Checks library/bible-notes/WEB against library/bible/WEB, using only files in the repo.
//   node tools/check-web-notes.mjs [repo root]
// For every note: the verse exists in our WEB text, the offset is inside the verse, the recorded `after` words are exactly the text before the offset,
// the note text is non-empty, and each file's count matches its notes. Nothing here changes any file.
import fs from 'node:fs'
import path from 'node:path'
const root = process.argv[2] || '.'
const BOOKS = '1CH 1CO 1JN 1KI 1PE 1SA 1TH 1TI 2CH 2CO 2JN 2KI 2PE 2SA 2TH 2TI 3JN ACT AMO COL DAN DEU ECC EPH EST EXO EZK EZR GAL GEN HAB HAG HEB HOS ISA JAS JDG JER JHN JOB JOL JON JOS JUD LAM LEV LUK MAL MAT MIC MRK NAH NEH NUM OBA PHM PHP PRO PSA REV ROM RUT SNG TIT ZEC ZEP'.split(' ')
let total = 0; const bad = []
for (const code of BOOKS) {
  const bible = JSON.parse(fs.readFileSync(path.join(root, 'library/bible/WEB', code + '.json'), 'utf8'))
  const nf = path.join(root, 'library/bible-notes/WEB', code + '.json')
  if (!fs.existsSync(nf)) { bad.push(`${code}: notes file missing`); continue }
  const f = JSON.parse(fs.readFileSync(nf, 'utf8'))
  if (f.book !== code) bad.push(`${code}: book field is ${f.book}`)
  if (f.count !== f.notes.length) bad.push(`${code}: count ${f.count} but ${f.notes.length} notes`)
  for (const n of f.notes) {
    total++
    const ch = bible.chapters.find(c => c.chapter === n.chapter), t = ch && ch.verses[String(n.verse)]
    const id = `${code} ${n.chapter}:${n.verse}`
    if (typeof t !== 'string') { bad.push(`${id}: no such verse in our WEB`); continue }
    if (!(Number.isInteger(n.at) && n.at >= 0 && n.at <= t.length)) { bad.push(`${id}: offset ${n.at} outside the verse (${t.length})`); continue }
    if (t.slice(Math.max(0, n.at - 40), n.at) !== n.after) bad.push(`${id}: the words before offset ${n.at} are not "${n.after}"`)
    if (!n.text || !n.text.trim()) bad.push(`${id}: empty note`)
  }
}
console.log(`${total} notes checked in ${BOOKS.length} files; ${bad.length} problems`)
for (const b of bad.slice(0, 20)) console.log(' -', b)
process.exit(bad.length ? 1 : 0)
