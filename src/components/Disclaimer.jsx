export default function Disclaimer() {
  return (
    <div style={{
      background: 'var(--gold-pale)',
      border: '1.5px solid var(--gold)',
      borderRadius: 8,
      padding: '16px 20px',
      marginBottom: 28,
    }}>
      {/* Berean line */}
      <p style={{
        fontFamily: 'Inter, sans-serif',
        fontSize: 12.5,
        color: 'var(--ink)',
        lineHeight: 1.6,
        marginBottom: 14,
        fontStyle: 'italic',
      }}>
        The Bereans examined the Scriptures every day to see if what Paul said was true{' '}
        <strong style={{ fontStyle: 'normal', color: 'var(--navy)' }}>(Acts 17:11)</strong>.{' '}
        That is the standard we invite you to hold us to. Verify all references. Read with your Bible open.
      </p>

      <div style={{ height: 1, background: 'var(--border)', marginBottom: 14 }} />

      {/* Three column attribution */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '12px 24px',
      }}>
        {/* Translations */}
        <div>
          <div style={labelStyle}>Scripture Translations</div>
          {[
            ['WEB', 'World English Bible (2020)'],
            ['KJV', 'King James Version (1769)'],
            ['ASV', 'American Standard Version (1901)'],
          ].map(([abbr, name]) => (
            <div key={abbr} style={entryStyle}>
              <span style={abbrStyle}>{abbr}</span>
              <span style={nameStyle}>{name}</span>
            </div>
          ))}
        </div>

        {/* Commentaries */}
        <div>
          <div style={labelStyle}>Commentaries</div>
          {[
            ['MH', 'Matthew Henry (1706)'],
            ['JFB', 'Jamieson-Fausset-Brown (1871)'],
            ['AC', 'Adam Clarke (1826)'],
            ['BN', "Barnes' Notes (1834)"],
            ['CH', "Chrysostom's Homilies (4th c.)"],
            ['CAL', "Calvin's Commentaries (1540s)"],
            ['SP', "Spurgeon's Treasury (1869)"],
            ['JW', "Wesley's NT Notes (1754)"],
          ].map(([abbr, name]) => (
            <div key={abbr} style={entryStyle}>
              <span style={abbrStyle}>{abbr}</span>
              <span style={nameStyle}>{name}</span>
            </div>
          ))}
        </div>

        {/* Cross-references */}
        <div>
          <div style={labelStyle}>Cross-References</div>
          <div style={{ ...entryStyle, alignItems: 'flex-start' }}>
            <span style={nameStyle}>
              OpenBible.info · 255,675 scholarly connections · CC-BY
            </span>
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={labelStyle}>All Materials</div>
            <div style={entryStyle}>
              <span style={nameStyle}>Public domain · Freely used and shared</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const labelStyle = {
  fontFamily: 'Inter, sans-serif',
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--gold)',
  marginBottom: 6,
}

const entryStyle = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
  marginBottom: 3,
}

const abbrStyle = {
  fontFamily: 'Inter, sans-serif',
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--navy)',
  minWidth: 32,
  flexShrink: 0,
}

const nameStyle = {
  fontFamily: 'Inter, sans-serif',
  fontSize: 11,
  color: 'var(--ink-light)',
  lineHeight: 1.4,
}
