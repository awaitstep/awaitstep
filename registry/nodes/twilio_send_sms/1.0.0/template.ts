export default async function (ctx) {
  const accountSid = ctx.env.TWILIO_ACCOUNT_SID
  const authToken = ctx.env.TWILIO_AUTH_TOKEN

  const params = new URLSearchParams({
    To: ctx.config.to,
    From: ctx.config.from,
    Body: ctx.config.body,
  })

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    },
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Twilio API error (${response.status}): ${errorText}`)
  }

  const data = (await response.json()) as { sid: string; status: string }

  return {
    sid: data.sid,
    status: data.status,
  }
}
