export default async function (ctx) {
  const accountSid = ctx.env.TWILIO_ACCOUNT_SID
  const authToken = ctx.env.TWILIO_AUTH_TOKEN
  const action = ctx.config.action

  async function twilioRequest(method: string, path: string, params?: URLSearchParams) {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}${path}.json`,
      {
        method,
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params?.toString(),
      },
    )
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(`Twilio API error: ${(data.message as string) ?? response.statusText}`)
    }
    return data
  }

  switch (action) {
    case 'Send SMS': {
      const params = new URLSearchParams({
        To: ctx.config.to,
        From: ctx.config.from,
        Body: ctx.config.body,
      })
      if (ctx.config.statusCallbackUrl) params.set('StatusCallback', ctx.config.statusCallbackUrl)
      const data = await twilioRequest('POST', '/Messages', params)
      return { sid: data.sid, status: data.status, data }
    }

    case 'Send WhatsApp': {
      const params = new URLSearchParams({
        To: `whatsapp:${ctx.config.to}`,
        From: `whatsapp:${ctx.config.from}`,
        Body: ctx.config.body,
      })
      if (ctx.config.statusCallbackUrl) params.set('StatusCallback', ctx.config.statusCallbackUrl)
      const data = await twilioRequest('POST', '/Messages', params)
      return { sid: data.sid, status: data.status, data }
    }

    case 'Make Call': {
      const params = new URLSearchParams({
        To: ctx.config.to,
        From: ctx.config.from,
        Twiml: ctx.config.twiml,
      })
      const data = await twilioRequest('POST', '/Calls', params)
      return { sid: data.sid, status: data.status, data }
    }

    case 'Get Message Status': {
      const data = await twilioRequest('GET', `/Messages/${ctx.config.messageSid}`)
      return { sid: data.sid, status: data.status, data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
