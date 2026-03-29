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
      if (ctx.config.replyTo) body.reply_to = ctx.config.replyTo
      if (ctx.config.cc) body.cc = ctx.config.cc
      if (ctx.config.bcc) body.bcc = ctx.config.bcc
      const data = await resendRequest('POST', '/emails', body)
      return { id: data.id, status: 'sent', data }
    }

    case 'Get Email': {
      const data = await resendRequest('GET', `/emails/${ctx.config.emailId}`)
      return { id: data.id, status: data.last_event, data }
    }

    case 'Cancel Email': {
      const data = await resendRequest('POST', `/emails/${ctx.config.emailId}/cancel`)
      return { id: ctx.config.emailId, status: 'canceled', data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
