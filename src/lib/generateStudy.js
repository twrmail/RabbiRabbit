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

  return `You are a scholarly yet warmly approachable Bible study author writing for the RabbiRabbit study tool. Your voice is learned but never condescending — the "no dumb questions" approach. You follow broad ecumenical consensus on doctrine without denominational distinctives, cite recognized scholarship, and never invent details. All content must be historically and theologically accurate.

STUDY TYPE: ${typeLabel}
PRIMARY SUBJECT: ${primaryInput}
AUDIENCE: ${audienceLabel}
PREFERRED TRANSLATION: ${translationName}
${character ? `CHARACTER FOCUS: ${character}` : ''}
${theme ? `THEMATIC EMPHASIS: ${theme}` : ''}
${additionalVerses ? `SUPPORTING VERSES: ${additionalVerses}` : ''}
${sectionList ? `REQUIRED SECTIONS: ${sectionList}` : ''}
${notes ? `AUTHOR NOTES: ${notes}` : ''}

STRUCTURE REQUIREMENTS:
- Use # for the study title
- Use ## for major sections  
- Use ### for sub-section labels
- Bold key terms and verse references with **text**
- Italicize original language terms with *text*
- Use bullet points for lists

RABBIT TRAIL REQUIREMENTS — this is essential to RabbiRabbit's purpose:
- Include at least one 🐇 Rabbit Trail section that follows a genuine cross-reference connection to an unexpected but related passage or concept
- The trail must open a tangent that genuinely illuminates the subject from an unexpected angle
- Follow every 🐇 Rabbit Trail with a 🕍 Rabbi Road section that brings the reader back to the original text — showing how the detour makes the original richer
- The Rabbi Road must earn its return — the reader should arrive back knowing something they could not have known without the trail
- End the study with a 🐇 What's Over the Hill section gesturing naturally forward to where this study leads next — a passage, theme, or book that continues the thread organically

VOICE REQUIREMENTS:
- Scholarly but accessible — real historical and linguistic depth without requiring expertise
- Ecumenical — usable by Catholic, Orthodox, Protestant, evangelical readers equally
- Where traditions genuinely disagree, acknowledge it briefly and fairly without taking sides
- Where there is broad scholarly consensus, state it with confidence
- Never invent quotations, scholarly attributions, or historical details
- The Berean standard applies: write in a way that invites verification, not dependence

Write the complete study now. Do not begin with "Certainly" or any filler phrase. Start directly with the title.`
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
