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
    const data = (await response.json()) as {
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

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
