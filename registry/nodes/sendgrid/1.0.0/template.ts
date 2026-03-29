export default async function (ctx) {
  const apiKey = ctx.env.SENDGRID_API_KEY
  const action = ctx.config.action

  async function sendgridSend(body: Record<string, unknown>) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (response.status === 202) {
      return { statusCode: 202, success: true, data: { accepted: true } }
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

  switch (action) {
    case 'Send Email': {
      return await sendgridSend({
        personalizations: [{ to: [{ email: ctx.config.to }] }],
        from: { email: ctx.config.from },
        subject: ctx.config.subject,
        content: [{ type: 'text/html', value: ctx.config.html }],
      })
    }

    case 'Send Template Email': {
      const personalization: Record<string, unknown> = {
        to: [{ email: ctx.config.to }],
      }
      if (ctx.config.dynamicTemplateData) {
        personalization.dynamic_template_data = parseJson(ctx.config.dynamicTemplateData)
      }
      return await sendgridSend({
        personalizations: [personalization],
        from: { email: ctx.config.from },
        subject: ctx.config.subject,
        template_id: ctx.config.templateId,
      })
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
