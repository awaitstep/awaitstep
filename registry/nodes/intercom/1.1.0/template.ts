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
        'Intercom-Version': '2.18',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (response.status === 204) return {}
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const errors = data.errors as { message?: string }[] | undefined
      throw new Error(`Intercom API error: ${errors?.[0]?.message ?? response.statusText}`)
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
      return { id: data.id, type: data.type, data }
    }

    case 'Get Contact': {
      const data = await intercomRequest('GET', `/contacts/${ctx.config.contactId}`)
      return { id: data.id, type: data.type, data }
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
      return { id: data.id, type: data.type, data }
    }

    case 'List Conversations': {
      const data = await intercomRequest('GET', '/conversations')
      return { id: null, type: 'list', data }
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
      return { id: data.id, type: data.type, data }
    }

    case 'List Contacts': {
      const data = await intercomRequest('GET', `/contacts?per_page=${ctx.config.limit ?? 20}`)
      return { id: null, type: 'list', data }
    }

    case 'Tag Contact': {
      if (!ctx.config.contactId) throw new Error('Contact ID is required for Tag Contact')
      if (!ctx.config.tagId) throw new Error('Tag ID is required for Tag Contact')
      const data = await intercomRequest('POST', `/contacts/${ctx.config.contactId}/tags`, {
        id: ctx.config.tagId,
      })
      return { id: String(ctx.config.contactId), type: 'contact', data }
    }

    case 'Close Conversation': {
      if (!ctx.config.conversationId) {
        throw new Error('Conversation ID is required for Close Conversation')
      }
      const data = await intercomRequest(
        'POST',
        `/conversations/${ctx.config.conversationId}/parts`,
        {
          message_type: 'close',
          type: 'admin',
          admin_id: ctx.config.adminId,
        },
      )
      return { id: String(ctx.config.conversationId), type: 'conversation', data }
    }

    case 'List Admins': {
      const data = await intercomRequest('GET', '/admins')
      return { id: null, type: 'list', data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
