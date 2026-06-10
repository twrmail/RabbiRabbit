exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  }

  try {
    const { prompt } = JSON.parse(event.body || '{}')
    if (!prompt) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing prompt' }) }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) }
    }

    // Use a concise but complete prompt to stay within timeout
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Anthropic API error:', response.status, errText)
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: `API error: ${response.status} — ${errText}` }),
      }
    }

    const data = await response.json()
    const content = data.content
      ?.filter(b => b.type === 'text')
      ?.map(b => b.text)
      ?.join('') || ''

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ content }),
    }
  } catch (err) {
    console.error('Function error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal error — please try again' }),
    }
  }
}    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Anthropic API error:', response.status, errText)
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: `API error: ${response.status} â€” ${errText}` }),
      }
    }

    const data = await response.json()
    const content = data.content
      ?.filter(b => b.type === 'text')
      ?.map(b => b.text)
      ?.join('') || ''

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ content }),
    }
  } catch (err) {
    console.error('Function error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal error â€” please try again' }),
    }
  }
}
