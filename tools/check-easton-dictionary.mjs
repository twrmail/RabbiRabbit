// Checks library/dictionary/Easton using only files in the repo.   node tools/check-easton-dictionary.mjs [repo root]
// Every letter file: count matches its entries; every entry has a unique CCEL id, a headword, text, and a sha256 that matches the text; the headword starts with the file's letter;
// _index.json totals match the files. Then the character bios in library/people/characters.json are looked up: the list of bios not found inside any entry must equal the list recorded in _index.json.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
const root = process.argv[2] || '.'
const dir = path.join(root, 'library/dictionary/Easton')
const bad = []
const index = JSON.parse(fs.readFileSync(path.join(dir, '_index.json'), 'utf8'))
const ids = new Set(), texts = []
let total = 0
for (const f of fs.readdirSync(dir).filter(f => /^[A-Z_]\.json$/.test(f)).sort()) {
  const letter = f[0], d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
  if (d.letter !== letter) bad.push(`${f}: letter field is ${d.letter}`)
  if (d.count !== d.entries.length) bad.push(`${f}: count ${d.count} but ${d.entries.length} entries`)
  if (index.letters[letter] !== d.entries.length) bad.push(`${f}: _index says ${index.letters[letter]} entries, file has ${d.entries.length}`)
  for (const e of d.entries) {
    total++
    if (!e.id || ids.has(e.id)) bad.push(`${f}: missing or repeated id ${e.id}`); ids.add(e.id)
    if (!e.term || !e.text || !e.text.trim()) bad.push(`${f} ${e.id}: empty term or text`)
    if (crypto.createHash('sha256').update(e.text).digest('hex') !== e.sha256) bad.push(`${f} ${e.id} ${e.term}: text does not match its sha256`)
    const first = (e.term || ' ')[0].toUpperCase(); if ((/[A-Z]/.test(first) ? first : '_') !== letter) bad.push(`${f} ${e.id}: headword "${e.term}" does not belong in letter ${letter}`)
    texts.push(e.text)
  }
}
if (!index.sourceLine || !/\b1897\b/.test(index.sourceLine)) bad.push('_index.json has no sourceLine naming the work and year')
if (total !== index.total) bad.push(`_index total ${index.total} but files hold ${total}`)
if (Object.keys(index.letters).length !== fs.readdirSync(dir).filter(f => /^[A-Z_]\.json$/.test(f)).length) bad.push('_index lists a different set of letters than the files')
const chars = JSON.parse(fs.readFileSync(path.join(root, 'library/people/characters.json'), 'utf8')).characters
const big = texts.join('\n')
const notFound = Object.entries(chars).filter(([, v]) => v.bio && !big.includes(v.bio)).map(([k]) => k).sort()
if (JSON.stringify(notFound) !== JSON.stringify(index.characterBiosNotFoundInAnyEntry)) bad.push(`character bios not found in any entry: [${notFound}] but _index records [${index.characterBiosNotFoundInAnyEntry}]`)
console.log(`${total} entries in ${Object.keys(index.letters).length} files; character bios not inside any entry: ${notFound.length} (${notFound.join(', ')}); ${bad.length} problems`)
for (const b of bad.slice(0, 20)) console.log(' -', b)
process.exit(bad.length ? 1 : 0)
