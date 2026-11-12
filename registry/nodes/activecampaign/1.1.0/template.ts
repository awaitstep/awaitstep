export default async function (ctx) {
  function activeCampaignUrl(): string {
    const raw = String(ctx.env.ACTIVECAMPAIGN_API_URL ?? '')
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      throw new Error('ACTIVECAMPAIGN_API_URL must be a valid URL')
    }
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.api-(?:us|eu)\d+\.com$/i.test(url.hostname)) {
      throw new Error('ACTIVECAMPAIGN_API_URL must be an https://<account>.api-usN.com URL')
    }
    return url.origin
  }

  const baseUrl = activeCampaignUrl()
  const apiKey = ctx.env.ACTIVECAMPAIGN_API_KEY
  const action = ctx.config.action

  async function acRequest(method: string, path: string, body?: Record<string, unknown>) {
    const response = await fetch(`${baseUrl}/api/3${path}`, {
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
      return { id: String(ctx.config.contactId ?? ''), data }
    }

    case 'Update Contact': {
      const contact: Record<string, unknown> = {}
      if (ctx.config.email) contact.email = ctx.config.email
      if (ctx.config.firstName) contact.firstName = ctx.config.firstName
      if (ctx.config.lastName) contact.lastName = ctx.config.lastName
      if (ctx.config.phone) contact.phone = ctx.config.phone
      const data = await acRequest('PUT', `/contacts/${ctx.config.contactId}`, { contact })
      return { id: String(ctx.config.contactId ?? ''), data }
    }

    case 'List Contacts': {
      const data = await acRequest('GET', `/contacts?limit=${ctx.config.limit ?? 20}`)
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

    case 'Update Deal': {
      if (!ctx.config.dealId) throw new Error('Deal ID is required for Update Deal')
      const deal: Record<string, unknown> = {}
      if (ctx.config.dealTitle) deal.title = ctx.config.dealTitle
      if (ctx.config.dealValue != null) deal.value = ctx.config.dealValue
      if (ctx.config.dealPipeline) deal.pipeline = ctx.config.dealPipeline
      if (ctx.config.dealStage) deal.stage = ctx.config.dealStage
      const data = await acRequest('PUT', `/deals/${ctx.config.dealId}`, { deal })
      return { id: String(ctx.config.dealId), data }
    }

    case 'List Deals': {
      const data = await acRequest('GET', `/deals?limit=${ctx.config.limit ?? 20}`)
      return { id: '', data }
    }

    case 'Add Tag': {
      if (!ctx.config.contactId) throw new Error('Contact ID is required for Add Tag')
      if (!ctx.config.tagId) throw new Error('Tag ID is required for Add Tag')
      const data = await acRequest('POST', '/contactTags', {
        contactTag: { contact: ctx.config.contactId, tag: ctx.config.tagId },
      })
      return { id: String(ctx.config.contactId), data }
    }

    case 'List Tags': {
      const data = await acRequest('GET', `/tags?limit=${ctx.config.limit ?? 20}`)
      return { id: '', data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
