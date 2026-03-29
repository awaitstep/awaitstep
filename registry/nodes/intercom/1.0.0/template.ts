export default async function (ctx) {
  const accessToken = ctx.env.INTERCOM_ACCESS_TOKEN
  const action = ctx.config.action
  const baseUrl = 'https://api.intercom.io'

  async function intercomRequest(method: string, path: string, body?: Record<string, unknown>) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Intercom-Version': '2.10',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const errors = data.errors as { message?: string }[] | undefined
      const message = errors?.[0]?.message
      throw new Error(`Intercom API error: ${message ?? response.statusText}`)
    }
    return data
  }

  switch (action) {
    case 'Create Contact': {
      const body: Record<string, unknown> = {}
      if (ctx.config.role) body.role = ctx.config.role
      if (ctx.config.email) body.email = ctx.config.email
      if (ctx.config.name) body.name = ctx.config.name
      const data = await intercomRequest('POST', '/contacts', body)
      return { id: data.id as string, type: data.type as string, data }
    }

    case 'Get Contact': {
      const data = await intercomRequest('GET', `/contacts/${ctx.config.contactId}`)
      return { id: data.id as string, type: data.type as string, data }
    }

    case 'Send Message': {
      const body: Record<string, unknown> = {
        message_type: ctx.config.messageType ?? 'inapp',
        body: ctx.config.body,
        from: { type: 'admin', id: ctx.config.adminId },
        to: { type: 'user', id: ctx.config.contactId },
      }
      if (ctx.config.subject) body.subject = ctx.config.subject
      const data = await intercomRequest('POST', '/messages', body)
      return { id: data.id as string, type: data.type as string, data }
    }

    case 'List Conversations': {
      const data = await intercomRequest('GET', '/conversations')
      return {
        id: null,
        type: 'list',
        data,
      }
    }

    case 'Reply to Conversation': {
      const body: Record<string, unknown> = {
        message_type: 'comment',
        type: 'admin',
        admin_id: ctx.config.adminId,
        body: ctx.config.body,
      }
      const data = await intercomRequest(
        'POST',
        `/conversations/${ctx.config.conversationId}/reply`,
        body,
      )
      return { id: data.id as string, type: data.type as string, data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
