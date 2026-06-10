import { useRef } from 'react'

function formatStudy(text) {
  // Convert markdown-style headings and formatting to HTML
  return text
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/^(?!<[hul])(.+)$/gm, (m) => m.trim() ? `<p>${m}</p>` : '')
    .replace(/<p><\/p>/g, '')
    // Style rabbit trail sections
    .replace(/<p>🐇 Rabbit Trail<\/p>/g, '<div class="trail-head rabbit">🐇 Rabbit Trail</div>')
    .replace(/<h2>🐇 (.+?)<\/h2>/g, '<div class="trail-head rabbit">🐇 $1</div>')
    .replace(/<h2>🕍 (.+?)<\/h2>/g, '<div class="trail-head rabbi">🕍 $1</div>')
    .replace(/<h2>🐇 What'?s Over the Hill<\/h2>/g, '<div class="trail-head hill">🐇 What\'s Over the Hill</div>')
}

export default function StudyOutput({ content, onReset }) {
  const ref = useRef()

  const copy = () => {
    if (ref.current) {
      const text = ref.current.innerText
      navigator.clipboard.writeText(text).catch(() => {})
    }
  }

  const print = () => window.print()

  return (
    <div>
      {/* Controls */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
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
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={copy} style={btnStyle('outline')}>Copy Text</button>
          <button onClick={print} style={btnStyle('outline')}>Print</button>
          <button onClick={onReset} style={btnStyle('ghost')}>← New Study</button>
        </div>
      </div>

      {/* Study content */}
      <div
        ref={ref}
        className="study-output"
        dangerouslySetInnerHTML={{ __html: formatStudy(content) }}
      />

      {/* Bottom reset */}
      <div style={{ marginTop: 32, textAlign: 'center' }}>
        <button onClick={onReset} style={{
          ...btnStyle('primary'),
          padding: '12px 32px',
        }}>
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
        .study-output p {
          margin: 0 0 14px;
        }
        .study-output strong {
          font-weight: 600;
          color: var(--navy);
        }
        .study-output em {
          font-style: italic;
        }
        .study-output ul {
          padding: 0;
          margin: 10px 0 16px;
          list-style: none;
        }
        .study-output li {
          padding-left: 18px;
          position: relative;
          margin-bottom: 8px;
        }
        .study-output li::before {
          content: '–';
          position: absolute;
          left: 0;
          color: var(--gold);
          font-weight: 700;
        }
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
        .trail-head.rabbi {
          border-left-color: var(--sage);
          background: rgba(107,140,110,0.08);
          color: var(--sage);
        }
        .trail-head.hill {
          border-left-color: var(--sage);
          background: rgba(107,140,110,0.08);
          color: var(--sage);
        }
        @media (max-width: 600px) {
          .study-output {
            padding: 24px 20px;
          }
        }
        @media print {
          header, footer, .study-output + div { display: none; }
          .study-output {
            border: none;
            box-shadow: none;
            padding: 0;
          }
        }
      `}</style>
    </div>
  )
}

function btnStyle(variant) {
  const base = {
    fontFamily: 'Inter, sans-serif',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    borderRadius: 6,
    transition: 'opacity 0.15s',
  }
  if (variant === 'primary') return {
    ...base,
    background: 'var(--navy)',
    color: 'var(--white)',
    border: 'none',
    fontSize: 14,
    fontWeight: 600,
  }
  if (variant === 'outline') return {
    ...base,
    background: 'transparent',
    color: 'var(--navy)',
    border: '1.5px solid var(--navy)',
    padding: '7px 16px',
  }
  return {
    ...base,
    background: 'transparent',
    color: 'var(--ink-light)',
    border: 'none',
    padding: '7px 10px',
  }
}
