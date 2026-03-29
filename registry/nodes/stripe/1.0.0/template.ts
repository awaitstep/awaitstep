export default async function (ctx) {
  const apiKey = ctx.env.STRIPE_SECRET_KEY
  const action = ctx.config.action

  async function stripeRequest(method: string, path: string, params?: URLSearchParams) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
    }
    const hasBody = params && method !== 'GET' && method !== 'DELETE'
    if (hasBody) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
    }
    const response = await fetch(`https://api.stripe.com/v1${path}`, {
      method,
      headers,
      body: hasBody ? params.toString() : undefined,
    })
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const err = data.error as { message?: string } | undefined
      throw new Error(`Stripe API error: ${err?.message ?? response.statusText}`)
    }
    return data
  }

  function withMetadata(params: URLSearchParams) {
    if (ctx.config.metadata) {
      let metadata: Record<string, unknown>
      if (typeof ctx.config.metadata === 'string') {
        try {
          metadata = JSON.parse(ctx.config.metadata)
        } catch {
          throw new Error('Invalid JSON in metadata field')
        }
      } else {
        metadata = ctx.config.metadata
      }
      for (const [key, value] of Object.entries(metadata)) {
        params.set(`metadata[${key}]`, String(value))
      }
    }
    return params
  }

  switch (action) {
    case 'Create Payment Intent': {
      const params = withMetadata(
        new URLSearchParams({
          amount: String(ctx.config.amount),
          currency: ctx.config.currency ?? 'usd',
          'automatic_payment_methods[enabled]': 'true',
        }),
      )
      if (ctx.config.customerId) params.set('customer', ctx.config.customerId)
      if (ctx.config.description) params.set('description', ctx.config.description)
      const data = await stripeRequest('POST', '/payment_intents', params)
      return { id: data.id, status: data.status, data }
    }

    case 'Retrieve Payment Intent': {
      const data = await stripeRequest('GET', `/payment_intents/${ctx.config.paymentIntentId}`)
      return { id: data.id, status: data.status, data }
    }

    case 'Create Customer': {
      const params = withMetadata(new URLSearchParams())
      if (ctx.config.email) params.set('email', ctx.config.email)
      if (ctx.config.name) params.set('name', ctx.config.name)
      if (ctx.config.description) params.set('description', ctx.config.description)
      const data = await stripeRequest('POST', '/customers', params)
      return { id: data.id, status: 'created', data }
    }

    case 'Retrieve Customer': {
      const data = await stripeRequest('GET', `/customers/${ctx.config.customerId}`)
      return { id: data.id, status: 'active', data }
    }

    case 'Create Charge': {
      const params = withMetadata(
        new URLSearchParams({
          amount: String(ctx.config.amount),
          currency: ctx.config.currency ?? 'usd',
        }),
      )
      if (ctx.config.customerId) params.set('customer', ctx.config.customerId)
      if (ctx.config.description) params.set('description', ctx.config.description)
      if (ctx.config.source) params.set('source', ctx.config.source)
      const data = await stripeRequest('POST', '/charges', params)
      return { id: data.id, status: data.status, data }
    }

    case 'Create Refund': {
      const params = withMetadata(new URLSearchParams({ charge: ctx.config.chargeId }))
      const data = await stripeRequest('POST', '/refunds', params)
      return { id: data.id, status: data.status, data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
