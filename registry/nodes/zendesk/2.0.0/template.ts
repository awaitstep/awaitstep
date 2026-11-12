export default async function (ctx) {
  const email = ctx.env.ZENDESK_EMAIL
  const apiToken = ctx.env.ZENDESK_API_TOKEN
  const subdomain = ctx.config.subdomain
  const action = ctx.config.action
  const baseUrl = `https://${subdomain}.zendesk.com/api/v2`
  const credentials = btoa(`${email}/token:${apiToken}`)

  async function zendeskRequest(method: string, path: string, body?: Record<string, unknown>) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (response.status === 204) return {}
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(`Zendesk API error: ${(data.error as string) ?? response.statusText}`)
    }
    return data
  }

  switch (action) {
    case 'Create Ticket': {
      const ticket: Record<string, unknown> = {}
      if (ctx.config.subject) ticket.subject = ctx.config.subject
      if (ctx.config.description) ticket.comment = { body: ctx.config.description }
      if (ctx.config.priority) ticket.priority = ctx.config.priority
      if (ctx.config.status) ticket.status = ctx.config.status
      if (ctx.config.assigneeId) ticket.assignee_id = ctx.config.assigneeId
      const data = await zendeskRequest('POST', '/tickets.json', { ticket })
      const created = data.ticket as Record<string, unknown>
      return { id: String(created.id), status: created.status as string, data: created }
    }

    case 'Get Ticket': {
      const data = await zendeskRequest('GET', `/tickets/${ctx.config.ticketId}.json`)
      const ticket = data.ticket as Record<string, unknown>
      return { id: String(ticket.id), status: ticket.status as string, data: ticket }
    }

    case 'Update Ticket': {
      const ticket: Record<string, unknown> = {}
      if (ctx.config.subject) ticket.subject = ctx.config.subject
      if (ctx.config.priority) ticket.priority = ctx.config.priority
      if (ctx.config.status) ticket.status = ctx.config.status
      if (ctx.config.assigneeId) ticket.assignee_id = ctx.config.assigneeId
      const data = await zendeskRequest('PUT', `/tickets/${ctx.config.ticketId}.json`, { ticket })
      const updated = data.ticket as Record<string, unknown>
      return { id: String(updated.id), status: updated.status as string, data: updated }
    }

    case 'List Tickets': {
      const data = await zendeskRequest('GET', '/tickets.json')
      return { id: null, status: 'listed', data }
    }

    case 'Search Tickets': {
      const query = encodeURIComponent(`type:ticket ${ctx.config.query}`)
      const data = await zendeskRequest('GET', `/search.json?query=${query}`)
      return { id: null, status: 'searched', data }
    }

    case 'Delete Ticket': {
      if (!ctx.config.ticketId) throw new Error('Ticket ID is required for Delete Ticket')
      await zendeskRequest('DELETE', `/tickets/${ctx.config.ticketId}.json`)
      return { id: String(ctx.config.ticketId), status: 'deleted', data: {} }
    }

    case 'Add Comment': {
      if (!ctx.config.ticketId) throw new Error('Ticket ID is required for Add Comment')
      const data = await zendeskRequest('PUT', `/tickets/${ctx.config.ticketId}.json`, {
        ticket: { comment: { body: ctx.config.comment } },
      })
      const ticket = data.ticket as Record<string, unknown>
      return { id: String(ticket.id), status: ticket.status as string, data: ticket }
    }

    case 'List Users': {
      const data = await zendeskRequest('GET', '/users.json')
      return { id: null, status: 'listed', data }
    }

    case 'Get User': {
      if (!ctx.config.userId) throw new Error('User ID is required for Get User')
      const data = await zendeskRequest('GET', `/users/${ctx.config.userId}.json`)
      const user = data.user as Record<string, unknown>
      return { id: String(user.id), status: 'ok', data: user }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
