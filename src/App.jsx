import { useState } from 'react'
import StudyForm from './components/StudyForm'
import StudyOutput from './components/StudyOutput'
import Header from './components/Header'

export default function App() {
  const [study, setStudy] = useState(null)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState(null)
  const [enlarged, setEnlarged] = useState(false)
  const [trailContext, setTrailContext] = useState(null)

  const handleContinueTrail = (hillText) => {
    // Store the Over the Hill text as trail context
    // then reset to the form so user can generate the next study
    setTrailContext(hillText)
    setStudy(null)
    setStreaming(false)
    setError(null)
  }

  const handleReset = () => {
    setStudy(null)
    setStreaming(false)
    setError(null)
    // Keep trailContext if set — user may want to continue the trail
    // Clear it only when they explicitly start a new unrelated study
  }

  const handleNewStudy = () => {
    setStudy(null)
    setStreaming(false)
    setError(null)
    setTrailContext(null)
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
            onClearTrail={() => setTrailContext(null)}
          />
        ) : (
          <StudyOutput
            content={study || ''}
            streaming={streaming}
            onReset={handleReset}
            onContinueTrail={handleContinueTrail}
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
