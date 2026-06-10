export async function generateStudy(params, onChunk) {
  const response = await fetch('/.netlify/functions/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || `Request failed (${response.status})`)
  }

  // Check if we got plain text (streaming content) or JSON (error)
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const data = await response.json()
    if (data.error) throw new Error(data.error)
    return data.content || ''
  }

  // Stream the text â€” call onChunk as each piece arrives
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    fullText += chunk
    if (onChunk) onChunk(fullText)
  }

  return fullText
}
