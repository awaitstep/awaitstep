export default async function (ctx) {
  const accessToken = ctx.env.SHOPIFY_ACCESS_TOKEN
  const store = ctx.config.store
  const action = ctx.config.action
  const baseUrl = `https://${store}.myshopify.com/admin/api/2025-01`

  async function shopifyRequest(method: string, path: string, body?: Record<string, unknown>) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const errors = data.errors as string | undefined
      throw new Error(`Shopify API error: ${errors ?? response.statusText}`)
    }
    return data
  }

  switch (action) {
    case 'Get Product': {
      const data = await shopifyRequest('GET', `/products/${ctx.config.productId}.json`)
      const product = data.product as Record<string, unknown>
      return { id: String(product.id), data: product }
    }

    case 'List Products': {
      const limit = ctx.config.limit ?? 50
      const data = await shopifyRequest('GET', `/products.json?limit=${limit}`)
      const products = data.products as Record<string, unknown>[]
      return { id: null, data: products }
    }

    case 'Create Product': {
      const product: Record<string, unknown> = {}
      if (ctx.config.title) product.title = ctx.config.title
      if (ctx.config.bodyHtml) product.body_html = ctx.config.bodyHtml
      if (ctx.config.vendor) product.vendor = ctx.config.vendor
      if (ctx.config.productType) product.product_type = ctx.config.productType
      const data = await shopifyRequest('POST', '/products.json', { product })
      const created = data.product as Record<string, unknown>
      return { id: String(created.id), data: created }
    }

    case 'Get Order': {
      const data = await shopifyRequest('GET', `/orders/${ctx.config.orderId}.json`)
      const order = data.order as Record<string, unknown>
      return { id: String(order.id), data: order }
    }

    case 'List Orders': {
      const limit = ctx.config.limit ?? 50
      const data = await shopifyRequest('GET', `/orders.json?limit=${limit}`)
      const orders = data.orders as Record<string, unknown>[]
      return { id: null, data: orders }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
