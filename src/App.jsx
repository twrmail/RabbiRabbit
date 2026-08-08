import { useState } from 'react'
import StudyForm from './components/StudyForm'
import StudyOutput from './components/StudyOutput'
import Header from './components/Header'
import { generateStudy } from './lib/generateStudy'

// Same Worker origin used throughout (StudyForm.jsx, MorningTrailSeed.jsx).
const WORKER_BASE_URL = 'https://silent-heart-df83.twrmail.workers.dev'

export default function App() {
  const [study, setStudy] = useState(null)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState(null)
  const [enlarged, setEnlarged] = useState(false)
  const [trailContext, setTrailContext] = useState(null)
  const [trailDestination, setTrailDestination] = useState(null)
  const [trailMode, setTrailMode] = useState(null) // 'full' or 'conclude'

  const handleContinueTrail = (hillText, destination, mode) => {
    setTrailContext(hillText)
    setTrailDestination(destination)
    setTrailMode(mode)
    setStudy(null)
    setStreaming(false)
    setError(null)
  }

  const handleReset = () => {
    setStudy(null)
    setStreaming(false)
    setError(null)
    // If the trail was concluded with a devotional, the journey is complete —
    // clear trail state so the form returns to its normal fresh start.
    // If mid-trail (mode 'full'), preserve context so user can still continue.
    if (trailMode === 'conclude') {
      setTrailContext(null)
      setTrailDestination(null)
      setTrailMode(null)
    }
  }

  const handleClearTrail = () => {
    setTrailContext(null)
    setTrailDestination(null)
    setTrailMode(null)
  }

  // Devotional continuation ("Have a Few More Minutes?" / "Continue the
  // Thread →" in StudyOutput). Distinct from the full-study trail above —
  // doesn't touch trailContext/trailDestination/trailMode at all, stays
  // entirely within study/streaming state, since it never routes back
  // through StudyForm the way the trail does.
  //
  // Looks up a real next verse via /study-preview's cross-reference data
  // (free, no AI cost, same ranked data Rabbi Road already trusts) rather
  // than letting the model guess at what's related — grounds "continue
  // the thread" in an actual scholarly connection. Falls back to
  // re-anchoring on the same reference if no cross-reference is found,
  // rather than failing the click outright.
  const handleContinueDevotional = async (reference) => {
    setError(null)
    setStudy('')
    setStreaming(true)
    try {
      const previewRes = await fetch(`${WORKER_BASE_URL}/study-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: reference, studyType: 'devotional' }),
      })
      const preview = await previewRes.json()
      const topRef = preview?.crossReferences?.[0]
      const nextInput = topRef
        ? topRef.replace(/\s*\(\d+\s*votes?\)\s*$/i, '').trim()
        : reference

      await generateStudy(
        { studyType: 'devotional', primaryInput: nextInput, audience: 'general', translation: 'web', trailContext: '' },
        (text) => setStudy(text)
      )
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.')
      setStudy(null)
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <main style={{ flex: 1, maxWidth: 780, margin: '0 auto', width: '100%', padding: '32px 20px 60px' }}>
        {!study && !streaming ? (
          <StudyForm
            onStudy={setStudy}
            onStream={(text) => {
              setStreaming(true)
              setStudy(text)
            }}
            onDone={() => setStreaming(false)}
            error={error}
            setError={setError}
            enlarged={enlarged}
            onToggleEnlarge={() => setEnlarged(e => !e)}
            trailContext={trailContext}
            trailDestination={trailDestination}
            trailMode={trailMode}
            onClearTrail={handleClearTrail}
          />
        ) : (
          <StudyOutput
            content={study || ''}
            streaming={streaming}
            onReset={handleReset}
            onContinueTrail={handleContinueTrail}
            onContinueDevotional={handleContinueDevotional}
            enlarged={enlarged}
            onToggleEnlarge={() => setEnlarged(e => !e)}
          />
        )}
      </main>
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '16px 20px',
        textAlign: 'center',
        fontFamily: 'Inter, sans-serif',
        fontSize: 11,
        color: 'var(--ink-light)',
        letterSpacing: '0.05em',
      }}>
        RABBIRABBIT · Scripture texts public domain · Cross-references CC-BY OpenBible.info · MIT License
      </footer>
    </div>
  )
}
