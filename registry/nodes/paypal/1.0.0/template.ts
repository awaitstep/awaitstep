export default async function (ctx) {
  const clientId = ctx.env.PAYPAL_CLIENT_ID
  const clientSecret = ctx.env.PAYPAL_CLIENT_SECRET
  const action = ctx.config.action
  const baseUrl = ctx.config.sandbox
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com'

  async function getAccessToken(): Promise<string> {
    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })
    const data = (await response.json()) as { access_token?: string; error_description?: string }
    if (!response.ok) {
      throw new Error(`PayPal auth error: ${data.error_description ?? response.statusText}`)
    }
    return data.access_token!
  }

  async function paypalRequest(method: string, path: string, body?: Record<string, unknown>) {
    const token = await getAccessToken()
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (response.status === 204) {
      return {}
    }
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(`PayPal API error: ${data.message ?? response.statusText}`)
    }
    return data
  }

  switch (action) {
    case 'Create Order': {
      const data = await paypalRequest('POST', '/v2/checkout/orders', {
        intent: ctx.config.intent ?? 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: ctx.config.currency ?? 'USD',
              value: String(ctx.config.amount),
            },
            description: ctx.config.description,
          },
        ],
      })
      return { id: data.id as string, status: data.status as string, data }
    }

    case 'Capture Order': {
      const data = await paypalRequest('POST', `/v2/checkout/orders/${ctx.config.orderId}/capture`)
      return { id: data.id as string, status: data.status as string, data }
    }

    case 'Get Order': {
      const data = await paypalRequest('GET', `/v2/checkout/orders/${ctx.config.orderId}`)
      return { id: data.id as string, status: data.status as string, data }
    }

    case 'Refund Capture': {
      const data = await paypalRequest(
        'POST',
        `/v2/payments/captures/${ctx.config.captureId}/refund`,
      )
      return { id: data.id as string, status: data.status as string, data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
