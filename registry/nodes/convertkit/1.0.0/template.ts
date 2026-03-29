export default async function (ctx) {
  const apiSecret = ctx.env.CONVERTKIT_API_SECRET
  const action = ctx.config.action
  const baseUrl = 'https://api.convertkit.com/v3'

  async function ckRequest(method: string, path: string, body?: Record<string, unknown>) {
    const payload = { ...body, api_secret: apiSecret }
    const opts: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    }
    if (method !== 'GET' && method !== 'DELETE') {
      opts.body = JSON.stringify(payload)
    }
    const url =
      method === 'GET'
        ? `${baseUrl}${path}?api_secret=${encodeURIComponent(apiSecret)}`
        : `${baseUrl}${path}`
    const response = await fetch(url, opts)
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(`ConvertKit API error: ${data.message ?? response.statusText}`)
    }
    return data
  }

  switch (action) {
    case 'Add Subscriber': {
      const body: Record<string, unknown> = { email: ctx.config.email }
      if (ctx.config.firstName) body.first_name = ctx.config.firstName
      const data = await ckRequest('POST', '/subscribers', body)
      const subscriber = data.subscriber as { id: number } | undefined
      return { id: String(subscriber?.id ?? ''), data }
    }

    case 'Tag Subscriber': {
      const data = await ckRequest('POST', `/tags/${ctx.config.tagId}/subscribe`, {
        email: ctx.config.email,
      })
      const subscription = data.subscription as { subscriber: { id: number } } | undefined
      return { id: String(subscription?.subscriber?.id ?? ''), data }
    }

    case 'List Subscribers': {
      const data = await ckRequest('GET', '/subscribers')
      return { id: '', data }
    }

    case 'Remove Tag': {
      const data = await ckRequest('POST', `/tags/${ctx.config.tagId}/unsubscribe`, {
        email: ctx.config.email,
      })
      return { id: '', data }
    }

    case 'Add to Sequence': {
      const data = await ckRequest('POST', `/sequences/${ctx.config.sequenceId}/subscribe`, {
        email: ctx.config.email,
      })
      const subscription = data.subscription as { subscriber: { id: number } } | undefined
      return { id: String(subscription?.subscriber?.id ?? ''), data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
