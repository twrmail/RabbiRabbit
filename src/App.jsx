import { useState } from 'react'
import StudyForm from './components/StudyForm'
import StudyOutput from './components/StudyOutput'
import Header from './components/Header'
import Disclaimer from './components/Disclaimer'

export default function App() {
  const [study, setStudy] = useState(null)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState(null)
  const [enlarged, setEnlarged] = useState(false)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <main style={{ flex: 1, maxWidth: 780, margin: '0 auto', width: '100%', padding: '32px 20px 60px' }}>
        {!study && !streaming ? (
          <>
            <Disclaimer />
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
            />
          </>
        ) : (
          <StudyOutput
            content={study || ''}
            streaming={streaming}
            onReset={() => { setStudy(null); setStreaming(false); setError(null) }}
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
