export default function Header() {
  return (
    <header>
      <div style={{
        background: 'var(--navy)',
        padding: '32px 24px 28px',
        textAlign: 'center',
      }}>
        <div style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: 10,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--gold)',
          marginBottom: 12,
        }}>
          🐇 Rabbit Trails · 🕍 Rabbi Roads
        </div>
        <h1 style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 'clamp(30px, 6vw, 52px)',
          fontWeight: 700,
          color: 'var(--white)',
          letterSpacing: '-0.01em',
          lineHeight: 1.1,
          marginBottom: 12,
        }}>
          RabbiRabbit
        </h1>
        <p style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: 14,
          color: 'rgba(247,242,232,0.65)',
          maxWidth: 460,
          margin: '0 auto',
          lineHeight: 1.6,
        }}>
          A Bible study tool that follows rabbit trails and finds its way back.
          Scholarly, ecumenical, and free.
        </p>
      </div>
      <div style={{
        height: 3,
        background: 'linear-gradient(90deg, transparent, var(--gold), transparent)',
      }} />
    </header>
  )
}
