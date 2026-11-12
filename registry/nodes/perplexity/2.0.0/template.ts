export default async function (ctx) {
  const apiKey = ctx.env.PERPLEXITY_API_KEY
  const action = ctx.config.action

  async function agentRequest(body: Record<string, unknown>) {
    const response = await fetch('https://api.perplexity.ai/v1/agent', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const error = data.error as { message?: string } | undefined
      throw new Error(`Perplexity API error: ${error?.message ?? response.statusText}`)
    }
    return data
  }

  function answer(data: Record<string, unknown>): string {
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

  function citations(data: Record<string, unknown>): string[] {
    const output = data.output as
      Array<{ type?: string; results?: Array<{ url?: string }> }> | undefined
    if (!Array.isArray(output)) return []
    return output
      .filter((item) => item.type === 'search_results')
      .flatMap((item) => item.results ?? [])
      .map((result) => result.url)
      .filter((url): url is string => typeof url === 'string')
  }

  switch (action) {
    case 'Agent Request': {
      const body: Record<string, unknown> = {
        effort: ctx.config.effort ?? 'fast',
        input: ctx.config.prompt,
      }
      if (ctx.config.systemPrompt) body.instructions = ctx.config.systemPrompt
      if (ctx.config.temperature != null) body.temperature = ctx.config.temperature
      if (ctx.config.maxTokens) body.max_output_tokens = ctx.config.maxTokens
      const data = await agentRequest(body)
      return { text: answer(data), citations: citations(data), data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
