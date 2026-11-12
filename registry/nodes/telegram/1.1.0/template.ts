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
    if (data.ok === false) {
      throw new Error(`Telegram API error: ${(data.description as string) ?? 'Unknown error'}`)
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
      const result = data.result as { message_id?: number }
      return { messageId: result.message_id ?? 0, ok: data.ok, data }
    }

    case 'Edit Message': {
      const body: Record<string, unknown> = {
        chat_id: ctx.config.chatId,
        message_id: ctx.config.messageId,
        text: ctx.config.text,
      }
      if (ctx.config.parseMode) body.parse_mode = ctx.config.parseMode
      const data = await telegramRequest('editMessageText', body)
      const result = data.result as { message_id?: number }
      return { messageId: result.message_id ?? 0, ok: data.ok, data }
    }

    case 'Delete Message': {
      const data = await telegramRequest('deleteMessage', {
        chat_id: ctx.config.chatId,
        message_id: ctx.config.messageId,
      })
      return { messageId: Number(ctx.config.messageId ?? 0), ok: data.ok, data }
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
      const result = data.result as { message_id?: number }
      return { messageId: result.message_id ?? 0, ok: data.ok, data }
    }

    case 'Send Document': {
      if (!ctx.config.documentUrl) throw new Error('Document URL is required for Send Document')
      const body: Record<string, unknown> = {
        chat_id: ctx.config.chatId,
        document: ctx.config.documentUrl,
      }
      if (ctx.config.caption) body.caption = ctx.config.caption
      if (ctx.config.parseMode) body.parse_mode = ctx.config.parseMode
      const data = await telegramRequest('sendDocument', body)
      const result = data.result as { message_id?: number }
      return { messageId: result.message_id ?? 0, ok: data.ok, data }
    }

    case 'Send Location': {
      if (ctx.config.latitude == null || ctx.config.longitude == null) {
        throw new Error('Latitude and Longitude are required for Send Location')
      }
      const data = await telegramRequest('sendLocation', {
        chat_id: ctx.config.chatId,
        latitude: ctx.config.latitude,
        longitude: ctx.config.longitude,
      })
      const result = data.result as { message_id?: number }
      return { messageId: result.message_id ?? 0, ok: data.ok, data }
    }

    case 'Get Chat': {
      const data = await telegramRequest('getChat', { chat_id: ctx.config.chatId })
      const result = data.result as { id?: number }
      return { messageId: Number(result.id ?? 0), ok: data.ok, data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
