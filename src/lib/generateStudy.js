const AUDIENCE_LABELS = {
  beginner: 'New Believers', general: 'General Adult',
  deeper: 'Deeper Study', small_group: 'Small Group', youth: 'Youth (teens)',
}
const TYPE_LABELS = {
  passage: 'Passage Study', character: 'Character Study',
  word: 'Word Study', topical: 'Topical Study', book: 'Book Overview',
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

  return `You are a scholarly Bible study author for RabbiRabbit. Voice: learned but warmly accessible, ecumenical, no denominational bias. Never invent details. Follow broad scholarly consensus.

STUDY: ${typeLabel} | SUBJECT: ${primaryInput} | AUDIENCE: ${audienceLabel} | TRANSLATION: ${translationName}
${character ? `CHARACTER: ${character}` : ''}${theme ? ` | THEME: ${theme}` : ''}
${additionalVerses ? `SUPPORTING VERSES: ${additionalVerses}` : ''}
${sectionList ? `SECTIONS: ${sectionList}` : ''}
${notes ? `NOTES: ${notes}` : ''}

FORMAT: # title, ## sections, ### sub-labels, **bold** key terms and verse refs, *italic* original language terms, bullet lists

REQUIRED STRUCTURE:
- ## ðŸ‡ Rabbit Trail â€” follow a genuine cross-reference connection to an unexpected but illuminating passage; the detour must earn its place
- ## ðŸ• Rabbi Road â€” bring the reader back to the original text showing what the trail revealed that a straight reading would have missed
- ## ðŸ‡ What's Over the Hill â€” one short paragraph gesturing naturally to where this study leads next

Keep focused and complete. Start directly with the # title, no preamble.`
}

function extractPassage(params) {
  if (params.studyType === 'passage' && params.primaryInput) {
    return params.primaryInput
  }
  if (params.studyType === 'book' && params.primaryInput) {
    return params.primaryInput + ' 1' // first chapter for book overviews
  }
  return null
}

export async function generateStudy(params) {
  const prompt = buildPrompt(params)
  const passage = extractPassage(params)

  const response = await fetch('/.netlify/functions/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      passage,
      studyType: params.studyType,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || `Request failed (${response.status})`)
  }

  const data = await response.json()
  if (!data.content) throw new Error('No content returned from API')
  return data.content
}
