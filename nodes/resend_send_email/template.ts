export default async function (ctx) {
  const body: Record<string, unknown> = {
    from: ctx.config.from,
    to: ctx.config.to,
    subject: ctx.config.subject,
    html: ctx.config.html,
  }

  if (ctx.config.replyTo) body.reply_to = ctx.config.replyTo
  if (ctx.config.cc) body.cc = ctx.config.cc
  if (ctx.config.bcc) body.bcc = ctx.config.bcc

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Resend API error (${response.status}): ${errorText}`)
  }

  const data = (await response.json()) as { id: string }

  return {
    id: data.id,
  }
}
