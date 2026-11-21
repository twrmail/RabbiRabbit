// ═══════════════════════════════════════════════════════════════════════════════════════════
// rabbitlab-worker.js  (lab-6.0, Nov 19 2026)  — standalone Worker for the rabbitlab test site.
// Touches nothing in rabbit proper or the existing lab Worker. Reads the public library on GitHub.
//
// Routes (all CORS *, optional ALLOWED_ORIGIN guard):
//   GET  /parse?q=John 3:16                    -> normalised reference
//   GET  /passage?q=...&t=henry|gill|calvin|jfb&ed=kjv|web
//                                             -> Scripture + the chosen teacher's blocks (NO AI, no cost)
//                                                + which other teachers have a note on this verse
//   POST /restate {q|b,c,v, t, i, ed}          -> plain-adult-English restatement of ONE block (one small AI call)
//                                                mechanical gates decide whether it may be shown; failures return reasons
//   GET  /batch?from=0&n=6                     -> runs the restatement over a fixed test set and reports pass/fail
//   GET  /version
//
// Secrets / vars (Cloudflare dashboard): ANTHROPIC_API_KEY (secret, required for /restate and /batch)
//   RESTATE_MODEL (optional, default claude-haiku-4-5)   ALLOWED_ORIGIN (optional, comma list)
//
// Design rule carried over from the lab: CODE prints every quotation; the AI only rewrites, and code refuses anything
// that adds names, numbers, references, background, quotation marks or original-language teaching.
// ═══════════════════════════════════════════════════════════════════════════════════════════

const VERSION = 'rabbitlab-6.0'
const PROMPT_VERSION = 'p2'
const RAW = 'https://raw.githubusercontent.com/twrmail/RabbiRabbit/main/library'
const DEFAULT_MODEL = 'claude-haiku-4-5'
const MAX_BLOCKS = 12
const GROUND_MIN = 0.35

// ───────────────────────────── books ─────────────────────────────
// CODE|Name|aliases...   (aliases are matched after lowercasing and removing spaces and periods)
const BOOK_LINES = `GEN|Genesis|Gen|Ge|Gn
EXO|Exodus|Exod|Exo|Ex
LEV|Leviticus|Lev|Le|Lv
NUM|Numbers|Num|Nu|Nm
DEU|Deuteronomy|Deut|Deu|De|Dt
JOS|Joshua|Josh|Jos
JDG|Judges|Judg|Jdg
RUT|Ruth|Rut|Ru
1SA|1 Samuel|1Sam|1Sa|1Sm
2SA|2 Samuel|2Sam|2Sa|2Sm
1KI|1 Kings|1Kgs|1Ki|1Kin
2KI|2 Kings|2Kgs|2Ki|2Kin
1CH|1 Chronicles|1Chron|1Chr|1Ch
2CH|2 Chronicles|2Chron|2Chr|2Ch
EZR|Ezra|Ezr
NEH|Nehemiah|Neh|Ne
EST|Esther|Est|Es
JOB|Job|Jb
PSA|Psalms|Psalm|Ps|Psa|Pslm
PRO|Proverbs|Prov|Pro|Pr|Prv
ECC|Ecclesiastes|Eccl|Ecc|Ec
SNG|Song of Solomon|Song of Songs|Songs|Song|Canticles|SOS|Ca
ISA|Isaiah|Isa|Is
JER|Jeremiah|Jer
LAM|Lamentations|Lam|La
EZK|Ezekiel|Ezek|Eze|Ezk
DAN|Daniel|Dan|Da|Dn
HOS|Hosea|Hos|Ho
JOL|Joel|Joe|Jl
AMO|Amos|Am
OBA|Obadiah|Obad|Oba|Ob
JON|Jonah|Jon
MIC|Micah|Mic
NAH|Nahum|Nah|Na
HAB|Habakkuk|Hab
ZEP|Zephaniah|Zeph|Zep
HAG|Haggai|Hag
ZEC|Zechariah|Zech|Zec
MAL|Malachi|Mal
MAT|Matthew|Matt|Mat|Mt
MRK|Mark|Mar|Mrk|Mk|Mr
LUK|Luke|Luk|Lk|Lu
JHN|John|Joh|Jhn|Jn
ACT|Acts|Act|Ac
ROM|Romans|Rom|Ro|Rm
1CO|1 Corinthians|1Cor|1Co
2CO|2 Corinthians|2Cor|2Co
GAL|Galatians|Gal|Ga
EPH|Ephesians|Eph
PHP|Philippians|Phil|Php|Pp
COL|Colossians|Col
1TH|1 Thessalonians|1Thess|1Thes|1Th
2TH|2 Thessalonians|2Thess|2Thes|2Th
1TI|1 Timothy|1Tim|1Ti
2TI|2 Timothy|2Tim|2Ti
TIT|Titus|Tit
PHM|Philemon|Philem|Phlm|Phm
HEB|Hebrews|Heb
JAS|James|Jas|Jam|Jm
1PE|1 Peter|1Pet|1Pe|1Pt
2PE|2 Peter|2Pet|2Pe|2Pt
1JN|1 John|1Jn|1Jo|1Joh
2JN|2 John|2Jn|2Jo|2Joh
3JN|3 John|3Jn|3Jo|3Joh
JUD|Jude|Jud
REV|Revelation|Revelations|Rev|Re|Rv`
const BOOK_NAME = {}
const ALIAS = {}
for (const line of BOOK_LINES.split('\n')) {
  const [code, name, ...al] = line.split('|')
  BOOK_NAME[code] = name
  for (const a of [name, ...al]) ALIAS[a.toLowerCase().replace(/[^a-z0-9]/g, '')] = code
}
const NUM_WORDS = { first: '1', second: '2', third: '3', '1st': '1', '2nd': '2', '3rd': '3', i: '1', ii: '2', iii: '3' }

function bookFromText(s) {
  let t = String(s || '').trim().toLowerCase().replace(/\./g, ' ').replace(/\s+/g, ' ')
  const first = t.split(' ')[0]
  if (NUM_WORDS[first] && t.split(' ').length > 1) t = NUM_WORDS[first] + t.slice(first.length)
  return ALIAS[t.replace(/[^a-z0-9]/g, '')] || null
}
function parseRef(q) {
  const m = String(q || '').trim().replace(/[–—]/g, '-').match(/^(.+?)\s*(\d{1,3})\s*[: .]\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?$/)
  if (!m) return null
  const b = bookFromText(m[1])
  if (!b) return null
  const c = +m[2], v = +m[3], ve = m[4] ? +m[4] : null
  return { b, c, v, ve: ve && ve > v && ve <= v + 11 ? ve : null, label: `${BOOK_NAME[b]} ${c}:${v}${ve && ve > v ? '-' + ve : ''}` }
}

// ───────────────────────────── fetching ─────────────────────────────
const memo = new Map()
async function getJson(path) {
  if (memo.has(path)) return memo.get(path)
  const p = fetch(`${RAW}/${path}`, { cf: { cacheTtl: 3600, cacheEverything: true } }).then(async r => {
    if (!r.ok) throw new Error(`${path} ${r.status}`)
    return r.json()
  })
  memo.set(path, p)
  p.catch(() => memo.delete(path))
  return p
}
async function getScripture(ed, b, c, v, ve) {
  const folder = ed === 'web' ? 'WEB' : 'KJV'
  const file = await getJson(`bible/${folder}/${b}.json`)
  const ch = (file.chapters || []).find(x => +x.chapter === c)
  if (!ch) return []
  const out = []
  for (let n = v; n <= (ve || v); n++) { const t = ch.verses && ch.verses[String(n)]; if (t) out.push({ n, text: String(t).trim() }) }
  return out
}

// ───────────────────────────── teachers ─────────────────────────────
const TEACHERS = {
  henry: { id: 'henry', name: 'Matthew Henry', short: 'Henry', mention: /\bHenry\b/ },
  gill: { id: 'gill', name: 'John Gill', short: 'Gill', mention: /\bGill\b/ },
  calvin: { id: 'calvin', name: 'John Calvin', short: 'Calvin', mention: /\bCalvin\b/ },
  jfb: { id: 'jfb', name: 'Jamieson, Fausset & Brown', short: 'Jamieson, Fausset and Brown', mention: /\b(Jamieson|Fausset|Brown|JFB)\b/ },
}
const TEACHER_ORDER = ['henry', 'gill', 'calvin', 'jfb']
const OTHER_TEACHER_NAMES = /\b(Henry|Gill|Calvin|Jamieson|Fausset|Wesley|Barnes|Clarke|Spurgeon|Scofield|Tyndale|Vincent|Meyer|Augustine|Chrysostom|Luther)\b/g

// Text pieces → blocks. A block is what the reader sees as one unit: the teacher's own paragraph, or a run of sentences.
function splitSentences(text) {
  const raw = String(text).split(/(?<=[.!?]["”’')\]]?)\s+/)
  const out = []
  for (const p of raw) {
    const prev = out[out.length - 1]
    if (prev && (/(?:\b(?:[A-Z][a-z]{0,3}|ver|vers|chap|ch|v|vv|ib|viz|etc|ie|eg)\.)$/.test(prev) || /^\d/.test(p) || /^[a-z]/.test(p))) out[out.length - 1] = prev + ' ' + p
    else out.push(p)
  }
  return out
}
function packText(text, target, max) {
  const paras = String(text).split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)
  const blocks = []
  for (const p of paras) {
    if (p.length <= max) { blocks.push(p); continue }
    const sents = splitSentences(p)
    let cur = ''
    for (const s of sents) {
      if (cur && cur.length + s.length + 1 > target) { blocks.push(cur); cur = s } else cur = cur ? cur + ' ' + s : s
    }
    if (cur) blocks.push(cur)
  }
  // a tiny paragraph (a heading or a one-line point) rides with its neighbour rather than standing alone
  const merged = []
  for (const b of blocks) {
    if (merged.length && (b.length < 200 || merged[merged.length - 1].length < 120) && merged[merged.length - 1].length + b.length < max) merged[merged.length - 1] += '\n\n' + b
    else merged.push(b)
  }
  return merged
}
const isPrintedScripture = p => /^\s*[⁰¹²³⁴⁵⁶⁷⁸⁹]+\s/.test(p)
function dropPrintedScripture(text) {
  return String(text).split(/\n/).filter(l => !isPrintedScripture(l)).join('\n')
}

async function noteHenry(b, c, v) {
  const [idx, txt] = await Promise.all([getJson(`commentary-index/MHC/${b}.json`), getJson(`commentary/MHC/${b}.json`)])
  const ci = (idx.chapters || []).find(x => +x.chapter === c), ct = (txt.chapters || []).find(x => +x.chapter === c)
  if (!ci || !ct || !ci.verses) return { how: 'none', blocks: [] }
  if (ci.textLength !== undefined && ct.commentary.length !== ci.textLength) return { how: 'none', blocks: [], note: 'index does not match text; not served' }
  const e = ci.verses[String(v)]
  if (!e || e.relation === 'none') return { how: 'none', blocks: [] }
  const text = dropPrintedScripture(ct.commentary.slice(e.at, e.end))
  const blocks = packText(text, 1500, 2300).slice(0, MAX_BLOCKS)
  if (!blocks.length) return { how: 'none', blocks: [] }
  if (e.relation === 'own') return { how: 'own', label: `Henry’s note on verse ${v}`, blocks }
  const w = e.with || []
  const span = w.length ? `verses ${w[0]}-${w[w.length - 1]}` : 'neighbouring verses'
  if (e.relation === 'together') return { how: 'within', label: `Henry treats verse ${v} together with ${span}`, blocks }
  return { how: 'within', label: `Henry treats verse ${v} within his note on ${span}`, blocks }
}
const GILL_STUB = /^\s*See\s+(the\s+)?(Chapter\s+)?Introduction/i
async function noteGill(b, c, v) {
  const f = await getJson(`commentary/Gill/${b}.json`)
  const ch = (f.chapters || []).find(x => +x.chapter === c)
  if (!ch || !ch.verses) return { how: 'none', blocks: [] }
  let key = ch.verses[String(v)] !== undefined ? String(v) : null, how = 'own'
  if (!key && ch.spans) for (const [k, [a, z]] of Object.entries(ch.spans)) if (v >= a && v <= z) { key = k; how = 'within' }
  if (!key) return { how: 'none', blocks: [] }
  const text = String(ch.verses[key] || '').trim()
  if (!text || (text.length < 160 && GILL_STUB.test(text))) return { how: 'none', blocks: [] }
  const blocks = packText(text, 900, 1300).slice(0, MAX_BLOCKS)
  return how === 'own' ? { how, label: `Gill’s note on verse ${v}`, blocks } : { how, label: `Gill treats verse ${v} within his note on verses ${key}-${ch.spans[key][1]}`, blocks }
}
async function noteCalvin(b, c, v) {
  const [idx, txt] = await Promise.all([getJson(`commentary-index/Calvin/${b}.json`), getJson(`commentary/Calvin/${b}.json`)])
  const ci = (idx.chapters || []).find(x => +x.chapter === c), ct = (txt.chapters || []).find(x => +x.chapter === c)
  if (!ci || !ct || !Array.isArray(ci.sections)) return { how: 'none', blocks: [] }
  if (ci.textLength !== undefined && ct.commentary.length !== +ci.textLength) return { how: 'none', blocks: [], note: 'index does not match text; not served' }
  const own = ci.sections.filter(s => +s.verse === v)
  let secs = own, how = 'own', openV = v
  if (!own.length) {
    const before = ci.sections.filter(s => +s.verse < v)
    if (!before.length) return { how: 'none', blocks: [] }
    openV = Math.max(...before.map(s => +s.verse))
    secs = before.filter(s => +s.verse === openV)
    how = 'within'
  }
  const text = secs.map(s => ct.commentary.slice(s.start, s.end)).join('\n\n')
  const blocks = packText(text, 1400, 2000).slice(0, MAX_BLOCKS)
  if (!blocks.length) return { how: 'none', blocks: [] }
  return how === 'own' ? { how, label: `Calvin’s comment on verse ${v}`, blocks } : { how, label: `Calvin treats verse ${v} within his comment that opens at verse ${openV}`, blocks }
}
function jfbVerses(spec) {
  const set = new Set()
  for (const part of spec.split(',')) {
    const m = part.trim().match(/^(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?$/)
    if (!m) continue
    const a = +m[1], z = m[2] ? +m[2] : a
    for (let n = a; n <= Math.min(z, a + 60); n++) set.add(n)
  }
  return set
}
async function noteJfb(b, c, v) {
  const f = await getJson(`commentary/JFB/${b}.json`)
  const ch = (f.chapters || []).find(x => +x.chapter === c)
  if (!ch || !ch.commentary) return { how: 'none', blocks: [] }
  const entries = []
  for (const line of String(ch.commentary).split('\n')) {
    const m = line.match(/^(\d{1,3}(?:\s*[,\-–]\s*\d{1,3})*)\.\s+\S/)
    if (m) entries.push({ spec: m[1], verses: jfbVerses(m[1]), text: line.trim() })
    else if (entries.length && line.trim()) entries[entries.length - 1].text += ' ' + line.trim()
  }
  const hit = entries.filter(e => e.verses.has(v))
  if (!hit.length) return { how: 'none', blocks: [] }
  const exact = hit.some(e => e.verses.size === 1)
  const blocks = hit.map(e => e.text).slice(0, MAX_BLOCKS)
  return exact ? { how: 'own', label: `JFB’s note on verse ${v}`, blocks } : { how: 'within', label: `JFB treats verse ${v} together with the verses ${hit[0].spec}`, blocks }
}
async function teacherNote(t, b, c, v) {
  try {
    if (t === 'henry') return await noteHenry(b, c, v)
    if (t === 'gill') return await noteGill(b, c, v)
    if (t === 'calvin') return await noteCalvin(b, c, v)
    if (t === 'jfb') return await noteJfb(b, c, v)
  } catch (e) { return { how: 'none', blocks: [], note: 'could not read the source (' + String(e && e.message).slice(0, 80) + ')' } }
  return { how: 'none', blocks: [] }
}

// ───────────────────────────── gates (pure functions; tested without the AI) ─────────────────────────────
const plain = s => String(s || '').replace(/\*/g, '')
const words = s => plain(s).trim().split(/\s+/).filter(Boolean).length
const STOP = new Set(('about above after again also always because been before being between both cannot could does done down during each even ever every from give given gives have having here himself herself into itself just kind like made make makes many more most much must never only other over said same shall should since some such than that their them then there these they this those though through thus under until upon very were what when where whether which while whom whose will with within without would your yours says say told tell tells first second third next henry gill calvin reads read points point thinks think draws draw lessons lesson adds explains broad terms real right away').split(' '))
const stem = w => w.replace(/(ing|ed|es|s|ly)$/, '').slice(0, 6)
function keyStems(t) { return (String(t).toLowerCase().replace(/[^a-z\s]/g, ' ').match(/[a-z]{4,}/g) || []).filter(w => !STOP.has(w)).map(w => [w, stem(w)]) }
function ground(out, src) {
  const keys = keyStems(out), have = new Set(keyStems(src).map(x => x[1]))
  const miss = [...new Set(keys.filter(k => !have.has(k[1])).map(k => k[0]))]
  return { score: keys.length ? +((keys.length - keys.filter(k => !have.has(k[1])).length) / keys.length).toFixed(2) : 0, missing: miss }
}
function extractRefs(text) {
  const refs = [], spans = []
  const re = /\b((?:[1-3]\s?|First\s+|Second\s+|Third\s+)?[A-Z][A-Za-z]{1,12}\.?)(?:\s+(?:of\s+)?([A-Z][a-z]+))?\s+(\d{1,3}):(\d{1,3})(?:\s*[-–]\s*\d{1,3})?/g
  let m
  while ((m = re.exec(text))) {
    // the first word may be ordinary text ("See Job 11:10", "Compare Gen 1:1"), so try the book as the second word first
    let code = (m[2] && (bookFromText(m[2]) || bookFromText(m[1] + ' of ' + m[2]) || bookFromText(m[1] + ' ' + m[2]))) || bookFromText(m[1])
    refs.push({ raw: m[0], code, key: code ? `${code} ${+m[3]}:${+m[4]}` : null })
    spans.push([m.index, m.index + m[0].length])
  }
  return { refs, spans }
}
function stripSpans(text, spans) { let o = '', p = 0; for (const [a, z] of spans) { o += text.slice(p, a) + ' '; p = z } return o + text.slice(p) }
const ALLOWED_CAPS = new Set(['god', 'lord', 'jesus', 'christ', 'spirit', 'holy', 'bible', 'scripture', 'scriptures', 'gospel', 'father', 'son', 'savior', 'saviour', 'amen'])
const CONTEXT_WORDS = /\b(archaeolog\w*|historian\w*|scholars?|ancient|in those days|at that time|at the time|centur(?:y|ies)|BCE?|AD|today|nowadays|modern|in our day|in our time|culture|cultural|tradition(?:al|ally)?|Greek|Hebrew|Aramaic|Latin|original language|literally means)\b/gi

function restateGates(out, block, ctx) {
  const problems = []
  const o = String(out || '').trim()
  const src = plain(block)
  const srcL = src.toLowerCase()
  const passage = ctx.passageText || ''
  const ref = ctx.passageRefs || []
  if (!o) return { problems: ['empty'], metrics: {} }
  if (/["“”„«»]/.test(o)) problems.push('contains quotation marks (the teacher’s own words must only appear in the original block)')
  if (/>>|\*\*|^#|`/m.test(o)) problems.push('contains markup')
  if (/[Ͱ-Ͽἀ-῿֐-׿]/.test(o)) problems.push('contains Greek or Hebrew letters')
  // added context / original-language teaching: allowed only where the block itself uses the word
  for (const m of o.match(CONTEXT_WORDS) || []) if (!srcL.includes(m.toLowerCase())) problems.push(`adds background the block does not give (“${m}”)`)
  // references: only ones the block cites (or the studied passage itself)
  const outRefs = extractRefs(o), blockRefs = extractRefs(block)
  const okRefs = new Set([...blockRefs.refs.map(r => r.key).filter(Boolean), ...ref])
  for (const r of outRefs.refs) {
    if (!r.key) problems.push(`reference ${r.raw} is not a recognised Bible reference`)
    else if (!okRefs.has(r.key)) problems.push(`reference ${r.raw} is not cited in the block`)
  }
  // numbers
  const oNoRef = stripSpans(o, outRefs.spans)
  for (const n of oNoRef.match(/\b\d{3,4}\b/g) || []) if (!src.includes(n) && !passage.includes(n)) problems.push(`number ${n} is not in the block`)
  for (const n of oNoRef.match(/\b(hundred|thousand|million)\b/gi) || []) if (!srcL.includes(n.toLowerCase())) problems.push(`number word “${n}” is not in the block`)
  // names: capitalised words in mid-sentence must come from the block, the studied verses, or a short allow-list
  const supplied = (srcL + ' ' + passage.toLowerCase() + ' ' + ctx.teacher.name.toLowerCase())
  const capRe = /\b([A-Z][a-z]{2,})(?:['’]s)?\b/g
  let cm
  const seenCaps = new Set()
  while ((cm = capRe.exec(oNoRef))) {
    const before = oNoRef.slice(0, cm.index)
    if (/^\s*$/.test(before) || /[.!?:]\s*(?:\d+\.\s*)?$/.test(before) || /(?:^|\n)\s*(?:\d+\.\s*|\(\d+\.\)\s*|[IVX]+\.\s*)?$/.test(before)) continue   // sentence-initial
    const w = cm[1].toLowerCase()
    if (ALLOWED_CAPS.has(w) || seenCaps.has(w)) continue
    seenCaps.add(w)
    if (!supplied.includes(w.slice(0, Math.max(4, w.length - 1)))) problems.push(`names “${cm[1]}”, who is not in the block`)
  }
  // attribution: names the teacher (so the reader knows whose view it is) and no other teacher
  if (!ctx.teacher.mention.test(o)) problems.push(`does not say whose view this is (${ctx.teacher.short})`)
  for (const m of o.match(OTHER_TEACHER_NAMES) || []) if (!ctx.teacher.mention.test(m) && !src.includes(m)) problems.push(`names ${m}, who is not the teacher of this block`)
  // copying: the teacher marks Scripture he quotes in *asterisks*. Lifting most of such a passage (8+ words, 75%+ of it) without quotation marks is an unmarked Scripture quotation.
  const nw = t => plain(t).toLowerCase().replace(/[^a-z0-9’' ]+/g, ' ').split(/\s+/).filter(Boolean)
  const ow = nw(o)
  for (const sp of block.match(/\*[^*]{20,400}\*/g) || []) {
    const sw = nw(sp)
    if (sw.length < 8) continue
    let best = 0
    for (let i = 0; i < sw.length; i++) for (let j = 0; j < ow.length; j++) { let k = 0; while (i + k < sw.length && j + k < ow.length && sw[i + k] === ow[j + k]) k++; if (k > best) best = k }
    if (best >= 8 && best / sw.length >= 0.75) { problems.push(`quotes Scripture from the block without quotation marks (“${sw.slice(0, 8).join(' ')}…”)`); break }
  }
  // counts: if it says "two lessons" and then numbers its items, the numbers must agree
  const NUMW = { two: 2, three: 3, four: 4, five: 5, six: 6 }
  for (const cm2 of o.matchAll(/\b(two|three|four|five|six)\s+(lessons?|points?|parts?|things|ways|reasons|covenants?)\b/gi)) {
    const rest = o.slice(cm2.index + cm2[0].length).split('\n').slice(1)
    let n = 0
    for (const l of rest) { if (!l.trim()) continue; if (/^\s*\d+\.\s/.test(l)) n++; else break }
    if (n && n !== NUMW[cm2[1].toLowerCase()]) problems.push(`says ${cm2[1]} ${cm2[2]} but lists ${n}`)
  }
  // length
  const wo = words(o), ws = words(block)
  const ratio = ws ? +(wo / ws).toFixed(2) : 0
  if (wo > Math.max(ws * 0.95, 30)) problems.push(`not shorter than the original (${wo} words against ${ws})`)
  if (wo < Math.min(ws * 0.3, 25)) problems.push(`too thin: ${wo} words against ${ws}`)
  // grounding: its key words have to be words the block (or the verses) already use
  const g = ground(oNoRef, src + ' ' + passage)
  if (g.score < GROUND_MIN) problems.push(`only ${Math.round(g.score * 100)}% of its key words come from the block (new: ${g.missing.slice(0, 8).join(', ')})`)
  const kept = blockRefs.refs.filter(r => r.key && outRefs.refs.some(x => x.key === r.key)).length
  return { problems, metrics: { words: wo, sourceWords: ws, ratio, ground: g.score, refsKept: kept, refsInBlock: blockRefs.refs.filter(r => r.key).length } }
}

// ───────────────────────────── restatement (the one AI step) ─────────────────────────────
const EX_ORIGINAL = `1. God told Noah, in general, that he would destroy the world (Ge 6:13): *The end of all flesh has come before me; I will destroy them;* that is, the ruin of this wicked world is decreed and determined; *it has come,* that is, it will come surely, and come quickly. Noah, it is likely, in preaching to his neighbours, had warned them, in general, of the wrath of God that they would bring upon themselves by their wickedness, and now God seconds his endeavours by a particular denunciation of wrath, that Noah might try whether this would work upon them. Hence observe, (1.) That God *confirmeth the words of his messengers,* Isa 44:26. (2.) That *to him that has,* and uses what he has for the good of others, *more shall be given,* more full instructions.`
const EX_RESTATED = `First, God told Noah in broad terms that he would destroy the world. When God says the end of all flesh has come before him, Henry reads it this way: the downfall of this wicked world has been decided, and it will certainly come, and soon. Henry thinks Noah had probably already been warning his neighbors in general terms that their wickedness would bring God’s anger on them. Now God backs him up with a specific announcement of that anger, so Noah could see whether it would move them.
Henry draws two lessons from this:
1. God stands behind the words of the people he sends (Isa 44:26).
2. Whoever has something and uses it for other people’s good will be given more, including fuller instructions.`

const RESTATE_SYSTEM = `You restate ONE block of an old Bible commentary in plain modern English for an adult who is new to the Bible. You are changing the style, not teaching. The commentator is the teacher; you only make his words easy to follow.
RULES (a program checks every one, and a restatement that breaks any is thrown away):
- Plain adult English, about 8th to 10th grade. Short sentences. Translate old words and phrases into everyday ones (recompence of singular services = repays special service; periphrasis = another way of saying; denunciation = announcement; foresaid = earlier).
- Cover every point in the block, in the commentator's own order. Keep numbered points as numbered points, on their own lines (1. 2. 3.). Do not add, drop, merge or reorder points. Be shorter than the block: about 60 to 80 percent of its length.
- Keep the commentator's view as his own: refer to him by the name given, for example Henry thinks, Henry says, Henry points out, using the name once or twice, not in every sentence.
- Add nothing. No history, background, dates, places, people, numbers, word studies, application or teaching of your own. Use only names, numbers and Bible references that are in the block. If the block gives a Bible reference, you may keep it exactly as written in the block (for example Isa 44:26) or drop it; never add one.
- No quotation marks of any kind. When the commentator quotes Scripture, say what it says in your own words, or leave the quotation out.
- No Greek, Hebrew or Latin words, no transliteration. Do not describe what a word means in the original language unless the block itself does.
- No headings, no bullets, no bold, no markdown. Plain paragraphs and numbered lines only.
- Do not judge whether the commentator is right.
Reply with the restatement only.
STYLE EXAMPLE (follow the style, never reuse its content):
BLOCK:
${EX_ORIGINAL}
RESTATEMENT:
${EX_RESTATED}`

async function callModel(env, model, user, max) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: max, temperature: 0, system: RESTATE_SYSTEM, messages: [{ role: 'user', content: user }] }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 160)}`)
  const j = await res.json()
  return { text: (j.content || []).map(c => c.text || '').join('').trim(), usage: j.usage || {} }
}

async function restateBlock(env, tid, ref, idx, ed) {
  const teacher = TEACHERS[tid]
  if (!teacher) return { ok: false, reasons: ['unknown teacher'] }
  const model = env.RESTATE_MODEL || DEFAULT_MODEL
  const cacheKey = `https://cache.rabbitlab.invalid/${PROMPT_VERSION}/${model}/${tid}/${ref.b}/${ref.c}/${ref.v}/${idx}`
  const cache = typeof caches !== 'undefined' ? caches.default : null
  if (cache) { const hit = await cache.match(cacheKey); if (hit) { const j = await hit.json(); return { ...j, cached: true } } }
  const note = await teacherNote(tid, ref.b, ref.c, ref.v)
  const block = note.blocks[idx]
  if (!block) return { ok: false, reasons: ['no such block'] }
  const verses = await getScripture(ed, ref.b, ref.c, ref.v, ref.ve)
  const passageText = verses.map(x => x.text).join(' ')
  const passageRefs = verses.map(x => `${ref.b} ${ref.c}:${x.n}`)
  const bw = words(block)
  const base = `TEACHER: ${teacher.short}\nSTUDIED VERSE: ${ref.label}: ${passageText}\nLENGTH: the block is ${bw} words. Write about ${Math.round(bw * 0.72)} words and never more than ${Math.round(bw * 0.88)}. Keep every point and every Bible reference the block gives, but say each in fewer words.\n\nBLOCK:\n${plain(block)}`
  const usage = { input: 0, output: 0 }
  let last = null, note2 = '', rejected = null
  for (let attempt = 0; attempt < 2; attempt++) {
    let r
    try { r = await callModel(env, model, base + (note2 ? `\n\nYOUR PREVIOUS ATTEMPT BROKE THESE RULES. Fix them, keep everything else:\n${note2}` : ''), 1200) } catch (e) { return { ok: false, reasons: ['The AI call failed: ' + String(e && e.message).slice(0, 120)], model } }
    usage.input += r.usage.input_tokens || 0; usage.output += r.usage.output_tokens || 0
    const g = restateGates(r.text, block, { teacher, passageText, passageRefs })
    last = { text: r.text, ...g }
    if (!g.problems.length) break
    rejected = r.text
    note2 = g.problems.map(p => '- ' + p).join('\n')
  }
  const cost = +((usage.input * 1 + usage.output * 5) / 1e6).toFixed(5)
  if (last.problems.length) return { ok: false, reasons: last.problems, rejected: last.text, metrics: last.metrics, model, usage, cost }
  const res = { ok: true, text: last.text, metrics: last.metrics, model, usage, cost, retried: !!rejected }
  if (cache) await cache.put(cacheKey, new Response(JSON.stringify(res), { headers: { 'Cache-Control': 'max-age=2592000', 'Content-Type': 'application/json' } }))
  return res
}

// ───────────────────────────── test set ─────────────────────────────
const TEST_SET = [
  ['Genesis 6:13', 'henry'], ['Psalm 23:1', 'henry'], ['Proverbs 25:21', 'gill'], ['Isaiah 53:5', 'henry'], ['John 3:16', 'henry'], ['John 3:16', 'gill'],
  ['John 19:26', 'henry'], ['Romans 8:28', 'henry'], ['Romans 8:28', 'calvin'], ['1 Corinthians 13:4', 'henry'], ['Ephesians 4:32', 'henry'], ['Hebrews 11:1', 'henry'],
  ['James 1:2', 'henry'], ['John 3:3', 'jfb'], ['Genesis 1:1', 'gill'], ['Matthew 6:9', 'calvin'],
]

// ───────────────────────────── http ─────────────────────────────
function cors(req, env) {
  const h = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'X-Worker-Version': VERSION, 'Access-Control-Expose-Headers': 'X-Worker-Version' }
  return h
}
const json = (o, req, env, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors(req, env), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })

async function handle(request, env) {
  const url = new URL(request.url)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request, env) })
  if (env.ALLOWED_ORIGIN) {
    const origin = request.headers.get('Origin')
    if (origin && !env.ALLOWED_ORIGIN.split(',').map(s => s.trim()).includes(origin)) return json({ error: 'origin not allowed' }, request, env, 403)
  }
  const p = url.pathname
  if (p === '/' || p === '/version') return json({ worker: VERSION, promptVersion: PROMPT_VERSION, model: env.RESTATE_MODEL || DEFAULT_MODEL, hasKey: !!env.ANTHROPIC_API_KEY }, request, env)
  if (p === '/parse') { const r = parseRef(url.searchParams.get('q')); return r ? json(r, request, env) : json({ error: 'Give a book, chapter and verse, for example John 3:16' }, request, env, 400) }
  if (p === '/passage') {
    const ref = parseRef(url.searchParams.get('q'))
    if (!ref) return json({ error: 'Give a book, chapter and verse, for example John 3:16' }, request, env, 400)
    const t = TEACHERS[url.searchParams.get('t')] ? url.searchParams.get('t') : 'henry'
    const ed = url.searchParams.get('ed') === 'web' ? 'web' : 'kjv'
    const [verses, notes] = await Promise.all([getScripture(ed, ref.b, ref.c, ref.v, ref.ve).catch(() => []), Promise.all(TEACHER_ORDER.map(id => teacherNote(id, ref.b, ref.c, ref.v)))])
    const byId = Object.fromEntries(TEACHER_ORDER.map((id, i) => [id, notes[i]]))
    return json({
      ref, edition: ed, scripture: verses, teacher: { id: t, name: TEACHERS[t].name, how: byId[t].how, label: byId[t].label || null, note: byId[t].note || null, blocks: byId[t].blocks },
      voices: TEACHER_ORDER.map(id => ({ id, name: TEACHERS[id].name, how: byId[id].how, label: byId[id].label || null })),
    }, request, env)
  }
  if (p === '/restate' && request.method === 'POST') {
    if (!env.ANTHROPIC_API_KEY) return json({ ok: false, reasons: ['no API key set on this Worker'] }, request, env, 500)
    let body; try { body = await request.json() } catch { return json({ error: 'bad json' }, request, env, 400) }
    const ref = parseRef(body.q) || (body.b ? { b: body.b, c: +body.c, v: +body.v, ve: body.ve ? +body.ve : null, label: `${BOOK_NAME[body.b] || body.b} ${body.c}:${body.v}` } : null)
    if (!ref || !BOOK_NAME[ref.b]) return json({ error: 'bad reference' }, request, env, 400)
    const idx = Math.max(0, Math.min(MAX_BLOCKS - 1, +body.i || 0))
    return json(await restateBlock(env, TEACHERS[body.t] ? body.t : 'henry', ref, idx, body.ed === 'web' ? 'web' : 'kjv'), request, env)
  }
  if (p === '/batch') {
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'no API key set on this Worker' }, request, env, 500)
    const from = Math.max(0, +url.searchParams.get('from') || 0), n = Math.max(1, Math.min(6, +url.searchParams.get('n') || 4))
    const items = TEST_SET.slice(from, from + n)
    const results = []
    for (const [q, t] of items) {
      const ref = parseRef(q)
      const note = await teacherNote(t, ref.b, ref.c, ref.v)
      if (!note.blocks.length) { results.push({ q, t, skipped: 'teacher has no note here' }); continue }
      const r = await restateBlock(env, t, ref, 0, 'kjv')
      results.push({ q, t, how: note.how, original: note.blocks[0], ...r })
    }
    const passed = results.filter(r => r.ok).length
    return json({ from, n, next: from + n < TEST_SET.length ? from + n : null, total: TEST_SET.length, passed, failed: results.filter(r => r.ok === false).length, skipped: results.filter(r => r.skipped).length, results }, request, env)
  }
  return json({ error: 'not found' }, request, env, 404)
}

export default { async fetch(request, env, ctx) { try { return await handle(request, env, ctx) } catch (e) { return json({ error: 'server error: ' + String(e && e.message).slice(0, 160) }, request, env, 500) } } }
export { parseRef, restateGates, teacherNote, packText, extractRefs, TEACHERS, TEST_SET, getScripture, RESTATE_SYSTEM, BOOK_NAME, restateBlock, VERSION, PROMPT_VERSION }
