const AUDIENCE_LABELS = {
  beginner: 'New Believers',
  general: 'General Adult',
  deeper: 'Deeper Study',
  small_group: 'Small Group',
  youth: 'Youth (teens)',
}

const TYPE_LABELS = {
  passage: 'Passage Study',
  character: 'Character Study',
  word: 'Word Study',
  topical: 'Topical Study',
  book: 'Book Overview',
}

const TRANSLATION_NAMES = {
  web: 'World English Bible (WEB)',
  kjv: 'King James Version (KJV)',
  asv: 'American Standard Version (ASV)',
}

const SECTION_LABELS = {
  context: 'Historical & Cultural Context',
  original_language: 'Original Language Notes (Hebrew/Greek)',
  cross_references: 'Cross-References',
  application: 'Life Application',
  discussion: 'Discussion Questions',
  prayer: 'Closing Prayer Points',
}

function buildPrompt({ studyType, primaryInput, additionalVerses, character, theme, audience, translation, sections, notes }) {
  const audienceLabel = AUDIENCE_LABELS[audience] || 'General Adult'
  const typeLabel = TYPE_LABELS[studyType] || 'Passage Study'
  const translationName = TRANSLATION_NAMES[translation] || 'World English Bible'
  const sectionList = sections.map(s => SECTION_LABELS[s]).filter(Boolean).join(', ')

  return `You are a scholarly Bible study author for RabbiRabbit. Voice: learned but accessible, ecumenical, no denominational bias. Never invent details. Follow broad scholarly consensus.

STUDY: ${typeLabel} | SUBJECT: ${primaryInput} | AUDIENCE: ${audienceLabel} | TRANSLATION: ${translationName}
${character ? `CHARACTER: ${character}` : ''}${theme ? ` | THEME: ${theme}` : ''}
${additionalVerses ? `SUPPORTING VERSES: ${additionalVerses}` : ''}
${sectionList ? `SECTIONS: ${sectionList}` : ''}
${notes ? `NOTES: ${notes}` : ''}

FORMAT:
- # Study title
- ## Section headings
- ### Sub-labels
- **bold** key terms and verse refs, *italic* original language terms
- Bullet points for lists

REQUIRED â€” include these exactly:
- One ## ðŸ‡ Rabbit Trail section: follow a genuine cross-reference connection to an unexpected but illuminating related passage
- One ## ðŸ• Rabbi Road section immediately after: bring the reader back to the original text showing what the trail revealed
- End with ## ðŸ‡ What's Over the Hill: one short paragraph gesturing to where this study leads next

Keep the study focused and complete but concise â€” aim for quality over length. Start directly with the # title, no preamble.`
}

export async function generateStudy(params) {
  const prompt = buildPrompt(params)

  const response = await fetch('/.netlify/functions/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || `Request failed (${response.status})`)
  }

  const data = await response.json()
  if (!data.content) throw new Error('No content returned from API')
  return data.content
}
