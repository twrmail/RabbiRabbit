import { useRef, useState } from 'react'
import { downloadPDF, downloadText } from '../lib/downloadStudy'

function formatStudy(text) {
  return text
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/^(?!<[hul])(.+)$/gm, m => m.trim() ? `<p>${m}</p>` : '')
    .replace(/<p><\/p>/g, '')
    .replace(/<h2>(🐇 What[^<]*)<\/h2>/g, '<div class="trail-head hill">$1</div>')
    .replace(/<h2>(🐇[^<]*)<\/h2>/g, '<div class="trail-head rabbit">$1</div>')
    .replace(/<h2>(🕍[^<]*)<\/h2>/g, '<div class="trail-head rabbi">$1</div>')
}

function extractTitle(text) {
  const match = text.match(/^# (.+)$/m)
  return match ? match[1] : 'Bible Study'
}

function btnStyle(variant) {
  const base = {
    fontFamily: 'Inter, sans-serif',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    borderRadius: 6,
    padding: '7px 14px',
    transition: 'opacity 0.15s',
    whiteSpace: 'nowrap',
  }
  if (variant === 'primary') return { ...base, background: 'var(--navy)', color: 'var(--white)', border: 'none', fontSize: 14, fontWeight: 600, padding: '12px 32px' }
  if (variant === 'outline') return { ...base, background: 'transparent', color: 'var(--navy)', border: '1.5px solid var(--navy)' }
  if (variant === 'gold') return { ...base, background: 'var(--gold)', color: 'var(--white)', border: 'none', fontWeight: 600 }
  if (variant === 'sage') return { ...base, background: 'var(--sage)', color: 'var(--white)', border: 'none', fontWeight: 600 }
  return { ...base, background: 'transparent', color: 'var(--ink-light)', border: 'none' }
}

export default function StudyOutput({ content, onReset }) {
  const ref = useRef()
  const [pdfLoading, setPdfLoading] = useState(false)
  const title = extractTitle(content)

  const copy = () => {
    if (ref.current) navigator.clipboard.writeText(ref.current.innerText).catch(() => {})
  }

  const handlePDF = async () => {
    setPdfLoading(true)
    try {
      await downloadPDF(content, title)
    } catch (e) {
      console.error('PDF error:', e)
    } finally {
      setPdfLoading(false)
    }
  }

  const handleText = () => downloadText(content, title)

  return (
    <div>
      {/* Top controls */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        flexWrap: 'wrap',
        gap: 10,
      }}>
        <h2 style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 24,
          color: 'var(--navy)',
          fontWeight: 600,
        }}>
          Your Bible Study
        </h2>
        <button onClick={onReset} style={btnStyle('ghost')}>← New Study</button>
      </div>

      {/* Study content */}
      <div ref={ref} className="study-output" dangerouslySetInnerHTML={{ __html: formatStudy(content) }} />

      {/* Download bar */}
      <div style={{
        marginTop: 24,
        padding: '18px 20px',
        background: 'var(--parch-dark)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <span style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--ink-light)',
          marginRight: 4,
          flexShrink: 0,
        }}>
          Save Study
        </span>
        <button onClick={handlePDF} disabled={pdfLoading} style={btnStyle('gold')}>
          {pdfLoading ? 'Building PDF…' : '↓ Download PDF'}
        </button>
        <button onClick={handleText} style={btnStyle('outline')}>
          ↓ Download Text
        </button>
        <button onClick={copy} style={btnStyle('outline')}>
          Copy to Clipboard
        </button>
        <button onClick={() => window.print()} style={btnStyle('outline')}>
          Print
        </button>
      </div>

      {/* Bottom reset */}
      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <button onClick={onReset} style={btnStyle('primary')}>
          ← Begin Another Study
        </button>
      </div>

      <style>{`
        .study-output {
          background: var(--parch);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 40px 44px;
          font-family: 'Inter', sans-serif;
          font-size: 15px;
          line-height: 1.75;
          color: var(--ink);
          box-shadow: 0 4px 24px rgba(28,35,64,0.07);
        }
        .study-output h1 {
          font-family: 'Cormorant Garamond', serif;
          font-size: 30px;
          font-weight: 700;
          color: var(--navy);
          margin: 0 0 6px;
          line-height: 1.2;
        }
        .study-output h2 {
          font-family: 'Cormorant Garamond', serif;
          font-size: 22px;
          font-weight: 600;
          color: var(--navy);
          margin: 28px 0 10px;
        }
        .study-output h3 {
          font-family: 'Inter', sans-serif;
          font-size: 10px;
          font-weight: 600;
          color: var(--ink-light);
          text-transform: uppercase;
          letter-spacing: 0.12em;
          margin: 22px 0 6px;
        }
        .study-output p { margin: 0 0 14px; }
        .study-output strong { font-weight: 600; color: var(--navy); }
        .study-output em { font-style: italic; }
        .study-output ul { padding: 0; margin: 10px 0 16px; list-style: none; }
        .study-output li { padding-left: 18px; position: relative; margin-bottom: 8px; }
        .study-output li::before { content: '–'; position: absolute; left: 0; color: var(--gold); font-weight: 700; }
        .trail-head {
          margin: 24px 0 10px;
          padding: 10px 16px;
          border-left: 4px solid var(--gold);
          background: var(--gold-pale);
          font-family: 'Inter', sans-serif;
          font-size: 13px;
          font-weight: 600;
          color: var(--gold);
          border-radius: 0 6px 6px 0;
        }
        .trail-head.rabbi, .trail-head.hill {
          border-left-color: var(--sage);
          background: rgba(107,140,110,0.08);
          color: var(--sage);
        }
        @media (max-width: 600px) {
          .study-output { padding: 24px 20px; }
        }
        @media print {
          header, footer, .study-output ~ div { display: none; }
          .study-output { border: none; box-shadow: none; padding: 0; }
        }
      `}</style>
    </div>
  )
}
