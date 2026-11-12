export default async function (ctx) {
  const accountSid = ctx.env.TWILIO_ACCOUNT_SID
  const authToken = ctx.env.TWILIO_AUTH_TOKEN
  const action = ctx.config.action

  function requireConfig(value: unknown, label: string): string {
    if (!value) throw new Error(`${label} is required for this action`)
    return String(value)
  }

  async function twilioRequest(method: string, path: string, params?: URLSearchParams) {
    const headers: Record<string, string> = {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
    }
    const hasBody = params && method !== 'GET' && method !== 'DELETE'
    if (hasBody) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
    }
    const [resource, query] = path.split('?')
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}${resource}.json${query ? `?${query}` : ''}`
    const response = await fetch(url, {
      method,
      headers,
      body: hasBody ? params.toString() : undefined,
    })
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(`Twilio API error: ${(data.message as string) ?? response.statusText}`)
    }
    return data
  }

  switch (action) {
    case 'Send SMS': {
      const params = new URLSearchParams({
        To: requireConfig(ctx.config.to, 'To'),
        From: requireConfig(ctx.config.from, 'From'),
        Body: requireConfig(ctx.config.body, 'Body'),
      })
      if (ctx.config.statusCallbackUrl) params.set('StatusCallback', ctx.config.statusCallbackUrl)
      const data = await twilioRequest('POST', '/Messages', params)
      return { sid: data.sid, status: data.status, data }
    }

    case 'Send WhatsApp': {
      const to = requireConfig(ctx.config.to, 'To')
      const from = requireConfig(ctx.config.from, 'From')
      const toNum = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`
      const fromNum = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`
      const params = new URLSearchParams({
        To: toNum,
        From: fromNum,
        Body: requireConfig(ctx.config.body, 'Body'),
      })
      if (ctx.config.statusCallbackUrl) params.set('StatusCallback', ctx.config.statusCallbackUrl)
      const data = await twilioRequest('POST', '/Messages', params)
      return { sid: data.sid, status: data.status, data }
    }

    case 'Make Call': {
      const params = new URLSearchParams({
        To: requireConfig(ctx.config.to, 'To'),
        From: requireConfig(ctx.config.from, 'From'),
        Twiml: requireConfig(ctx.config.twiml, 'TwiML'),
      })
      const data = await twilioRequest('POST', '/Calls', params)
      return { sid: data.sid, status: data.status, data }
    }

    case 'Get Message Status': {
      const data = await twilioRequest('GET', `/Messages/${ctx.config.messageSid}`)
      return { sid: data.sid, status: data.status, data }
    }

    case 'List Messages': {
      const data = await twilioRequest('GET', '/Messages?PageSize=20')
      return { sid: '', status: 'listed', data }
    }

    case 'Get Call': {
      if (!ctx.config.callSid) throw new Error('Call SID is required for Get Call')
      const data = await twilioRequest('GET', `/Calls/${ctx.config.callSid}`)
      return { sid: data.sid, status: data.status, data }
    }

    case 'List Calls': {
      const data = await twilioRequest('GET', '/Calls?PageSize=20')
      return { sid: '', status: 'listed', data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
