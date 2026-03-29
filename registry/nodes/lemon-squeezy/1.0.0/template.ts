export default async function (ctx) {
  const apiKey = ctx.env.LEMONSQUEEZY_API_KEY
  const action = ctx.config.action
  const baseUrl = 'https://api.lemonsqueezy.com/v1'

  async function lsRequest(method: string, path: string) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
      },
    })
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const errors = data.errors as Array<{ detail?: string }> | undefined
      throw new Error(`Lemon Squeezy API error: ${errors?.[0]?.detail ?? response.statusText}`)
    }
    return data
  }

  switch (action) {
    case 'List Orders': {
      const data = await lsRequest('GET', '/orders')
      return { id: '', data }
    }

    case 'Get Order': {
      const data = await lsRequest('GET', `/orders/${ctx.config.orderId}`)
      const resource = data.data as { id: string } | undefined
      return { id: resource?.id ?? '', data }
    }

    case 'List Customers': {
      const data = await lsRequest('GET', '/customers')
      return { id: '', data }
    }

    case 'Get Customer': {
      const data = await lsRequest('GET', `/customers/${ctx.config.customerId}`)
      const resource = data.data as { id: string } | undefined
      return { id: resource?.id ?? '', data }
    }

    case 'List Subscriptions': {
      const data = await lsRequest('GET', '/subscriptions')
      return { id: '', data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
