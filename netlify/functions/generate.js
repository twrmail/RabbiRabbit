const https = require('https')

// Book name to HelloAO book ID mapping
const BOOK_MAP = {
  'genesis':'GEN','exodus':'EXO','leviticus':'LEV','numbers':'NUM',
  'deuteronomy':'DEUT','joshua':'JOSH','judges':'JUDG','ruth':'RUTH',
  '1 samuel':'1SAM','2 samuel':'2SAM','1 kings':'1KGS','2 kings':'2KGS',
  '1 chronicles':'1CHR','2 chronicles':'2CHR','ezra':'EZRA','nehemiah':'NEH',
  'esther':'ESTH','job':'JOB','psalms':'PS','psalm':'PS','proverbs':'PROV',
  'ecclesiastes':'ECCL','song of solomon':'SONG','song of songs':'SONG',
  'isaiah':'ISA','jeremiah':'JER','lamentations':'LAM','ezekiel':'EZEK',
  'daniel':'DAN','hosea':'HOS','joel':'JOEL','amos':'AMOS','obadiah':'OBAD',
  'jonah':'JONAH','micah':'MIC','nahum':'NAH','habakkuk':'HAB',
  'zephaniah':'ZEPH','haggai':'HAG','zechariah':'ZECH','malachi':'MAL',
  'matthew':'MAT','mark':'MRK','luke':'LUK','john':'JHN','acts':'ACTS',
  'romans':'ROM','1 corinthians':'1COR','2 corinthians':'2COR',
  'galatians':'GAL','ephesians':'EPH','philippians':'PHIL','colossians':'COL',
  '1 thessalonians':'1THESS','2 thessalonians':'2THESS',
  '1 timothy':'1TIM','2 timothy':'2TIM','titus':'TIT','philemon':'PHLM',
  'hebrews':'HEB','james':'JAS','1 peter':'1PET','2 peter':'2PET',
  '1 john':'1JHN','2 john':'2JHN','3 john':'3JHN','jude':'JUDE',
  'revelation':'REV'
}

// Second commentary by study type
const SECONDARY_COMMENTARY = {
  passage: 'JFB',      // Jamieson-Fausset-Brown â€” cross-reference rich, feeds rabbit trails
  word: 'Clarke',      // Adam Clarke â€” Hebrew/Greek depth
  character: 'Barnes', // Barnes â€” narrative clarity
  topical: null,       // MHC alone is sufficient
  book: 'JFB',         // JFB â€” survey and context
}

const COMMENTARY_LABELS = {
  MHC: "Matthew Henry's Concise Commentary (1706)",
  JFB: "Jamieson-Fausset-Brown Commentary (1871)",
  Clarke: "Adam Clarke's Commentary (1826)",
  Barnes: "Barnes' Notes on the Bible (1834)",
}

function fetchUrl(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 7000 }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch { resolve(null) }
      })
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
  })
}

function parsePassage(passageStr) {
  if (!passageStr) return null
  const match = passageStr.match(/^([1-3]?\s*[a-zA-Z\s]+?)\s*(\d+)/i)
  if (!match) return null
  const bookName = match[1].trim().toLowerCase()
  const chapter = parseInt(match[2])
  const bookId = BOOK_MAP[bookName]
  if (!bookId || !chapter) return null
  return { bookId, chapter }
}

async function fetchCommentary(commentaryId, bookId, chapter) {
  const url = `https://bible.helloao.org/api/${commentaryId}/${bookId}/${chapter}/commentary.json`
  const data = await fetchUrl(url)
  if (!data) return null

  let text = ''
  if (data.introduction) text += data.introduction + '\n\n'
  if (data.text) {
    text = data.text
  } else if (data.verses) {
    const keys = Object.keys(data.verses).slice(0, 12)
    for (const key of keys) {
      const v = data.verses[key]
      if (v?.text) text += v.text + '\n\n'
    }
  }
  return text ? text.slice(0, 800).trim() : null
}

function callAnthropicAPI(apiKey, prompt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1800,
      messages: [{ role: 'user', content: prompt }]
    })
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      timeout: 20000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (parsed.content?.[0]?.text) resolve(parsed.content[0].text)
          else reject(new Error(parsed.error?.message || 'No content returned'))
        } catch (e) {
          reject(new Error('Failed to parse API response'))
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('API request timed out')) })
    req.write(payload)
    req.end()
  })
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

  try {
    const { prompt, passage, studyType } = JSON.parse(event.body || '{}')

    if (!prompt) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing prompt' }) }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) }
    }

    // Fetch commentaries in parallel if we have a passage
    let scholarlyBackbone = ''
    const parsed = parsePassage(passage)

    if (parsed) {
      const { bookId, chapter } = parsed
      const secondaryId = SECONDARY_COMMENTARY[studyType] || null

      // Fetch both commentaries simultaneously
      const [mhcText, secondaryText] = await Promise.all([
        fetchCommentary('MHC', bookId, chapter),
        secondaryId ? fetchCommentary(secondaryId, bookId, chapter) : Promise.resolve(null)
      ])

      if (mhcText) {
        scholarlyBackbone += `\n\n--- ${COMMENTARY_LABELS['MHC']} ---\n${mhcText}`
      }
      if (secondaryText && secondaryId) {
        scholarlyBackbone += `\n\n--- ${COMMENTARY_LABELS[secondaryId]} ---\n${secondaryText}`
      }
    }

    // Build enhanced prompt
    let enhancedPrompt = prompt
    if (scholarlyBackbone) {
      enhancedPrompt = `${prompt}

SCHOLARLY SOURCES â€” Public domain commentaries on this passage:
${scholarlyBackbone}

SYNTHESIS INSTRUCTIONS:
- Draw on these sources as your scholarly foundation
- Blend their insights â€” Henry's pastoral warmth, JFB's cross-reference depth, Clarke's language precision, Barnes' clarity â€” whichever are present
- Modernize the language entirely â€” no archaic phrasing
- The rabbit trail connections should emerge from what these scholars noticed
- The rabbi road should show what the detour reveals that a straight reading misses
- Do not attribute quotes to specific commentators by name in the output
- Produce a unified RabbiRabbit study voice, not a commentary survey`
    }

    const content = await callAnthropicAPI(apiKey, enhancedPrompt)
    return { statusCode: 200, headers, body: JSON.stringify({ content }) }

  } catch (err) {
    console.error('Function error:', err.message)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Internal error â€” please try again' })
    }
  }
}
