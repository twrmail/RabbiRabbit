import { useState } from 'react'
import { generateStudy } from '../lib/generateStudy'
import FontSizeToggle from './FontSizeToggle'

const STUDY_TYPES = [
  { value: 'devotional', label: 'Morning Trail', desc: 'A five-minute devotional for the day' },
  { value: 'passage', label: 'Passage Study', desc: 'Verse-by-verse through a text' },
  { value: 'character', label: 'Character Study', desc: 'Deep dive into a biblical figure' },
  { value: 'word', label: 'Word Study', desc: 'Trace a key term through Scripture' },
  { value: 'topical', label: 'Topical Study', desc: 'Explore a theme across the canon' },
  { value: 'book', label: 'Book Overview', desc: 'Survey an entire biblical book' },
]

const AUDIENCE = [
  { value: 'beginner', label: 'New Believers' },
  { value: 'general', label: 'General Adult' },
  { value: 'deeper', label: 'Deeper Study' },
  { value: 'small_group', label: 'Small Group' },
  { value: 'youth', label: 'Youth' },
]

const TRANSLATIONS = [
  { value: 'web', label: 'WEB', full: 'World English Bible (default)' },
  { value: 'kjv', label: 'KJV', full: 'King James Version' },
  { value: 'asv', label: 'ASV', full: 'American Standard Version' },
]

const SECTIONS = [
  { value: 'context', label: 'Historical Context' },
  { value: 'original_language', label: 'Original Language' },
  { value: 'cross_references', label: 'Cross-References' },
  { value: 'application', label: 'Life Application' },
  { value: 'discussion', label: 'Discussion Questions' },
  { value: 'prayer', label: 'Prayer Points' },
]

const PLACEHOLDERS = {
  passage: 'e.g. Romans 8:1-17, John 3:1-21, Psalm 23',
  character: 'e.g. Ruth, Paul, Mary Magdalene, Elijah',
  word: 'e.g. Shalom, Agape, Covenant, Righteousness',
  topical: 'e.g. Forgiveness, Hope, Suffering, Grace',
  book: 'e.g. Jonah, Philippians, Ruth',
  devotional: 'e.g. Psalm 23, Mary Magdalene, Grace, Suffering, John 3:16',
}

const PRIMARY_LABELS = {
  passage: 'Scripture Passage(s)',
  character: 'Biblical Character',
  word: 'Key Word or Term',
  topical: 'Topic or Theme',
  book: 'Biblical Book',
  devotional: 'Passage, Person, or Theme',
}

function Label({ children, required }) {
  return (
    <label style={{
      display: 'block', fontFamily: 'Inter, sans-serif', fontSize: 10,
      fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
      color: 'var(--ink-light)', marginBottom: 7,
    }}>
      {children}{required && <span style={{ color: 'var(--gold)', marginLeft: 3 }}>*</span>}
    </label>
  )
}

function Input({ value, onChange, placeholder, multiline, rows = 3 }) {
  const style = {
    width: '100%', padding: '10px 12px', fontFamily: 'Inter, sans-serif',
    fontSize: 14, color: 'var(--ink)', background: 'var(--white)',
    border: '1.5px solid var(--border)', borderRadius: 6, outline: 'none',
    transition: 'border-color 0.15s', resize: multiline ? 'vertical' : 'none',
  }
  const handlers = {
    onFocus: e => { e.target.style.borderColor = 'var(--gold)'; e.target.style.boxShadow = '0 0 0 3px rgba(196,150,42,0.12)' },
    onBlur: e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none' },
  }
  return multiline
    ? <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows} style={style} {...handlers} />
    : <input value={value} onChange={onChange} placeholder={placeholder} style={style} {...handlers} />
}

function Chip({ label, selected, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 14px', borderRadius: 20,
      border: `1.5px solid ${selected ? 'var(--gold)' : 'var(--border)'}`,
      background: selected ? 'var(--gold)' : 'var(--white)',
      color: selected ? 'var(--white)' : 'var(--ink-light)',
      fontFamily: 'Inter, sans-serif', fontSize: 12.5,
      fontWeight: selected ? 600 : 400, cursor: 'pointer',
      transition: 'all 0.15s', whiteSpace: 'nowrap',
    }}>{label}</button>
  )
}

function TypeCard({ type, selected, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '13px 15px', borderRadius: 8,
      border: `2px solid ${selected ? 'var(--gold)' : 'var(--border)'}`,
      background: selected ? 'var(--gold-pale)' : 'var(--white)',
      textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s', width: '100%',
    }}>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, fontWeight: 600, color: selected ? 'var(--navy)' : 'var(--ink)', marginBottom: 2 }}>
        {type.label}
      </div>
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'var(--ink-light)' }}>
        {type.desc}
      </div>
    </button>
  )
}

function Divider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 20px' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      {label && <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-light)', whiteSpace: 'nowrap' }}>{label}</span>}
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
}

const LOADING_MESSAGES = [
  'Opening the scroll…',
  'Following the trail…',
  'Consulting the scholars…',
  'Tracing the connections…',
  'Finding the way back…',
]

export default function StudyForm({ onStudy, onStream, onDone, error, setError, enlarged, onToggleEnlarge }) {
  const [studyType, setStudyType] = useState('passage')
  const [primaryInput, setPrimaryInput] = useState('')
  const [additionalVerses, setAdditionalVerses] = useState('')
  const [character, setCharacter] = useState('')
  const [theme, setTheme] = useState('')
  const [audience, setAudience] = useState('general')
  const [translation, setTranslation] = useState('web')
  const [sections, setSections] = useState(['context', 'application', 'discussion'])
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState(0)

  const toggleSection = val =>
    setSections(prev => prev.includes(val) ? prev.filter(s => s !== val) : [...prev, val])

  const handleGenerate = async () => {
    if (!primaryInput.trim()) {
      setError('Please enter a primary subject for the study.')
      return
    }
    setError(null)
    setLoading(true)

    // Cycle through loading messages
    let msgIndex = 0
    const interval = setInterval(() => {
      msgIndex = (msgIndex + 1) % LOADING_MESSAGES.length
      setLoadingMsg(msgIndex)
    }, 2500)

    try {
      const params = { studyType, primaryInput, additionalVerses, character, theme, audience, translation, sections, notes }

      // Start streaming — show output panel immediately
      let started = false
      await generateStudy(params, (text) => {
        if (!started) {
          started = true
          onStream(text)
        } else {
          onStudy(text)
        }
      })
      onDone()
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.')
      onStudy(null)
    } finally {
      clearInterval(interval)
      setLoading(false)
    }
  }

  const fontScale = enlarged ? 1.15 : 1

  return (
    <div style={{ zoom: fontScale }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <FontSizeToggle enlarged={enlarged} onToggle={onToggleEnlarge} />
      </div>

      <div style={{ marginBottom: 24 }}>
        <Label required>Study Type</Label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
          {STUDY_TYPES.map(t => (
            <TypeCard key={t.value} type={t} selected={studyType === t.value} onClick={() => setStudyType(t.value)} />
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <Label required>{PRIMARY_LABELS[studyType]}</Label>
        <Input value={primaryInput} onChange={e => setPrimaryInput(e.target.value)} placeholder={PLACEHOLDERS[studyType]} />
      </div>

      <Divider label="Additional Inputs" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <Label>Supporting Verses</Label>
          <Input value={additionalVerses} onChange={e => setAdditionalVerses(e.target.value)} placeholder="e.g. Isaiah 53:5, Hebrews 4:15" multiline rows={2} />
        </div>
        <div>
          <Label>Character Focus</Label>
          <Input value={character} onChange={e => setCharacter(e.target.value)} placeholder="e.g. Paul, Miriam, Peter" />
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <Label>Thematic Emphasis</Label>
        <Input value={theme} onChange={e => setTheme(e.target.value)} placeholder="e.g. redemption, courage in suffering, the kingdom of God" />
      </div>

      <Divider label="Audience, Translation & Sections" />

      <div style={{ marginBottom: 18 }}>
        <Label>Audience</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {AUDIENCE.map(a => <Chip key={a.value} label={a.label} selected={audience === a.value} onClick={() => setAudience(a.value)} />)}
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <Label>Translation</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {TRANSLATIONS.map(t => <Chip key={t.value} label={t.label} selected={translation === t.value} onClick={() => setTranslation(t.value)} />)}
        </div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'var(--ink-light)', marginTop: 6 }}>
          {TRANSLATIONS.find(t => t.value === translation)?.full}
        </div>
      </div>

      <div style={{ marginBottom: 22 }}>
        <Label>Include Sections</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {SECTIONS.map(s => <Chip key={s.value} label={s.label} selected={sections.includes(s.value)} onClick={() => toggleSection(s.value)} />)}
        </div>
      </div>

      <div style={{ marginBottom: 26 }}>
        <Label>Notes for the Study</Label>
        <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Specific angles, questions your group is wrestling with…" multiline rows={3} />
      </div>

      {error && (
        <div style={{ background: 'var(--error-bg)', border: '1px solid #E8B89A', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'var(--error)' }}>
          {error}
        </div>
      )}

      <button
        onClick={handleGenerate}
        disabled={loading}
        style={{
          width: '100%', padding: '15px',
          background: loading ? 'var(--navy-light)' : 'var(--navy)',
          color: 'var(--white)', border: 'none', borderRadius: 6,
          fontFamily: 'Inter, sans-serif', fontSize: 15, fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '0.03em',
          transition: 'background 0.15s',
        }}
      >
        {loading ? (
          <span>{LOADING_MESSAGES[loadingMsg]}</span>
        ) : (
          <span>Generate Bible Study →</span>
        )}
      </button>

      <p style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'var(--ink-light)', marginTop: 12, lineHeight: 1.5 }}>
        Follows broad ecumenical consensus · Verify all references · Read with your Bible open
      </p>
    </div>
  )
}
