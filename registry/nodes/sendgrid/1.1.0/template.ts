export default async function (ctx) {
  const apiKey = ctx.env.SENDGRID_API_KEY
  const action = ctx.config.action

  async function sendgridRequest(method: string, path: string, body?: Record<string, unknown>) {
    const response = await fetch(`https://api.sendgrid.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (response.status === 202 || response.status === 204) {
      return { statusCode: response.status, success: true, data: { accepted: true } }
    }
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const errors = data.errors as Array<{ message: string }> | undefined
      throw new Error(`SendGrid API error: ${errors?.[0]?.message ?? response.statusText}`)
    }
    return { statusCode: response.status, success: true, data }
  }

  function parseJson(value: unknown): unknown {
    if (typeof value !== 'string') return value
    try {
      return JSON.parse(value)
    } catch {
      throw new Error(
        'Invalid JSON input: ' + (value.length > 100 ? value.slice(0, 100) + '...' : value),
      )
    }
  }

  function requireField(value: unknown, label: string): string {
    if (!value) throw new Error(`${label} is required for this action`)
    return String(value)
  }

  function recipients(): Array<{ email: string }> {
    const value = requireField(ctx.config.to, 'To')
    return value
      .split(',')
      .map((email) => email.trim())
      .filter(Boolean)
      .map((email) => ({ email }))
  }

  switch (action) {
    case 'Send Email': {
      return await sendgridRequest('POST', '/v3/mail/send', {
        personalizations: [{ to: recipients() }],
        from: { email: requireField(ctx.config.from, 'From') },
        subject: requireField(ctx.config.subject, 'Subject'),
        content: [{ type: 'text/html', value: requireField(ctx.config.html, 'HTML Body') }],
      })
    }

    case 'Send Multiple': {
      return await sendgridRequest('POST', '/v3/mail/send', {
        personalizations: recipients().map((recipient) => ({ to: [recipient] })),
        from: { email: requireField(ctx.config.from, 'From') },
        subject: requireField(ctx.config.subject, 'Subject'),
        content: [{ type: 'text/html', value: requireField(ctx.config.html, 'HTML Body') }],
      })
    }

    case 'Send Template Email': {
      const personalization: Record<string, unknown> = { to: recipients() }
      if (ctx.config.dynamicTemplateData) {
        personalization.dynamic_template_data = parseJson(ctx.config.dynamicTemplateData)
      }
      return await sendgridRequest('POST', '/v3/mail/send', {
        personalizations: [personalization],
        from: { email: requireField(ctx.config.from, 'From') },
        subject: requireField(ctx.config.subject, 'Subject'),
        template_id: requireField(ctx.config.templateId, 'Template ID'),
      })
    }

    case 'Get Stats': {
      if (!ctx.config.startDate) throw new Error('Start Date is required for Get Stats')
      const params = new URLSearchParams()
      if (ctx.config.startDate) params.set('start_date', String(ctx.config.startDate))
      if (ctx.config.endDate) params.set('end_date', String(ctx.config.endDate))
      const query = params.toString() ? `?${params.toString()}` : ''
      const result = await sendgridRequest('GET', `/v3/stats${query}`)
      return {
        statusCode: result.statusCode,
        success: result.success,
        data: { stats: result.data },
      }
    }

    case 'List Templates': {
      return await sendgridRequest('GET', '/v3/templates?generations=dynamic')
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
