export default async function (ctx) {
  const apiKey = ctx.env.OPENAI_API_KEY
  const action = ctx.config.action

  async function openaiRequest(path: string, body: Record<string, unknown>) {
    const response = await fetch(`https://api.openai.com/v1${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const err = data.error as { message?: string } | undefined
      throw new Error(`OpenAI API error: ${err?.message ?? response.statusText}`)
    }
    return data
  }

  switch (action) {
    case 'Chat Completion': {
      const messages: Array<{ role: string; content: string }> = []
      if (ctx.config.systemPrompt) {
        messages.push({ role: 'system', content: ctx.config.systemPrompt })
      }
      messages.push({ role: 'user', content: ctx.config.userMessage })
      const body: Record<string, unknown> = {
        model: ctx.config.model ?? 'gpt-4o',
        messages,
      }
      if (ctx.config.temperature != null) body.temperature = ctx.config.temperature
      if (ctx.config.maxTokens) body.max_completion_tokens = ctx.config.maxTokens
      const data = await openaiRequest('/chat/completions', body)
      const choices = data.choices as Array<{ message: { content: string } }>
      return { result: choices[0].message.content, usage: data.usage, data }
    }

    case 'Create Embedding': {
      const data = await openaiRequest('/embeddings', {
        model: 'text-embedding-3-small',
        input: ctx.config.input,
      })
      const embeddingData = data.data as Array<{ embedding: number[] }>
      return { result: embeddingData[0].embedding, usage: data.usage, data }
    }

    case 'Create Image': {
      const data = await openaiRequest('/images/generations', {
        model: 'dall-e-3',
        prompt: ctx.config.imagePrompt,
        n: 1,
        size: ctx.config.size ?? '1024x1024',
      })
      const images = data.data as Array<{ url: string }>
      return { result: images[0].url, usage: null, data }
    }

    case 'Moderate Content': {
      const data = await openaiRequest('/moderations', {
        input: ctx.config.moderationInput,
      })
      const results = data.results as Array<{
        flagged: boolean
        categories: Record<string, boolean>
      }>
      return { result: results[0].flagged ? 'flagged' : 'clean', usage: null, data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
