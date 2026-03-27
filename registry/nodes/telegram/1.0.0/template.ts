export default async function (ctx) {
  const token = ctx.env.TELEGRAM_BOT_TOKEN
  const action = ctx.config.action

  async function telegramRequest(method: string, body: Record<string, unknown>) {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(`Telegram API error: ${(data.description as string) ?? response.statusText}`)
    }
    return data
  }

  switch (action) {
    case 'Send Message': {
      const body: Record<string, unknown> = {
        chat_id: ctx.config.chatId,
        text: ctx.config.text,
      }
      if (ctx.config.parseMode) body.parse_mode = ctx.config.parseMode
      if (ctx.config.disableNotification) body.disable_notification = true
      const data = await telegramRequest('sendMessage', body)
      const result = data.result as Record<string, unknown>
      return { messageId: result.message_id, ok: data.ok, data }
    }

    case 'Edit Message': {
      const body: Record<string, unknown> = {
        chat_id: ctx.config.chatId,
        message_id: ctx.config.messageId,
        text: ctx.config.text,
      }
      if (ctx.config.parseMode) body.parse_mode = ctx.config.parseMode
      const data = await telegramRequest('editMessageText', body)
      const result = data.result as Record<string, unknown>
      return { messageId: result.message_id, ok: data.ok, data }
    }

    case 'Delete Message': {
      const data = await telegramRequest('deleteMessage', {
        chat_id: ctx.config.chatId,
        message_id: ctx.config.messageId,
      })
      return { messageId: ctx.config.messageId, ok: data.ok, data }
    }

    case 'Send Photo': {
      const body: Record<string, unknown> = {
        chat_id: ctx.config.chatId,
        photo: ctx.config.photoUrl,
      }
      if (ctx.config.caption) body.caption = ctx.config.caption
      if (ctx.config.parseMode) body.parse_mode = ctx.config.parseMode
      if (ctx.config.disableNotification) body.disable_notification = true
      const data = await telegramRequest('sendPhoto', body)
      const result = data.result as Record<string, unknown>
      return { messageId: result.message_id, ok: data.ok, data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
