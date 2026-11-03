// REFERENCE COPY of the JFB verse-excerpt logic exactly as it appears in worker-v32.js (draft, Oct 25-26).
// Copied verbatim so the notes-shape resolver can be compared against what v32 would serve.
// Do not edit: if v32 changes, re-copy.

export const JFB_NOTE_LINE = /^\s*(\d+)((?:\s*[-–,]\s*\d+)*)\.\s/
export function jfbVersesOf(line) {
  const m = JFB_NOTE_LINE.exec(line)
  if (!m) return null
  const nums = [...m[2].matchAll(/([-–,])\s*(\d+)/g)].map(x => ({ sep: x[1], n: +x[2] }))
  const first = +m[1], out = new Set([first])
  let prev = first
  for (const x of nums) {
    if (x.sep === ',') out.add(x.n)
    else for (let v = prev; v <= x.n; v++) out.add(v)
    prev = x.n
  }
  return { first, verses: out, marker: m[0].trim() }
}

export const JFB_HEADING = /^([1-3]?\s?[A-Z][a-z]{0,3})\s?(\d+):(\d+)((?:\s*[-–,]\s*\d+)*)\.\s*(.*)$/
export function jfbSection(lines, chapter, verse, cap) {
  for (let i = 0; i < lines.length; i++) {
    const h = JFB_HEADING.exec(lines[i])
    if (!h || +h[2] !== chapter) continue
    const covered = jfbVersesOf(h[3] + h[4] + '. ')
    if (!covered || !covered.verses.has(verse)) continue
    const body = []
    for (let j = i + 1; j < lines.length; j++) {
      const n = JFB_HEADING.exec(lines[j])
      if ((n && +n[2] === chapter) || /^CHAPTER\s+\d+/.test(lines[j])) break
      body.push(lines[j])
    }
    const text = body.join('\n').trim()
    if (!text || /^(For the exposition, )?see on\b/i.test(text)) return { text: null, how: 'pointer' }
    const range = (h[3] + h[4]).replace(/\s+/g, '')
    const title = h[5] ? ' ("' + h[5].trim().replace(/\.$/, '') + '")' : ''
    const label = '[JFB comments on verses ' + range + ' together as one passage' + title + '; it has no separate note on verse ' + verse + ']\n'
    return { text: (label + text).slice(0, cap).trim(), how: 'section' }
  }
  return { text: null, how: null }
}

export function jfbExtract(chapterText, chapter, verse, cap = 2000) {
  const lines = chapterText.split('\n')
  let exact = -1, grouped = -1
  for (let i = 0; i < lines.length; i++) {
    const n = jfbVersesOf(lines[i])
    if (!n || !n.verses.has(verse)) continue
    if (n.verses.size === 1) { exact = i; break }
    if (grouped < 0) grouped = i
  }
  const start = exact >= 0 ? exact : grouped
  if (start < 0) return jfbSection(lines, chapter, verse, cap)
  const out = [lines[start]]
  for (let i = start + 1; i < lines.length; i++) {
    const n = jfbVersesOf(lines[i])
    if (n && n.first > verse) break
    if (/^CHAPTER\s+\d+/.test(lines[i])) break
    const h = JFB_HEADING.exec(lines[i]); if (h && +h[2] === chapter) break
    out.push(lines[i])
  }
  let text = out.join('\n').trim()
  if (exact < 0) text = '[JFB comments on these verses together: ' + jfbVersesOf(lines[start]).marker.replace(/\.$/, '') + ']\n' + text
  return { text: text.slice(0, cap).trim(), how: exact >= 0 ? 'verse' : 'grouped' }
}