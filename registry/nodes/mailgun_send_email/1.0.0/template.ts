export default async function (ctx) {
  const domain = ctx.config.domain
  const apiKey = ctx.env.MAILGUN_API_KEY

  const form = new FormData()
  form.append('from', ctx.config.from)
  form.append('to', ctx.config.to)
  form.append('subject', ctx.config.subject)
  form.append('html', ctx.config.html)

  if (ctx.config.cc) form.append('cc', ctx.config.cc)
  if (ctx.config.bcc) form.append('bcc', ctx.config.bcc)

  const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
    },
    body: form,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Mailgun API error (${response.status}): ${errorText}`)
  }

  const data = (await response.json()) as { id: string }

  return {
    id: data.id,
  }
}
