export default async function (ctx) {
  const apiKey = ctx.env.ANTHROPIC_API_KEY
  const action = ctx.config.action

  async function anthropicRequest(body: Record<string, unknown>) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
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
        model: ctx.config.model ?? 'claude-sonnet-4-20250514',
        max_tokens: ctx.config.maxTokens ?? 1024,
        messages: [{ role: 'user', content: ctx.config.userMessage }],
      }
      if (ctx.config.systemPrompt) body.system = ctx.config.systemPrompt
      if (ctx.config.temperature != null) body.temperature = ctx.config.temperature
      const data = await anthropicRequest(body)
      const content = data.content as Array<{ type: string; text: string }>
      const textBlock = content.find((c) => c.type === 'text')
      return { result: textBlock?.text ?? '', usage: data.usage, data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
