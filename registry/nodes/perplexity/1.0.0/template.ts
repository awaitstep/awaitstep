export default async function (ctx) {
  const apiKey = ctx.env.PERPLEXITY_API_KEY
  const action = ctx.config.action

  async function perplexityRequest(body: Record<string, unknown>) {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
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
      throw new Error(`Perplexity API error: ${err?.message ?? response.statusText}`)
    }
    return data
  }

  switch (action) {
    case 'Chat Completion': {
      const messages: Array<{ role: string; content: string }> = []
      if (ctx.config.systemPrompt) {
        messages.push({ role: 'system', content: ctx.config.systemPrompt })
      }
      messages.push({ role: 'user', content: ctx.config.prompt })
      const body: Record<string, unknown> = {
        model: ctx.config.model ?? 'sonar',
        messages,
      }
      if (ctx.config.temperature != null) body.temperature = ctx.config.temperature
      if (ctx.config.maxTokens) body.max_tokens = ctx.config.maxTokens
      const data = await perplexityRequest(body)
      const choices = data.choices as Array<{ message: { content: string } }> | undefined
      const citations = data.citations as string[] | undefined
      return { text: choices?.[0]?.message?.content ?? '', citations: citations ?? [], data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
