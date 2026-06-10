const https = require('https')

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

const SECONDARY = {
  passage: 'JFB', book: 'JFB',
  word: 'Clarke', character: 'Barnes', topical: null
}

function fetchUrl(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 5000 }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve(null) } })
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
  })
}

function parsePassage(str) {
  if (!str) return null
  const match = str.match(/^([1-3]?\s*[a-zA-Z\s]+?)\s*(\d+)/i)
  if (!match) return null
  const bookId = BOOK_MAP[match[1].trim().toLowerCase()]
  const chapter = parseInt(match[2])
  return bookId && chapter ? { bookId, chapter } : null
}

async function fetchCommentary(id, bookId, chapter) {
  const url = `https://bible.helloao.org/api/${id}/${bookId}/${chapter}/commentary.json`
  const data = await fetchUrl(url)
  if (!data) return null
  let text = ''
  if (data.introduction) text += data.introduction + '\n\n'
  if (data.text) text = data.text
  else if (data.verses) {
    const keys = Object.keys(data.verses).slice(0, 8)
    for (const k of keys) {
      if (data.verses[k]?.text) text += data.verses[k].text + '\n\n'
    }
  }
  return text ? text.slice(0, 900).trim() : null
}

function buildPrompt(params, commentary) {
  const { studyType, primaryInput, additionalVerses, character,
          theme, audience, translation, sections, notes } = params

  const audienceMap = {
    beginner:'New Believers', general:'General Adult',
    deeper:'Deeper Study', small_group:'Small Group', youth:'Youth (teens)'
  }
  const typeMap = {
    passage:'Passage Study', character:'Character Study',
    word:'Word Study', topical:'Topical Study', book:'Book Overview'
  }
  const transMap = {
    web:'World English Bible (WEB)',
    kjv:'King James Version (KJV)',
    asv:'American Standard Version (ASV)'
  }
  const sectionMap = {
    context:'Historical & Cultural Context',
    original_language:'Original Language Notes (Hebrew/Greek)',
    cross_references:'Cross-References',
    application:'Life Application',
    discussion:'Discussion Questions',
    prayer:'Closing Prayer Points'
  }

  const sectionList = (sections || []).map(s => sectionMap[s]).filter(Boolean).join(', ')

  let prompt = `You are a scholarly Bible study author for RabbiRabbit. Voice: learned but warmly accessible, ecumenical, no denominational bias. Follow broad scholarly consensus. Never invent details.

STUDY: ${typeMap[studyType] || 'Passage Study'} | SUBJECT: ${primaryInput}
AUDIENCE: ${audienceMap[audience] || 'General Adult'} | TRANSLATION: ${transMap[translation] || 'World English Bible (WEB)'}
${character ? `CHARACTER FOCUS: ${character}` : ''}${theme ? ` | THEME: ${theme}` : ''}
${additionalVerses ? `SUPPORTING VERSES: ${additionalVerses}` : ''}
${sectionList ? `SECTIONS: ${sectionList}` : ''}
${notes ? `AUTHOR NOTES: ${notes}` : ''}

FORMAT: # title, ## sections, ### sub-labels (uppercase), **bold** key terms and verse refs, *italic* original language terms, bullet lists where natural, flowing prose throughout.

REQUIRED â€” include all three:
## ðŸ‡ Rabbit Trail â€” follow a genuine cross-reference to an unexpected illuminating passage. Earn the detour.
## ðŸ• Rabbi Road â€” bring the reader back showing what the trail revealed that a straight reading missed.
## ðŸ‡ What's Over the Hill â€” one short paragraph gesturing to where this study leads next.

Start directly with the # title.`

  if (commentary) {
    prompt += `\n\nSCHOLARLY BACKBONE (blend, modernize, do not name in output):\n${commentary}`
  }

  return prompt
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

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'API key not configured' })
      }
    }

    const body = JSON.parse(event.body || '{}')
    const { studyType, primaryInput } = body

    // Fetch commentary backbone in parallel
    let commentary = ''
    const parsed = parsePassage(primaryInput)
    if (parsed) {
      const { bookId, chapter } = parsed
      const secondaryId = SECONDARY[studyType] || null
      const [mhc, secondary] = await Promise.all([
        fetchCommentary('MHC', bookId, chapter),
        secondaryId ? fetchCommentary(secondaryId, bookId, chapter) : Promise.resolve(null)
      ])
      if (mhc) commentary += `Matthew Henry:\n${mhc}\n\n`
      if (secondary) commentary += `${secondaryId}:\n${secondary}`
    }

    const prompt = buildPrompt(body, commentary || null)

    // Stream from Anthropic
    const payload = JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 2000,
      stream: true,
      messages: [{ role: 'user', content: prompt }]
    })

    // Return a streaming response
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        }
      }

      const chunks = []
      const req = https.request(options, (res) => {
        let buffer = ''

        res.on('data', (chunk) => {
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop()

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data)
                if (parsed.type === 'content_block_delta' &&
                    parsed.delta?.type === 'text_delta') {
                  chunks.push(parsed.delta.text)
                }
              } catch (e) { /* skip malformed */ }
            }
          }
        })

        res.on('end', () => {
          const content = chunks.join('')
          if (!content) {
            resolve({
              statusCode: 500,
              headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
              body: JSON.stringify({ error: 'No content generated' })
            })
            return
          }
          resolve({
            statusCode: 200,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Content-Type': 'text/plain; charset=utf-8',
              'X-Content-Type-Options': 'nosniff',
              'Transfer-Encoding': 'chunked'
            },
            body: content
          })
        })

        res.on('error', (err) => {
          resolve({
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: err.message })
          })
        })
      })

      req.on('error', (err) => {
        resolve({
          statusCode: 500,
          headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: err.message })
        })
      })

      req.write(payload)
      req.end()
    })

  } catch (err) {
    console.error('Error:', err.message)
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Internal error' })
    }
  }
}
