export default async function (ctx) {
  const apiKey = ctx.env.MAILCHIMP_API_KEY
  const action = ctx.config.action
  const dc = apiKey.split('-').pop()
  const baseUrl = `https://${dc}.api.mailchimp.com/3.0`

  async function mcRequest(method: string, path: string, body?: Record<string, unknown>) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${btoa(`apikey:${apiKey}`)}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(`Mailchimp API error: ${data.detail ?? response.statusText}`)
    }
    return data
  }

  async function md5(str: string): Promise<string> {
    const data = new TextEncoder().encode(str)
    const hashBuffer = await crypto.subtle.digest('MD5', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  switch (action) {
    case 'Add Subscriber': {
      const body: Record<string, unknown> = {
        email_address: ctx.config.email,
        status: ctx.config.status ?? 'subscribed',
      }
      if (ctx.config.mergeFields) {
        body.merge_fields =
          typeof ctx.config.mergeFields === 'string'
            ? JSON.parse(ctx.config.mergeFields)
            : ctx.config.mergeFields
      }
      const data = await mcRequest('POST', `/lists/${ctx.config.listId}/members`, body)
      return { id: data.id as string, status: data.status as string, data }
    }

    case 'Update Subscriber': {
      const hash = await md5(ctx.config.email.toLowerCase())
      const body: Record<string, unknown> = {}
      if (ctx.config.status) body.status = ctx.config.status
      if (ctx.config.mergeFields) {
        body.merge_fields =
          typeof ctx.config.mergeFields === 'string'
            ? JSON.parse(ctx.config.mergeFields)
            : ctx.config.mergeFields
      }
      const data = await mcRequest('PATCH', `/lists/${ctx.config.listId}/members/${hash}`, body)
      return { id: data.id as string, status: data.status as string, data }
    }

    case 'Get Subscriber': {
      const hash = await md5(ctx.config.email.toLowerCase())
      const data = await mcRequest('GET', `/lists/${ctx.config.listId}/members/${hash}`)
      return { id: data.id as string, status: data.status as string, data }
    }

    case 'List Members': {
      const data = await mcRequest('GET', `/lists/${ctx.config.listId}/members`)
      return { id: '', status: 'ok', data }
    }

    case 'Create Campaign': {
      const data = await mcRequest('POST', '/campaigns', {
        type: ctx.config.campaignType ?? 'regular',
        recipients: { list_id: ctx.config.listId },
        settings: {
          subject_line: ctx.config.subject,
          from_name: ctx.config.fromName,
          reply_to: ctx.config.replyTo,
        },
      })
      return { id: data.id as string, status: data.status as string, data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
