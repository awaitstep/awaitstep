export default async function (ctx) {
  const apiKey = ctx.env.RESEND_API_KEY
  const action = ctx.config.action

  async function resendRequest(method: string, path: string, body?: Record<string, unknown>) {
    const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` }
    if (body) headers['Content-Type'] = 'application/json'
    const response = await fetch(`https://api.resend.com${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (response.status === 204) return {}
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(`Resend API error: ${(data.message as string) ?? response.statusText}`)
    }
    return data
  }

  switch (action) {
    case 'Send Email': {
      const body: Record<string, unknown> = {
        from: ctx.config.from,
        to: ctx.config.to,
        subject: ctx.config.subject,
        html: ctx.config.html,
      }
      if (ctx.config.text) body.text = ctx.config.text
      if (ctx.config.replyTo) body.reply_to = ctx.config.replyTo
      if (ctx.config.cc) body.cc = ctx.config.cc
      if (ctx.config.bcc) body.bcc = ctx.config.bcc
      if (ctx.config.scheduledAt) body.scheduled_at = ctx.config.scheduledAt
      const data = await resendRequest('POST', '/emails', body)
      return { id: String(data.id ?? ''), status: 'sent', data }
    }

    case 'Get Email': {
      const data = await resendRequest('GET', `/emails/${ctx.config.emailId}`)
      return { id: String(data.id ?? ''), status: String(data.last_event ?? ''), data }
    }

    case 'Cancel Email': {
      const data = await resendRequest('POST', `/emails/${ctx.config.emailId}/cancel`)
      return { id: String(ctx.config.emailId ?? ''), status: 'canceled', data }
    }

    case 'List Emails': {
      const data = await resendRequest('GET', `/emails?limit=${ctx.config.limit ?? 20}`)
      return { id: '', status: 'ok', data }
    }

    case 'Update Email': {
      if (!ctx.config.emailId) throw new Error('Email ID is required for Update Email')
      const body: Record<string, unknown> = {}
      if (ctx.config.scheduledAt) body.scheduled_at = ctx.config.scheduledAt
      const data = await resendRequest('PATCH', `/emails/${ctx.config.emailId}`, body)
      return { id: String(ctx.config.emailId), status: 'updated', data }
    }

    case 'List Audiences': {
      const data = await resendRequest('GET', '/audiences')
      return { id: '', status: 'ok', data }
    }

    case 'Create Audience': {
      if (!ctx.config.audienceName) throw new Error('Audience Name is required for Create Audience')
      const data = await resendRequest('POST', '/audiences', {
        name: ctx.config.audienceName,
      })
      return { id: String(data.id ?? ''), status: 'created', data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
