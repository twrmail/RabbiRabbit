import { useState, useEffect } from 'react'

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://your-worker.workers.dev'

// Format today's date as a readable label
function formatDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  })
}

export default function MorningTrailSeed({ onBegin, audience = 'general', translation = 'bsb' }) {
  const [seed, setSeed] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`${WORKER_URL}/daily-seed`)
      .then(r => {
        if (!r.ok) throw new Error(`Seed fetch failed: ${r.status}`)
        return r.json()
      })
      .then(data => {
        if (!cancelled) {
          setSeed(data)
          setLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [])

  const handleBegin = () => {
    if (!seed || !onBegin) return
    // Hand the resolved seed directly to the study generation flow.
    // studyInput is a clean "Book Chapter:Verse" string the Worker
    // already knows how to parse. studyType is always devotional here.
    onBegin({
      studyType: 'devotional',
      primaryInput: seed.studyInput,
      audience,
      translation,
      // Pass topic as a note so the devotional prompt has thematic context
      notes: `Today's theme: ${seed.topic}`,
    })
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div style={styles.card}>
        <div style={styles.kicker}>Morning Trail</div>
        <div style={styles.loadingRow}>
          <div style={styles.pulse} />
          <span style={styles.loadingText}>Finding today's verse…</span>
        </div>
      </div>
    )
  }

  // ── Error state ──
  if (error || !seed) {
    return (
      <div style={styles.card}>
        <div style={styles.kicker}>Morning Trail</div>
        <p style={styles.errorText}>
          Today's seed couldn't be loaded. Try refreshing, or enter a verse below.
        </p>
      </div>
    )
  }

  // ── Ready state ──
  return (
    <div style={styles.card}>
      {/* Kicker + date */}
      <div style={styles.topRow}>
        <div style={styles.kicker}>Morning Trail</div>
        <div style={styles.dateLabel}>{formatDate(seed.date)}</div>
      </div>

      {/* Topic */}
      <div style={styles.topicLabel}>
        Today's theme: <strong>{seed.topic}</strong>
      </div>

      {/* Verse */}
      <div style={styles.verseBlock}>
        {seed.scripture ? (
          <p style={styles.verseText}>"{seed.scripture}"</p>
        ) : (
          <p style={styles.verseText}>{seed.reference}</p>
        )}
        <div style={styles.verseRef}>{seed.reference}</div>
      </div>

      {/* Begin button */}
      <button onClick={handleBegin} style={styles.beginBtn}>
        Begin Today's Trail →
      </button>

      {/* Quiet note about sharing */}
      <div style={styles.shareNote}>
        Everyone using RabbiRabbit today starts here.
        Share the study and discuss it with others.
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────
// Uses CSS variables already defined in the app's global stylesheet.
// No new variables introduced -- stays consistent with the existing
// gold/navy/sage palette.
const styles = {
  card: {
    background: 'var(--parch)',
    border: '1.5px solid var(--gold)',
    borderRadius: 12,
    padding: '28px 32px',
    marginBottom: 24,
  },
  topRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  kicker: {
    fontFamily: 'Inter, sans-serif',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--gold)',
  },
  dateLabel: {
    fontFamily: 'Inter, sans-serif',
    fontSize: 11,
    color: 'var(--ink-light)',
  },
  topicLabel: {
    fontFamily: 'Inter, sans-serif',
    fontSize: 12,
    color: 'var(--ink-light)',
    marginBottom: 16,
  },
  verseBlock: {
    borderLeft: '3px solid var(--gold)',
    paddingLeft: 16,
    marginBottom: 22,
  },
  verseText: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 19,
    fontStyle: 'italic',
    color: 'var(--navy)',
    lineHeight: 1.55,
    margin: '0 0 6px',
  },
  verseRef: {
    fontFamily: 'Inter, sans-serif',
    fontSize: 11,
    fontWeight: 700,
    color: 'color-mix(in srgb, var(--gold) 70%, black)',
    letterSpacing: '0.04em',
  },
  beginBtn: {
    fontFamily: 'Inter, sans-serif',
    fontSize: 14,
    fontWeight: 600,
    background: 'var(--navy)',
    color: 'var(--white)',
    border: 'none',
    borderRadius: 7,
    padding: '12px 28px',
    cursor: 'pointer',
    display: 'block',
    width: '100%',
    marginBottom: 14,
  },
  shareNote: {
    fontFamily: 'Inter, sans-serif',
    fontSize: 11,
    color: 'var(--ink-light)',
    textAlign: 'center',
    lineHeight: 1.5,
  },
  loadingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 0',
  },
  pulse: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'var(--gold)',
    animation: 'pulse 1s ease-in-out infinite',
  },
  loadingText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: 13,
    color: 'var(--ink-light)',
  },
  errorText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: 13,
    color: 'var(--ink-light)',
  },
}
