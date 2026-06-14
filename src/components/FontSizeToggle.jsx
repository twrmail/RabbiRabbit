export default function FontSizeToggle({ enlarged, onToggle }) {
  return (
    <button
      onClick={onToggle}
      title="Toggle larger text"
      style={{
        fontFamily: "'Cormorant Garamond', serif",
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
        borderRadius: 6,
        padding: '7px 14px',
        background: enlarged ? 'var(--gold)' : 'transparent',
        color: enlarged ? 'var(--white)' : 'var(--navy)',
        border: '1.5px solid var(--navy)',
        minWidth: 56,
        textAlign: 'center',
        transition: 'all 0.15s',
      }}
    >
      {enlarged ? 'Aa ⟲' : 'Aa +'}
    </button>
  )
}
