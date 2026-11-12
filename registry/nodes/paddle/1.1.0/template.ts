export default async function (ctx) {
  const apiKey = ctx.env.PADDLE_API_KEY
  const action = ctx.config.action
  const baseUrl = ctx.config.sandbox ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com'

  async function paddleRequest(method: string, path: string, body?: Record<string, unknown>) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const error = data.error as { detail?: string } | undefined
      throw new Error(`Paddle API error: ${error?.detail ?? response.statusText}`)
    }
    return data
  }

  function resourceId(data: Record<string, unknown>): string {
    const resource = data.data as { id?: string } | undefined
    return resource?.id ?? ''
  }

  switch (action) {
    case 'List Transactions': {
      const data = await paddleRequest('GET', '/transactions')
      return { id: '', data }
    }

    case 'Get Transaction': {
      const data = await paddleRequest('GET', `/transactions/${ctx.config.transactionId}`)
      return { id: resourceId(data), data }
    }

    case 'List Subscriptions': {
      const data = await paddleRequest('GET', '/subscriptions')
      return { id: '', data }
    }

    case 'Get Customer': {
      const data = await paddleRequest('GET', `/customers/${ctx.config.customerId}`)
      return { id: resourceId(data), data }
    }

    case 'List Products': {
      const data = await paddleRequest('GET', '/products')
      return { id: '', data }
    }

    case 'Create Customer': {
      if (!ctx.config.email) throw new Error('Email is required for Create Customer')
      const body: Record<string, unknown> = { email: ctx.config.email }
      if (ctx.config.name) body.name = ctx.config.name
      const data = await paddleRequest('POST', '/customers', body)
      return { id: resourceId(data), data }
    }

    case 'Create Transaction': {
      if (!ctx.config.priceId) throw new Error('Price ID is required for Create Transaction')
      const body: Record<string, unknown> = {
        items: [{ price_id: ctx.config.priceId, quantity: ctx.config.quantity ?? 1 }],
      }
      if (ctx.config.customerId) body.customer_id = ctx.config.customerId
      const data = await paddleRequest('POST', '/transactions', body)
      return { id: resourceId(data), data }
    }

    case 'Cancel Subscription': {
      if (!ctx.config.subscriptionId) {
        throw new Error('Subscription ID is required for Cancel Subscription')
      }
      const data = await paddleRequest(
        'POST',
        `/subscriptions/${ctx.config.subscriptionId}/cancel`,
        { effective_from: 'immediately' },
      )
      return { id: resourceId(data), data }
    }

    case 'List Customers': {
      const data = await paddleRequest('GET', '/customers')
      return { id: '', data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
