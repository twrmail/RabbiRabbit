export default function Disclaimer() {
  return (
    <div style={{
      background: 'var(--gold-pale)',
      border: '1.5px solid var(--gold)',
      borderRadius: 8,
      padding: '16px 20px',
      marginBottom: 28,
    }}>
      <div style={{
        fontFamily: 'Inter, sans-serif',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--gold)',
        marginBottom: 10,
      }}>
        A Note Before You Begin
      </div>
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          'The Bereans examined the Scriptures every day to see if what Paul said was true (Acts 17:11). Hold this tool to that same standard — open your Bible and check every reference.',
          'This is a scholarly starting point, not official church teaching. Verify references, read widely, and bring questions to your own tradition\'s teachers.',
          'Where something surprises you — investigate. Where something troubles you — sit with it. Where something delights you — dig deeper.',
        ].map((text, i) => (
          <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: 14, lineHeight: 1.5, flexShrink: 0 }}>–</span>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.6 }}>
              {text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
