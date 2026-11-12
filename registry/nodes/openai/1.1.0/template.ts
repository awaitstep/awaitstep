export default async function (ctx) {
  const apiKey = ctx.env.OPENAI_API_KEY
  const action = ctx.config.action

  async function openaiRequest(
    path: string,
    body: Record<string, unknown> | undefined,
    method = 'POST',
  ) {
    const response = await fetch(`https://api.openai.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const err = data.error as { message?: string } | undefined
      throw new Error(`OpenAI API error: ${err?.message ?? response.statusText}`)
    }
    return data
  }

  function responseText(data: Record<string, unknown>): string {
    const output = data.output as
      Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> | undefined
    if (!Array.isArray(output)) return ''
    return output
      .filter((item) => item.type === 'message')
      .flatMap((item) => item.content ?? [])
      .filter((item) => item.type === 'output_text')
      .map((item) => item.text ?? '')
      .join('')
  }

  switch (action) {
    case 'Chat Completion': {
      const messages: Array<{ role: string; content: string }> = []
      if (ctx.config.systemPrompt) {
        messages.push({ role: 'system', content: String(ctx.config.systemPrompt) })
      }
      messages.push({ role: 'user', content: String(ctx.config.userMessage ?? '') })
      const body: Record<string, unknown> = {
        model: ctx.config.model ?? 'gpt-6.1-sol',
        messages,
      }
      if (ctx.config.temperature != null) body.temperature = ctx.config.temperature
      if (ctx.config.maxTokens) body.max_completion_tokens = ctx.config.maxTokens
      const data = await openaiRequest('/chat/completions', body)
      const choices = data.choices as Array<{ message: { content: string } }> | undefined
      return { result: choices?.[0]?.message?.content ?? '', usage: data.usage, data }
    }

    case 'Create Response': {
      const body: Record<string, unknown> = {
        model: ctx.config.model ?? 'gpt-6.1-sol',
        input: String(ctx.config.userMessage ?? ''),
      }
      if (ctx.config.systemPrompt) body.instructions = ctx.config.systemPrompt
      const data = await openaiRequest('/responses', body)
      return { result: responseText(data), usage: data.usage ?? null, data }
    }

    case 'Create Embedding': {
      const data = await openaiRequest('/embeddings', {
        model: 'text-embedding-3-small',
        input: ctx.config.input,
      })
      const embeddingData = data.data as Array<{ embedding: number[] }> | undefined
      return {
        result: JSON.stringify(embeddingData?.[0]?.embedding ?? []),
        usage: data.usage,
        data,
      }
    }

    case 'Create Image': {
      const data = await openaiRequest('/images/generations', {
        model: ctx.config.imageModel ?? 'gpt-image-2.6-flare',
        prompt: ctx.config.imagePrompt,
        n: 1,
        size: ctx.config.size ?? '1024x1024',
      })
      const images = data.data as Array<{ url?: string; b64_json?: string }> | undefined
      return { result: images?.[0]?.url ?? images?.[0]?.b64_json ?? '', usage: null, data }
    }

    case 'Moderate Content': {
      const data = await openaiRequest('/moderations', {
        model: 'omni-moderation-latest',
        input: ctx.config.moderationInput,
      })
      const results = data.results as Array<{
        flagged: boolean
        categories: Record<string, boolean>
      }>
      return { result: results[0]?.flagged ? 'flagged' : 'clean', usage: null, data }
    }

    case 'List Models': {
      const data = await openaiRequest('/models', undefined, 'GET')
      return { result: '', usage: null, data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
