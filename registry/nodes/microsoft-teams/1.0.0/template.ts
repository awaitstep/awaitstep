export default async function (ctx) {
  const action = ctx.config.action

  async function graphApi(method: string, path: string, body?: Record<string, unknown>) {
    const token = ctx.env.TEAMS_ACCESS_TOKEN
    const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const err = data.error as { message?: string } | undefined
      throw new Error(`Teams Graph API error: ${err?.message ?? response.statusText}`)
    }
    return data
  }

  switch (action) {
    case 'Send Webhook Message': {
      const webhookUrl = ctx.env.TEAMS_WEBHOOK_URL
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ctx.config.text }),
      })
      if (!response.ok) {
        throw new Error(`Teams webhook error: ${response.statusText}`)
      }
      return { id: '', status: 'sent', data: {} }
    }

    case 'Send Channel Message': {
      const data = await graphApi(
        'POST',
        `/teams/${ctx.config.teamId}/channels/${ctx.config.channelId}/messages`,
        {
          body: { contentType: 'text', content: ctx.config.text },
        },
      )
      return { id: data.id as string, status: 'sent', data }
    }

    case 'Reply to Message': {
      const data = await graphApi(
        'POST',
        `/teams/${ctx.config.teamId}/channels/${ctx.config.channelId}/messages/${ctx.config.messageId}/replies`,
        {
          body: { contentType: 'text', content: ctx.config.text },
        },
      )
      return { id: data.id as string, status: 'sent', data }
    }

    case 'List Channels': {
      const data = await graphApi('GET', `/teams/${ctx.config.teamId}/channels`)
      return { id: '', status: 'ok', data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
