import { useState } from 'react'
import { generateStudy } from '../lib/generateStudy'
import FontSizeToggle from './FontSizeToggle'

// ── Data ────────────────────────────────────────────────────────

const STUDY_TYPES = [
  { value: 'passage',   label: 'Passage Study',   desc: 'Verse-by-verse through a text' },
  { value: 'character', label: 'Character Study',  desc: 'Deep dive into a biblical figure' },
  { value: 'word',      label: 'Word Study',       desc: 'Trace a key term through Scripture' },
  { value: 'topical',   label: 'Topical Study',    desc: 'Explore a theme across the canon' },
  { value: 'book',      label: 'Book Overview',    desc: 'Survey an entire biblical book' },
]

const AUDIENCE = [
  { value: 'beginner',    label: 'New Believers' },
  { value: 'general',     label: 'General Adult' },
  { value: 'deeper',      label: 'Deeper Study' },
  { value: 'small_group', label: 'Small Group' },
  { value: 'youth',       label: 'Youth' },
]

const TRANSLATIONS = [
  { value: 'web', label: 'WEB', full: 'World English Bible (default)' },
  { value: 'bsb', label: 'BSB', full: 'Berean Study Bible (2023) — public domain' },
  { value: 'kjv', label: 'KJV', full: 'King James Version' },
  { value: 'asv', label: 'ASV', full: 'American Standard Version' },
]

const SECTIONS = [
  { value: 'context',           label: 'Historical Context' },
  { value: 'original_language', label: 'Original Language' },
  { value: 'cross_references',  label: 'Cross-References' },
  { value: 'application',       label: 'Life Application' },
  { value: 'discussion',        label: 'Discussion Questions' },
  { value: 'prayer',            label: 'Prayer Points' },
]

const PLACEHOLDERS = {
  passage:   'e.g. Romans 8:1-17, John 3:1-21, Psalm 23',
  character: 'e.g. Ruth, Paul, Mary Magdalene, Elijah',
  word:      'e.g. Shalom, Agape, Covenant, Righteousness',
  topical:   'e.g. Forgiveness, Hope, Suffering, Grace',
  book:      'e.g. Jonah, Philippians, Ruth',
}

const PRIMARY_LABELS = {
  passage:   'Scripture Passage(s)',
  character: 'Biblical Character',
  word:      'Key Word or Term',
  topical:   'Topic or Theme',
  book:      'Biblical Book',
}

const LOADING_MESSAGES = [
  'Opening the scroll…',
  'Following the trail…',
  'Consulting the scholars…',
  'Tracing the connections…',
  'Finding the way back…',
]

// ── Shared primitives ────────────────────────────────────────────

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
    onBlur:  e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none' },
  }
  return multiline
    ? <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows} style={style} {...handlers} />
    : <input    value={value} onChange={onChange} placeholder={placeholder} style={style} {...handlers} />
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

// ── Commentaries dropdown ────────────────────────────────────────

function CommentariesPanel() {
  const [open, setOpen] = useState(false)
  return (
    <div style={{
      border: '1.5px solid var(--border)', borderRadius: 10,
      marginBottom: 24, overflow: 'hidden', background: 'var(--white)',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', padding: '13px 16px',
          background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 6,
            background: 'var(--gold-pale)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}>📚</div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
              Commentaries and translations
            </div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'var(--ink-light)' }}>
              The sources behind every study
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: 'Inter, sans-serif', fontSize: 11,
            background: 'var(--gold)', color: 'var(--white)',
            borderRadius: 20, padding: '2px 8px', fontWeight: 600,
          }}>11 sources</span>
          <span style={{
            color: 'var(--ink-light)', fontSize: 18,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s', display: 'inline-block',
          }}>⌄</span>
        </div>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px' }}>

          <SectionLabel>Protestant commentaries — public domain</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6, marginBottom: 14 }}>
            {[
              ['Matthew Henry',         'Concise Commentary, 1706'],
              ['Jamieson-Fausset-Brown', 'JFB Commentary, 1871'],
              ['Adam Clarke',           'Commentary on the Bible, 1826'],
              ["Barnes' Notes",         'Notes on the Bible, 1834'],
              ['John Wesley',           'Explanatory Notes, 1754'],
              ['Scofield Notes',        'Reference Notes, 1917'],
              ['Spurgeon',              'Treasury of David, 1885'],
            ].map(([name, date]) => (
              <div key={name} style={{
                background: 'var(--parchment, #faf8f2)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '7px 10px',
              }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{name}</div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'var(--ink-light)' }}>{date}</div>
              </div>
            ))}
            <div style={{ background: 'var(--parchment, #faf8f2)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', opacity: 0.55 }}>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
                {"Calvin's Commentaries"}
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: 'var(--gold)', marginLeft: 6, fontWeight: 400 }}>coming</span>
              </div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'var(--ink-light)' }}>1844–1856 translation</div>
            </div>
          </div>

          <SectionLabel>Topical reference — public domain</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6, marginBottom: 14 }}>
            <div style={{ background: 'var(--parchment, #faf8f2)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px' }}>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{"Nave's Topical Bible"}</div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'var(--ink-light)' }}>5,319 topics · 1896</div>
            </div>
          </div>

          <SectionLabel>Church fathers — 4th–13th century</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6, marginBottom: 14 }}>
            {[
              ['Augustine',      '354–430 AD'],
              ['Chrysostom',     '347–407 AD'],
              ['Thomas Aquinas', '1225–1274 AD'],
            ].map(([name, date]) => (
              <div key={name} style={{
                background: 'var(--parchment, #faf8f2)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '7px 10px',
              }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{name}</div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'var(--ink-light)' }}>{date}</div>
              </div>
            ))}
          </div>

          <SectionLabel>Translations</SectionLabel>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {['World English Bible (WEB)', 'King James Version (KJV)', 'American Standard Version (ASV)'].map(t => (
              <span key={t} style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, background: 'var(--parchment, #faf8f2)', border: '1px solid var(--border)', borderRadius: 20, padding: '4px 10px', color: 'var(--ink-light)' }}>{t}</span>
            ))}
          </div>

          <SectionLabel>Cross-references and language tools</SectionLabel>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {['OpenBible.info cross-references', "Strong's Hebrew Lexicon", "Strong's Greek Lexicon"].map(t => (
              <span key={t} style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, background: 'var(--parchment, #faf8f2)', border: '1px solid var(--border)', borderRadius: 20, padding: '4px 10px', color: 'var(--ink-light)' }}>{t}</span>
            ))}
          </div>

          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'var(--ink-light)', fontStyle: 'italic', marginTop: 10, lineHeight: 1.6 }}>
            All commentaries are public domain. RabbiRabbit synthesizes these sources — always verify with your own Bible and study materials.
          </p>
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600,
      letterSpacing: '0.10em', textTransform: 'uppercase',
      color: 'var(--ink-light)', marginBottom: 6, marginTop: 4,
    }}>{children}</div>
  )
}

// ── Morning Trail section ────────────────────────────────────────

const JESUS_SEEDS = [
  'Jesus',
  'The Baptism of Jesus',
  'Jesus in Gethsemane',
  'The Transfiguration of Jesus',
  'Jesus and the children',
  'The Resurrection of Jesus',
  'Jesus and Nicodemus',
  'The Triumphal Entry',
  'Jesus at the Last Supper',
  'Jesus and Mary Magdalene',
  'The Temptation of Jesus',
  'Jesus healing the blind',
  'Jesus and the woman at the well',
  'The Crucifixion of Jesus',
  'Jesus calming the storm',
  'Jesus feeding the five thousand',
  'Jesus and Zacchaeus',
  'Jesus raising Lazarus',
  'Jesus and the prodigal son',
  'Jesus washing the disciples feet',
  'Jesus and the rich young ruler',
  'Jesus in the synagogue at Nazareth',
  'The birth of Jesus',
  'Jesus as a boy in the temple',
  'Jesus and taxes',
  'Jesus and the thief on the cross',
  'Jesus appearing after the resurrection',
  'Jesus and Thomas',
  'Jesus and Peter by the sea',
  'Jesus and the sermon on the mount',
  'Jesus and the good Samaritan',
  'Jesus and the lost sheep',
  'Jesus and the widow of Nain',
  'Jesus and the ten lepers',
  'Jesus and the paralyzed man',
  'Jesus and Legion',
  'Jesus and the fig tree',
  'Jesus and Jairus daughter',
  'Jesus and the vine',
  'Jesus the good shepherd',
]

let seedIndex = Math.floor(Math.random() * JESUS_SEEDS.length)

function getNextSeed() {
  const seed = JESUS_SEEDS[seedIndex]
  seedIndex = (seedIndex + 1) % JESUS_SEEDS.length
  return seed
}

function MorningTrail({ onStream, onStudy, onDone, setError }) {
  const [input, setInput] = useState('')
  const [currentSeed, setCurrentSeed] = useState(() => JESUS_SEEDS[seedIndex])
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState(0)

  const handleMorning = async () => {
    const subject = input.trim() || currentSeed
    setCurrentSeed(getNextSeed())
    setError(null)
    setLoading(true)
    let msgIndex = 0
    const interval = setInterval(() => {
      msgIndex = (msgIndex + 1) % LOADING_MESSAGES.length
      setLoadingMsg(msgIndex)
    }, 2500)
    try {
      const params = {
        studyType: 'devotional',
        primaryInput: subject,
        additionalVerses: '', character: '', theme: '',
        audience: 'general', translation: 'web',
        sections: [], notes: '',
      }
      let started = false
      await generateStudy(params, (text) => {
        if (!started) { started = true; onStream(text) }
        else { onStudy(text) }
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

  return (
    <div style={{
      background: 'var(--navy)', borderRadius: 10,
      padding: '20px 20px 18px', marginBottom: 10,
    }}>
      <div style={{
        fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600,
        letterSpacing: '0.14em', textTransform: 'uppercase',
        color: 'var(--gold)', marginBottom: 6,
      }}>Morning Trail</div>
      <div style={{
        fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 700,
        color: 'var(--white)', marginBottom: 4, lineHeight: 1.2,
      }}>Today's five-minute devotional</div>
      <div style={{
        fontFamily: 'Inter, sans-serif', fontSize: 13,
        color: 'rgba(247,242,232,0.65)', marginBottom: 14, lineHeight: 1.6,
      }}>
        Type anything — a verse, a name, a word. Or tap Go → for today's seed.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleMorning() }}
          placeholder={currentSeed}
          style={{
            flex: 1, height: 40, padding: '0 12px',
            fontFamily: 'Inter, sans-serif', fontSize: 14,
            color: 'var(--ink)', background: 'var(--white)',
            border: '1.5px solid var(--border)', borderRadius: 6, outline: 'none',
          }}
        />
        <button
          onClick={handleMorning}
          disabled={loading}
          style={{
            height: 40, padding: '0 18px',
            background: loading ? 'rgba(196,150,42,0.6)' : 'var(--gold)',
            color: 'var(--white)', border: 'none', borderRadius: 6,
            fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {loading ? LOADING_MESSAGES[loadingMsg] : 'Morning Trail'}
        </button>
      </div>
    </div>
  )
}

// ── Study Builder (collapsible) ──────────────────────────────────

function StudyBuilder({ onStudy, onStream, onDone, error, setError, enlarged, onToggleEnlarge }) {
  const [open, setOpen] = useState(false)
  const [studyType, setStudyType]           = useState('passage')
  const [primaryInput, setPrimaryInput]     = useState('')
  const [additionalVerses, setAdditionalVerses] = useState('')
  const [character, setCharacter]           = useState('')
  const [theme, setTheme]                   = useState('')
  const [audience, setAudience]             = useState('general')
  const [translation, setTranslation]       = useState('web')
  const [sections, setSections]             = useState(['context', 'application', 'discussion'])
  const [notes, setNotes]                   = useState('')
  const [loading, setLoading]               = useState(false)
  const [loadingMsg, setLoadingMsg]         = useState(0)

  const toggleSection = val =>
    setSections(prev => prev.includes(val) ? prev.filter(s => s !== val) : [...prev, val])

  const handleGenerate = async () => {
    if (!primaryInput.trim()) { setError('Please enter a primary subject for the study.'); return }
    setError(null)
    setLoading(true)
    let msgIndex = 0
    const interval = setInterval(() => {
      msgIndex = (msgIndex + 1) % LOADING_MESSAGES.length
      setLoadingMsg(msgIndex)
    }, 2500)
    try {
      const params = { studyType, primaryInput, additionalVerses, character, theme, audience, translation, sections, notes }
      let started = false
      await generateStudy(params, (text) => {
        if (!started) { started = true; onStream(text) }
        else { onStudy(text) }
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

  return (
    <div style={{ border: '1.5px solid var(--border)', borderRadius: 10, background: 'var(--white)', overflow: 'hidden' }}>

      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', padding: '13px 16px',
          background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 6, background: 'var(--gold-pale)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}>📖</div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
              Study Builder
            </div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'var(--ink-light)' }}>
              Passage · Word · Character · Topical · Book Overview
            </div>
          </div>
        </div>
        <span style={{
          color: 'var(--ink-light)', fontSize: 18,
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s', display: 'inline-block',
        }}>⌄</span>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '20px 16px' }}>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <FontSizeToggle enlarged={enlarged} onToggle={onToggleEnlarge} />
          </div>

          <div style={{ marginBottom: 24 }}>
            <Label required>Study type</Label>
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

          <Divider label="Additional inputs" />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <Label>Supporting verses</Label>
              <Input value={additionalVerses} onChange={e => setAdditionalVerses(e.target.value)} placeholder="e.g. Isaiah 53:5, Hebrews 4:15" multiline rows={2} />
            </div>
            <div>
              <Label>Character focus</Label>
              <Input value={character} onChange={e => setCharacter(e.target.value)} placeholder="e.g. Paul, Miriam, Peter" />
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <Label>Thematic emphasis</Label>
            <Input value={theme} onChange={e => setTheme(e.target.value)} placeholder="e.g. redemption, courage in suffering, the kingdom of God" />
          </div>

          <Divider label="Audience, translation & sections" />

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
            <Label>Include sections</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SECTIONS.map(s => <Chip key={s.value} label={s.label} selected={sections.includes(s.value)} onClick={() => toggleSection(s.value)} />)}
            </div>
          </div>

          <div style={{ marginBottom: 26 }}>
            <Label>Notes for the study</Label>
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
            {loading ? LOADING_MESSAGES[loadingMsg] : 'Generate Bible Study →'}
          </button>

          <div style={{
            marginTop: 18, border: '1.5px solid var(--gold)',
            borderRadius: 8, padding: '13px 15px',
            background: 'rgba(196,150,42,0.06)',
          }}>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: 'var(--gold)', marginBottom: 5 }}>
              🛡 The Berean's examined guide
            </div>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'var(--ink-light)', lineHeight: 1.6, margin: 0 }}>
              Every study draws from public domain scholarship: Wesley, Matthew Henry, Clarke, Barnes, JFB, Scofield, Spurgeon, and the Church Fathers. Topical studies draw from Nave's Topical Bible (1896) — 5,319 topics and verse index. Cross-references from OpenBible.info. Original language notes from Strong's Hebrew and Greek lexicons. Translations available: World English Bible (WEB), Berean Study Bible (BSB, public domain 2023), King James Version (KJV), American Standard Version (ASV). RabbiRabbit synthesizes; the commentaries are authoritative. Always verify with your own Bible.
            </p>
          </div>

          <p style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'var(--ink-light)', marginTop: 12, lineHeight: 1.5 }}>
            Follows broad ecumenical consensus · Verify all references · Read with your Bible open
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main export ──────────────────────────────────────────────────

export default function StudyForm({ onStudy, onStream, onDone, error, setError, enlarged, onToggleEnlarge }) {
  return (
    <div>
      <MorningTrail
        onStudy={onStudy}
        onStream={onStream}
        onDone={onDone}
        setError={setError}
      />

      <Divider label="Or build a deeper study" />

      <StudyBuilder
        onStudy={onStudy}
        onStream={onStream}
        onDone={onDone}
        error={error}
        setError={setError}
        enlarged={enlarged}
        onToggleEnlarge={onToggleEnlarge}
      />
    </div>
  )
}
