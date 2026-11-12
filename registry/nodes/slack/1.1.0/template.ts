export default async function (ctx) {
  const token = ctx.env.SLACK_BOT_TOKEN
  const action = ctx.config.action

  async function slackApi(method: string, body: Record<string, unknown>) {
    const response = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const data = (await response.json()) as Record<string, unknown> & {
      ok: boolean
      ts?: string
      channel?: string
      error?: string
    }
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`)
    }
    return data
  }

  switch (action) {
    case 'Send Message': {
      const body: Record<string, unknown> = {
        channel: ctx.config.channel,
        text: ctx.config.text,
      }
      if (ctx.config.username) body.username = ctx.config.username
      if (ctx.config.iconEmoji) body.icon_emoji = ctx.config.iconEmoji
      const data = await slackApi('chat.postMessage', body)
      return { ok: true, ts: data.ts, channel: data.channel }
    }

    case 'Update Message': {
      const data = await slackApi('chat.update', {
        channel: ctx.config.channel,
        ts: ctx.config.messageTs,
        text: ctx.config.text,
      })
      return { ok: true, ts: data.ts, channel: data.channel }
    }

    case 'Delete Message': {
      await slackApi('chat.delete', {
        channel: ctx.config.channel,
        ts: ctx.config.messageTs,
      })
      return { ok: true, ts: ctx.config.messageTs, channel: ctx.config.channel }
    }

    case 'Set Channel Topic': {
      await slackApi('conversations.setTopic', {
        channel: ctx.config.channel,
        topic: ctx.config.topic,
      })
      return { ok: true, channel: ctx.config.channel }
    }

    case 'Invite to Channel': {
      await slackApi('conversations.invite', {
        channel: ctx.config.channel,
        users: ctx.config.userId,
      })
      return { ok: true, channel: ctx.config.channel }
    }

    case 'Schedule Message': {
      if (!ctx.config.postAt) throw new Error('Post At is required for Schedule Message')
      const milliseconds = new Date(String(ctx.config.postAt)).getTime()
      if (!Number.isFinite(milliseconds)) {
        throw new Error('Post At must be a valid ISO date')
      }
      const data = await slackApi('chat.scheduleMessage', {
        channel: ctx.config.channel,
        text: ctx.config.text,
        post_at: Math.floor(milliseconds / 1000),
      })
      return { ok: true, ts: data.ts, channel: data.channel }
    }

    case 'List Channels': {
      const data = await slackApi('conversations.list', {
        types: 'public_channel,private_channel',
        limit: 100,
      })
      return { ok: true, ts: null, channel: null, channels: data.channels }
    }

    case 'Add Reaction': {
      if (!ctx.config.messageTs) {
        throw new Error('Message Timestamp is required for Add Reaction')
      }
      if (!ctx.config.emoji) throw new Error('Emoji is required for Add Reaction')
      await slackApi('reactions.add', {
        channel: ctx.config.channel,
        timestamp: ctx.config.messageTs,
        name: ctx.config.emoji,
      })
      return { ok: true, ts: ctx.config.messageTs, channel: ctx.config.channel }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
