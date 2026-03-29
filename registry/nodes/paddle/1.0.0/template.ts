export default async function (ctx) {
  const apiKey = ctx.env.PADDLE_API_KEY
  const action = ctx.config.action
  const baseUrl = ctx.config.sandbox ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com'

  async function paddleRequest(method: string, path: string) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    })
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const error = data.error as { detail?: string } | undefined
      throw new Error(`Paddle API error: ${error?.detail ?? response.statusText}`)
    }
    return data
  }

  switch (action) {
    case 'List Transactions': {
      const data = await paddleRequest('GET', '/transactions')
      return { id: '', data }
    }

    case 'Get Transaction': {
      const data = await paddleRequest('GET', `/transactions/${ctx.config.transactionId}`)
      const resource = data.data as { id: string } | undefined
      return { id: resource?.id ?? '', data }
    }

    case 'List Subscriptions': {
      const data = await paddleRequest('GET', '/subscriptions')
      return { id: '', data }
    }

    case 'Get Customer': {
      const data = await paddleRequest('GET', `/customers/${ctx.config.customerId}`)
      const resource = data.data as { id: string } | undefined
      return { id: resource?.id ?? '', data }
    }

    case 'List Products': {
      const data = await paddleRequest('GET', '/products')
      return { id: '', data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
