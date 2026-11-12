export default async function (ctx: any) {
  const action = ctx.config.action

  function graphToken(): string {
    const token = ctx.env.TEAMS_ACCESS_TOKEN
    if (!token) throw new Error('TEAMS_ACCESS_TOKEN is required for Microsoft Graph actions')
    return token
  }

  async function graphApi(method: string, path: string, body?: Record<string, unknown>) {
    const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${graphToken()}`,
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

  function text(): string {
    const value = ctx.config.text
    if (!value) throw new Error('Message Text is required for this action')
    return String(value)
  }

  function webhookUrl(): string {
    const raw = String(ctx.env.TEAMS_WEBHOOK_URL ?? '')
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      throw new Error('TEAMS_WEBHOOK_URL must be a valid URL')
    }
    if (url.protocol !== 'https:') {
      throw new Error('TEAMS_WEBHOOK_URL must be an https URL')
    }
    return url.toString()
  }

  switch (action) {
    case 'Send Webhook Message': {
      const response = await fetch(webhookUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'message',
          attachments: [
            {
              contentType: 'application/vnd.microsoft.card.adaptive',
              contentUrl: null,
              content: {
                $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
                type: 'AdaptiveCard',
                version: '1.4',
                body: [{ type: 'TextBlock', text: text(), wrap: true }],
              },
            },
          ],
        }),
      })
      if (!response.ok) {
        throw new Error(`Teams webhook error (${response.status}): ${await response.text()}`)
      }
      return { id: '', status: 'sent', data: {} }
    }

    case 'Send Channel Message': {
      const data = await graphApi(
        'POST',
        `/teams/${ctx.config.teamId}/channels/${ctx.config.channelId}/messages`,
        {
          body: { contentType: 'text', content: text() },
        },
      )
      return { id: String(data.id ?? ''), status: 'sent', data }
    }

    case 'Reply to Message': {
      const data = await graphApi(
        'POST',
        `/teams/${ctx.config.teamId}/channels/${ctx.config.channelId}/messages/${ctx.config.messageId}/replies`,
        {
          body: { contentType: 'text', content: text() },
        },
      )
      return { id: String(data.id ?? ''), status: 'sent', data }
    }

    case 'List Channels': {
      const data = await graphApi('GET', `/teams/${ctx.config.teamId}/channels`)
      return { id: '', status: 'ok', data }
    }

    case 'List Teams': {
      const data = await graphApi('GET', '/me/joinedTeams')
      return { id: '', status: 'ok', data }
    }

    case 'Send Chat Message': {
      if (!ctx.config.chatId) throw new Error('Chat ID is required for Send Chat Message')
      const data = await graphApi('POST', `/chats/${ctx.config.chatId}/messages`, {
        body: { contentType: 'text', content: text() },
      })
      return { id: String(data.id ?? ''), status: 'sent', data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
