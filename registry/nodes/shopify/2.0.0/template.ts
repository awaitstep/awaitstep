export default async function (ctx) {
  const accessToken = ctx.env.SHOPIFY_ACCESS_TOKEN
  const store = ctx.config.store
  const action = ctx.config.action
  const baseUrl = `https://${store}.myshopify.com/admin/api/2026-10`

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
      const errors = data.errors
      const message = typeof errors === 'string' ? errors : JSON.stringify(errors)
      throw new Error(`Shopify API error: ${message || response.statusText}`)
    }
    return data
  }

  switch (action) {
    case 'Get Product': {
      const data = await shopifyRequest('GET', `/products/${ctx.config.productId}.json`)
      const product = data.product as Record<string, unknown>
      return { id: String(product.id ?? ''), data: product }
    }

    case 'List Products': {
      const limit = ctx.config.limit ?? 50
      const data = await shopifyRequest('GET', `/products.json?limit=${limit}`)
      return { id: null, data }
    }

    case 'Create Product': {
      const product: Record<string, unknown> = {}
      if (ctx.config.title) product.title = ctx.config.title
      if (ctx.config.bodyHtml) product.body_html = ctx.config.bodyHtml
      if (ctx.config.vendor) product.vendor = ctx.config.vendor
      if (ctx.config.productType) product.product_type = ctx.config.productType
      const data = await shopifyRequest('POST', '/products.json', { product })
      const created = data.product as Record<string, unknown>
      return { id: String(created.id ?? ''), data: created }
    }

    case 'Update Product': {
      if (!ctx.config.productId) throw new Error('Product ID is required for Update Product')
      const product: Record<string, unknown> = {}
      if (ctx.config.title) product.title = ctx.config.title
      if (ctx.config.bodyHtml) product.body_html = ctx.config.bodyHtml
      if (ctx.config.vendor) product.vendor = ctx.config.vendor
      if (ctx.config.productType) product.product_type = ctx.config.productType
      const data = await shopifyRequest('PUT', `/products/${ctx.config.productId}.json`, {
        product,
      })
      const updated = data.product as Record<string, unknown>
      return { id: String(updated.id ?? ''), data: updated }
    }

    case 'Delete Product': {
      if (!ctx.config.productId) throw new Error('Product ID is required for Delete Product')
      await shopifyRequest('DELETE', `/products/${ctx.config.productId}.json`)
      return { id: String(ctx.config.productId), data: {} }
    }

    case 'Get Order': {
      const data = await shopifyRequest('GET', `/orders/${ctx.config.orderId}.json`)
      const order = data.order as Record<string, unknown>
      return { id: String(order.id ?? ''), data: order }
    }

    case 'List Orders': {
      const limit = ctx.config.limit ?? 50
      const data = await shopifyRequest('GET', `/orders.json?limit=${limit}&status=any`)
      return { id: null, data }
    }

    case 'Create Order': {
      if (!ctx.config.variantId) throw new Error('Variant ID is required for Create Order')
      const lineItem: Record<string, unknown> = {
        variant_id: Number(ctx.config.variantId),
        quantity: ctx.config.quantity ?? 1,
      }
      const order: Record<string, unknown> = { line_items: [lineItem] }
      if (ctx.config.customerEmail) order.customer = { email: ctx.config.customerEmail }
      const data = await shopifyRequest('POST', '/orders.json', { order })
      const created = data.order as Record<string, unknown>
      return { id: String(created.id ?? ''), data: created }
    }

    case 'List Customers': {
      const limit = ctx.config.limit ?? 50
      const data = await shopifyRequest('GET', `/customers.json?limit=${limit}`)
      return { id: null, data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
