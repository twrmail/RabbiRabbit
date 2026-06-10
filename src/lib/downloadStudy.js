import { jsPDF } from 'jspdf'

// ── Palette ──────────────────────────────────────────────────────
const NAVY   = [28, 35, 64]
const GOLD   = [196, 150, 42]
const SAGE   = [107, 140, 110]
const INK    = [46, 46, 46]
const LIGHT  = [107, 107, 107]
const PARCH  = [247, 242, 232]
const BORDER = [212, 201, 168]

// ── Parse markdown-ish text into tokens ──────────────────────────
function parseTokens(text) {
  const tokens = []
  const lines = text.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) { tokens.push({ type: 'space' }); continue }
    if (trimmed.startsWith('# '))   { tokens.push({ type: 'h1', text: trimmed.slice(2) }); continue }
    if (trimmed.startsWith('## '))  { tokens.push({ type: 'h2', text: trimmed.slice(3) }); continue }
    if (trimmed.startsWith('### ')) { tokens.push({ type: 'h3', text: trimmed.slice(4) }); continue }
    if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      tokens.push({ type: 'bullet', text: trimmed.slice(2) }); continue
    }
    tokens.push({ type: 'body', text: trimmed })
  }
  return tokens
}

// ── Strip markdown bold/italic for plain text rendering ──────────
function stripMd(text) {
  return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1')
}

// ── Detect trail type ─────────────────────────────────────────────
function trailType(text) {
  if (text.startsWith('🐇') && text.includes("Over the Hill")) return 'hill'
  if (text.startsWith('🐇')) return 'rabbit'
  if (text.startsWith('🕍')) return 'rabbi'
  return null
}

// ── Word-wrap text to fit width ───────────────────────────────────
function wrapText(doc, text, maxWidth) {
  return doc.splitTextToSize(text, maxWidth)
}

// ── Main PDF generator ────────────────────────────────────────────
export function downloadPDF(rawText, title = 'RabbiRabbit Study') {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const PW = doc.internal.pageSize.getWidth()
  const PH = doc.internal.pageSize.getHeight()
  const ML = 56, MR = 56, MT = 56, MB = 56
  const CW = PW - ML - MR
  let y = MT

  // ── Page helpers ─────────────────────────────────────────────
  function newPageIfNeeded(needed) {
    if (y + needed > PH - MB) {
      doc.addPage()
      y = MT
      drawPageFooter()
    }
  }

  function drawPageFooter() {
    const pg = doc.internal.getNumberOfPages()
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(...LIGHT)
    doc.text('RabbiRabbit · rabbirabbit.netlify.app', ML, PH - 28)
    doc.text(`${pg}`, PW - MR, PH - 28, { align: 'right' })
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.5)
    doc.line(ML, PH - 38, PW - MR, PH - 38)
  }

  function addSpace(h = 8) { y += h }

  function drawRule(color = BORDER, thickness = 0.5) {
    newPageIfNeeded(10)
    doc.setDrawColor(...color)
    doc.setLineWidth(thickness)
    doc.line(ML, y, PW - MR, y)
    y += 10
  }

  // ── Cover / title block ───────────────────────────────────────
  // Navy header band
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, PW, 110, 'F')
  // Gold rule
  doc.setFillColor(...GOLD)
  doc.rect(0, 110, PW, 2.5, 'F')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...GOLD)
  doc.text('🐇 RABBIT TRAILS  ·  🕍 RABBI ROADS', PW / 2, 38, { align: 'center' })

  doc.setFont('times', 'bold')
  doc.setFontSize(28)
  doc.setTextColor(247, 242, 232)
  const titleLines = wrapText(doc, title, CW)
  titleLines.forEach((tl, i) => {
    doc.text(tl, PW / 2, 66 + i * 32, { align: 'center' })
  })

  y = 130

  // ── Disclaimer box ────────────────────────────────────────────
  const discLines = [
    'A NOTE BEFORE YOU BEGIN',
    '– The Bereans examined the Scriptures every day to see if what Paul said was true (Acts 17:11).',
    '  Hold this tool to that same standard. Open your Bible and check every reference.',
    '– This is a scholarly starting point, not official church teaching. Verify and read widely.',
    '– Where something surprises you — investigate. Where it delights you — dig deeper.',
  ]
  const discH = discLines.length * 13 + 20
  doc.setFillColor(254, 249, 238)
  doc.setDrawColor(...GOLD)
  doc.setLineWidth(1)
  doc.roundedRect(ML, y, CW, discH, 4, 4, 'FD')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...GOLD)
  doc.text(discLines[0], ML + 12, y + 14)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...INK)
  discLines.slice(1).forEach((dl, i) => {
    doc.text(dl, ML + 12, y + 27 + i * 13)
  })
  y += discH + 18
  drawRule(GOLD, 1)
  addSpace(6)

  // ── Render tokens ─────────────────────────────────────────────
  const tokens = parseTokens(rawText)
  let inTrail = false
  let trailColor = GOLD

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]

    if (tok.type === 'space') {
      addSpace(inTrail ? 4 : 6)
      continue
    }

    if (tok.type === 'h1') {
      newPageIfNeeded(48)
      addSpace(16)
      doc.setFont('times', 'bold')
      doc.setFontSize(24)
      doc.setTextColor(...NAVY)
      const lines = wrapText(doc, stripMd(tok.text), CW)
      lines.forEach(l => { doc.text(l, ML, y); y += 28 })
      addSpace(4)
      drawRule(GOLD, 1)
      addSpace(6)
      inTrail = false
      continue
    }

    if (tok.type === 'h2') {
      const tt = trailType(tok.text)
      if (tt) {
        // Trail heading
        newPageIfNeeded(36)
        addSpace(14)
        trailColor = tt === 'rabbi' || tt === 'hill' ? SAGE : GOLD
        const bg = tt === 'rabbi' || tt === 'hill'
          ? [107, 140, 110, 0.1] : [254, 249, 238]
        doc.setFillColor(tt === 'rabbi' || tt === 'hill' ? 240 : 254,
                         tt === 'rabbi' || tt === 'hill' ? 246 : 249,
                         tt === 'rabbi' || tt === 'hill' ? 240 : 238)
        // Measure text height first
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        const tlines = wrapText(doc, stripMd(tok.text), CW - 24)
        const boxH = tlines.length * 14 + 16
        doc.roundedRect(ML, y, CW, boxH, 3, 3, 'F')
        doc.setFillColor(...trailColor)
        doc.rect(ML, y, 4, boxH, 'F')
        doc.setTextColor(...trailColor)
        tlines.forEach((tl, ti) => {
          doc.text(tl, ML + 14, y + 12 + ti * 14)
        })
        y += boxH + 4
        inTrail = true
      } else {
        // Regular section heading
        newPageIfNeeded(36)
        addSpace(18)
        doc.setFont('times', 'bold')
        doc.setFontSize(17)
        doc.setTextColor(...NAVY)
        const lines = wrapText(doc, stripMd(tok.text), CW)
        lines.forEach(l => { doc.text(l, ML, y); y += 20 })
        addSpace(4)
        inTrail = false
        trailColor = GOLD
      }
      continue
    }

    if (tok.type === 'h3') {
      newPageIfNeeded(24)
      addSpace(12)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...LIGHT)
      doc.text(stripMd(tok.text).toUpperCase(), ML + (inTrail ? 12 : 0), y)
      y += 12
      continue
    }

    if (tok.type === 'bullet') {
      const indent = inTrail ? ML + 12 : ML
      const bwidth = inTrail ? CW - 24 : CW - 12
      doc.setFont('times', 'normal')
      doc.setFontSize(10.5)
      doc.setTextColor(...INK)
      const lines = wrapText(doc, stripMd(tok.text), bwidth - 10)
      newPageIfNeeded(lines.length * 14 + 4)
      doc.setTextColor(...trailColor)
      doc.text('–', indent, y)
      doc.setTextColor(...INK)
      lines.forEach((l, li) => {
        doc.text(l, indent + 10, y + li * 14)
      })
      y += lines.length * 14 + 3
      continue
    }

    if (tok.type === 'body') {
      const indent = inTrail ? ML + 12 : ML
      const bwidth = inTrail ? CW - 24 : CW
      doc.setFont('times', 'normal')
      doc.setFontSize(11)
      doc.setTextColor(...INK)
      const lines = wrapText(doc, stripMd(tok.text), bwidth)
      newPageIfNeeded(lines.length * 15 + 4)
      lines.forEach(l => { doc.text(l, indent, y); y += 15 })
      addSpace(4)
      continue
    }
  }

  // Footer on last page
  drawPageFooter()

  // Save
  const slug = title.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 40)
  doc.save(`${slug}-rabbirabbit.pdf`)
}

// ── Plain text download ───────────────────────────────────────────
export function downloadText(rawText, title = 'RabbiRabbit Study') {
  const header = [
    'RABBIRABBIT BIBLE STUDY',
    '========================',
    '',
    'A NOTE BEFORE YOU BEGIN',
    '– The Bereans examined the Scriptures every day to see if what Paul said',
    '  was true (Acts 17:11). Open your Bible and check every reference.',
    '– This is a scholarly starting point, not official church teaching.',
    '– Where something surprises you — investigate. Dig deeper.',
    '',
    '========================',
    '',
  ].join('\n')

  // Strip markdown symbols for clean plain text
  const clean = rawText
    .replace(/^# /gm, '')
    .replace(/^## /gm, '\n── ')
    .replace(/^### /gm, '\n')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^- /gm, '  – ')

  const footer = [
    '',
    '========================',
    'RabbiRabbit · rabbirabbit.netlify.app',
    'Scripture: Public Domain · Cross-references: CC-BY OpenBible.info',
  ].join('\n')

  const full = header + clean + footer
  const blob = new Blob([full], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const slug = title.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 40)
  a.download = `${slug}-rabbirabbit.txt`
  a.click()
  URL.revokeObjectURL(url)
}
