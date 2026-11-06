// Checks library/bible/BSB against the publisher's file data/bsb/bsb.txt, verse by verse, byte for byte.
// Usage from the repo root: node tools/check-bsb-against-publisher.mjs        (exit 1 if any verse differs, is missing or is extra)
// The 16 verses the publisher leaves empty (Matthew 17:21 ... Romans 16:24) are expected to be absent from the library.
import fs from 'node:fs'
import path from 'node:path'
const ORDER = 'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAH HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV'.split(' ')
const lines = fs.readFileSync('data/bsb/bsb.txt', 'utf8').split('\n').slice(3).filter(Boolean)
const pub = new Map(), names = []
for (const l of lines) { const t = l.indexOf('\t'), ref = l.slice(0, t), m = ref.match(/^(.+) (\d+):(\d+)$/); if (!names.includes(m[1])) names.push(m[1]); pub.set(`${ORDER[names.indexOf(m[1])]} ${m[2]}:${m[3]}`, l.slice(t + 1)) }
let same = 0, differ = 0, extra = 0, absentEmpty = 0; const where = []
const seen = new Set()
for (const f of fs.readdirSync('library/bible/BSB').filter(x => x.endsWith('.json')).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join('library/bible/BSB', f), 'utf8'))
  for (const c of d.chapters) for (const [v, t] of Object.entries(c.verses)) {
    const k = `${d.book} ${c.chapter}:${v}`; seen.add(k); const p = pub.get(k)
    if (p === undefined) { extra++; where.push(k + ' not in the publisher file') } else if (p === t) same++; else { differ++; where.push(k + ' differs') }
  }
}
for (const [k, t] of pub) if (!seen.has(k)) { if (t === '') absentEmpty++; else where.push(k + ' missing from the library') }
console.log(`${same} verses byte-identical to the publisher file; ${differ} differ; ${extra} not in the publisher file; ${absentEmpty} publisher-empty verses absent from the library (expected 16)`)
if (where.length || absentEmpty !== 16) { console.log(where.slice(0, 20).join('\n')); process.exit(1) }
console.log('CHECK OK')
