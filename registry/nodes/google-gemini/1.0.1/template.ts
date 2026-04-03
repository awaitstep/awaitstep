export default async function (ctx) {
  const apiKey = ctx.env.GOOGLE_GEMINI_API_KEY
  const action = ctx.config.action
  const model = ctx.config.model ?? 'gemini-2.5-flash-lite'
  const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}`

  async function geminiRequest(endpoint: string, body: Record<string, unknown>) {
    const response = await fetch(`${baseUrl}${endpoint}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const err = data.error as { message?: string } | undefined
      throw new Error(`Google Gemini API error: ${err?.message ?? response.statusText}`)
    }
    return data
  }

  function buildGenerationConfig() {
    const config: Record<string, unknown> = {}
    if (ctx.config.temperature != null) config.temperature = ctx.config.temperature
    if (ctx.config.maxOutputTokens) config.maxOutputTokens = ctx.config.maxOutputTokens
    return Object.keys(config).length > 0 ? config : undefined
  }

  function extractText(data: Record<string, unknown>): string {
    const candidates = data.candidates as Array<{
      content: { parts: Array<{ text: string }> }
    }>
    return candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  }

  switch (action) {
    case 'Generate Content': {
      const body: Record<string, unknown> = {
        contents: [{ parts: [{ text: ctx.config.prompt }] }],
      }
      if (ctx.config.systemInstruction) {
        body.systemInstruction = { parts: [{ text: ctx.config.systemInstruction }] }
      }
      const generationConfig = buildGenerationConfig()
      if (generationConfig) body.generationConfig = generationConfig
      const data = await geminiRequest(':generateContent', body)
      return { text: extractText(data), data }
    }

    case 'Generate JSON': {
      const body: Record<string, unknown> = {
        contents: [{ parts: [{ text: ctx.config.prompt }] }],
        generationConfig: {
          ...buildGenerationConfig(),
          responseMimeType: 'application/json',
        },
      }
      if (ctx.config.jsonSchema) {
        try {
          const schema = JSON.parse(ctx.config.jsonSchema)
          body.generationConfig = {
            ...(body.generationConfig as Record<string, unknown>),
            responseSchema: schema,
          }
        } catch {
          throw new Error('Invalid JSON Schema — must be valid JSON')
        }
      }
      if (ctx.config.systemInstruction) {
        body.systemInstruction = { parts: [{ text: ctx.config.systemInstruction }] }
      }
      const data = await geminiRequest(':generateContent', body)
      return { text: extractText(data), data }
    }

    case 'Embed Text': {
      const data = await geminiRequest(':embedContent', {
        content: { parts: [{ text: ctx.config.prompt }] },
      })
      const embedding = data.embedding as { values: number[] }
      return { text: JSON.stringify(embedding.values), data }
    }

    case 'Search Web': {
      const body: Record<string, unknown> = {
        contents: [{ parts: [{ text: ctx.config.prompt }] }],
        tools: [{ googleSearch: {} }],
      }
      if (ctx.config.systemInstruction) {
        body.systemInstruction = { parts: [{ text: ctx.config.systemInstruction }] }
      }
      const generationConfig = buildGenerationConfig()
      if (generationConfig) body.generationConfig = generationConfig
      const data = await geminiRequest(':generateContent', body)
      return { text: extractText(data), data }
    }

    case 'Count Tokens': {
      const data = await geminiRequest(':countTokens', {
        contents: [{ parts: [{ text: ctx.config.prompt }] }],
      })
      const totalTokens = data.totalTokens as number
      return { text: String(totalTokens), data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
