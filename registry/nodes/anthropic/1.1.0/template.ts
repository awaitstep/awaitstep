export default async function (ctx) {
  const apiKey = ctx.env.ANTHROPIC_API_KEY
  const action = ctx.config.action

  async function anthropicRequest(path: string, body: Record<string, unknown>) {
    const response = await fetch(`https://api.anthropic.com${path}`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const err = data.error as { message?: string } | undefined
      throw new Error(`Anthropic API error: ${err?.message ?? response.statusText}`)
    }
    return data
  }

  switch (action) {
    case 'Chat Completion': {
      const body: Record<string, unknown> = {
        model: ctx.config.model ?? 'claude-sonnet-5-5',
        max_tokens: ctx.config.maxTokens ?? 1024,
        messages: [{ role: 'user', content: ctx.config.userMessage }],
      }
      if (ctx.config.systemPrompt) body.system = ctx.config.systemPrompt
      if (ctx.config.temperature != null) body.temperature = ctx.config.temperature
      const data = await anthropicRequest('/v1/messages', body)
      const content = data.content as Array<{ type: string; text?: string }> | undefined
      const textBlock = content?.find((block) => block.type === 'text')
      return { result: textBlock?.text ?? '', usage: data.usage, data }
    }

    case 'Count Tokens': {
      const data = await anthropicRequest('/v1/messages/count_tokens', {
        model: ctx.config.model ?? 'claude-sonnet-5-5',
        messages: [{ role: 'user', content: ctx.config.userMessage }],
      })
      return { result: String(data.input_tokens ?? ''), usage: data.usage ?? null, data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
