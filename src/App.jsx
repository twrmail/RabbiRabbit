import { useState } from 'react'
import StudyForm from './components/StudyForm'
import StudyOutput from './components/StudyOutput'
import Header from './components/Header'
import Disclaimer from './components/Disclaimer'

export default function App() {
  const [study, setStudy] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <main style={{ flex: 1, maxWidth: 780, margin: '0 auto', width: '100%', padding: '32px 20px 60px' }}>
        {!study ? (
          <>
            <Disclaimer />
            <StudyForm
              onStudy={setStudy}
              loading={loading}
              setLoading={setLoading}
              error={error}
              setError={setError}
            />
          </>
        ) : (
          <StudyOutput
            content={study}
            onReset={() => { setStudy(null); setError(null) }}
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
