const https = require('https')

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
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) }
    }

    const { passage } = JSON.parse(event.body || '{}')
    const subject = passage || 'John 3:16'

    // Absolute minimum prompt â€” test only
    const prompt = `Write a short 3-paragraph Bible study on ${subject}. Include one cross-reference. Start with # as the title.`

    const payload = JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }]
    })

    const content = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        timeout: 8000,
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
            else reject(new Error(parsed.error?.message || `API status ${res.statusCode}`))
          } catch (e) {
            reject(new Error('Parse error'))
          }
        })
      })

      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Timed out after 8s')) })
      req.write(payload)
      req.end()
    })

    return { statusCode: 200, headers, body: JSON.stringify({ content }) }

  } catch (err) {
    console.error('Error:', err.message)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    }
  }
}
