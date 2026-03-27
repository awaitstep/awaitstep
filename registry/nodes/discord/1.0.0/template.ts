export default async function (ctx) {
  const botToken = ctx.env.DISCORD_BOT_TOKEN
  const action = ctx.config.action

  async function discordBotRequest(method: string, path: string, body?: Record<string, unknown>) {
    const response = await fetch(`https://discord.com/api/v10${path}`, {
      method,
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (method === 'DELETE' && response.status === 204) {
      return { deleted: true }
    }
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(`Discord API error: ${(data.message as string) ?? response.statusText}`)
    }
    return data
  }

  switch (action) {
    case 'Send Webhook Message': {
      const webhookUrl = ctx.env.DISCORD_WEBHOOK_URL
      const body: Record<string, unknown> = { content: ctx.config.content }
      if (ctx.config.username) body.username = ctx.config.username
      if (ctx.config.avatarUrl) body.avatar_url = ctx.config.avatarUrl
      const response = await fetch(`${webhookUrl}?wait=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await response.json()) as Record<string, unknown>
      if (!response.ok) {
        throw new Error(`Discord Webhook error: ${(data.message as string) ?? response.statusText}`)
      }
      return { id: data.id, channelId: data.channel_id, data }
    }

    case 'Send Channel Message': {
      const data = await discordBotRequest('POST', `/channels/${ctx.config.channelId}/messages`, {
        content: ctx.config.content,
      })
      return { id: data.id, channelId: data.channel_id, data }
    }

    case 'Edit Message': {
      const data = await discordBotRequest(
        'PATCH',
        `/channels/${ctx.config.channelId}/messages/${ctx.config.messageId}`,
        {
          content: ctx.config.content,
        },
      )
      return { id: data.id, channelId: data.channel_id, data }
    }

    case 'Delete Message': {
      await discordBotRequest(
        'DELETE',
        `/channels/${ctx.config.channelId}/messages/${ctx.config.messageId}`,
      )
      return { id: ctx.config.messageId, channelId: ctx.config.channelId, data: { deleted: true } }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
