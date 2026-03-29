export default async function (ctx) {
  const apiUrl = ctx.env.ACTIVECAMPAIGN_API_URL
  const apiKey = ctx.env.ACTIVECAMPAIGN_API_KEY
  const action = ctx.config.action

  async function acRequest(method: string, path: string, body?: Record<string, unknown>) {
    const response = await fetch(`${apiUrl}/api/3${path}`, {
      method,
      headers: {
        'Api-Token': apiKey,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(`ActiveCampaign API error: ${data.message ?? response.statusText}`)
    }
    return data
  }

  switch (action) {
    case 'Create Contact': {
      const contact: Record<string, unknown> = { email: ctx.config.email }
      if (ctx.config.firstName) contact.firstName = ctx.config.firstName
      if (ctx.config.lastName) contact.lastName = ctx.config.lastName
      if (ctx.config.phone) contact.phone = ctx.config.phone
      const data = await acRequest('POST', '/contacts', { contact })
      const created = data.contact as { id: string } | undefined
      return { id: created?.id ?? '', data }
    }

    case 'Get Contact': {
      const data = await acRequest('GET', `/contacts/${ctx.config.contactId}`)
      return { id: ctx.config.contactId, data }
    }

    case 'Update Contact': {
      const contact: Record<string, unknown> = {}
      if (ctx.config.email) contact.email = ctx.config.email
      if (ctx.config.firstName) contact.firstName = ctx.config.firstName
      if (ctx.config.lastName) contact.lastName = ctx.config.lastName
      if (ctx.config.phone) contact.phone = ctx.config.phone
      const data = await acRequest('PUT', `/contacts/${ctx.config.contactId}`, { contact })
      return { id: ctx.config.contactId, data }
    }

    case 'List Contacts': {
      const data = await acRequest('GET', '/contacts')
      return { id: '', data }
    }

    case 'Create Deal': {
      const deal: Record<string, unknown> = {
        title: ctx.config.dealTitle,
        value: ctx.config.dealValue,
        pipeline: ctx.config.dealPipeline,
        stage: ctx.config.dealStage,
      }
      const data = await acRequest('POST', '/deals', { deal })
      const created = data.deal as { id: string } | undefined
      return { id: created?.id ?? '', data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
