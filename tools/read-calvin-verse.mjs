// Prints Calvin's commentary on one verse, using the verse index. Usage (repo root):  node tools/read-calvin-verse.mjs GEN 1 6
// The rule is the one in library/commentary/STANDARD.md: sections that open on the verse; otherwise the section whose span contains it
// (the nearest one that opens below the verse); otherwise nothing. The overview is printed with:  node tools/read-calvin-verse.mjs GEN 1 overview
import fs from 'node:fs'
const [, , book, chap, vs] = process.argv
const ix = JSON.parse(fs.readFileSync(`library/commentary-index/Calvin/${book}.json`, 'utf8')).chapters.find(c => c.chapter === +chap)
const t = JSON.parse(fs.readFileSync(`library/commentary/Calvin/${book}.json`, 'utf8')).chapters.find(c => c.chapter === +chap).commentary
if (!ix) { console.log('no index entry'); process.exit(1) }
if (vs === 'overview') { console.log(ix.overview ? t.slice(...ix.overview) : '(no overview)'); process.exit(0) }
const v = +vs
let hit = ix.sections.filter(s => s.verse === v)
if (!hit.length) { const c = ix.sections.filter(s => s.span && v >= s.span[0] && v <= s.span[1]).sort((a, b) => b.verse - a.verse); if (c.length) hit = [c[0]] }
if (!hit.length) { console.log('Calvin has no section on this verse'); process.exit(0) }
for (const s of hit) console.log(`[${s.ref}${s.span ? ' covers ' + s.span.join('-') : ''}]\n` + t.slice(s.start, s.end))
