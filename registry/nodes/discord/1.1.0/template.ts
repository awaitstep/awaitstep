export default async function (ctx) {
  const botToken = ctx.env.DISCORD_BOT_TOKEN
  const action = ctx.config.action

  function requireBotToken(): string {
    if (!botToken) throw new Error('DISCORD_BOT_TOKEN is required for bot actions')
    return botToken
  }

  async function discordBotRequest(method: string, path: string, body?: Record<string, unknown>) {
    const response = await fetch(`https://discord.com/api/v10${path}`, {
      method,
      headers: {
        Authorization: `Bot ${requireBotToken()}`,
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
      if (!webhookUrl) throw new Error('DISCORD_WEBHOOK_URL is required for Send Webhook Message')
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
        { content: ctx.config.content },
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

    case 'Add Reaction': {
      if (!ctx.config.channelId || !ctx.config.messageId || !ctx.config.emoji) {
        throw new Error('Channel ID, Message ID, and Emoji are required for Add Reaction')
      }
      const emoji = encodeURIComponent(String(ctx.config.emoji))
      const data = await discordBotRequest(
        'PUT',
        `/channels/${ctx.config.channelId}/messages/${ctx.config.messageId}/reactions/${emoji}/@me`,
      )
      return { id: String(ctx.config.messageId), channelId: String(ctx.config.channelId), data }
    }

    case 'Create Thread': {
      if (!ctx.config.channelId) throw new Error('Channel ID is required for Create Thread')
      if (!ctx.config.threadName) throw new Error('Thread Name is required for Create Thread')
      const data = await discordBotRequest('POST', `/channels/${ctx.config.channelId}/threads`, {
        name: ctx.config.threadName,
        type: 11,
      })
      return { id: data.id, channelId: data.parent_id, data }
    }

    case 'List Channels': {
      if (!ctx.config.guildId) throw new Error('Guild ID is required for List Channels')
      const data = await discordBotRequest('GET', `/guilds/${ctx.config.guildId}/channels`)
      return { id: '', channelId: '', data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
