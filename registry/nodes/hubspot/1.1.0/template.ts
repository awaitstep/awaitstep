export default async function (ctx) {
  const accessToken = ctx.env.HUBSPOT_ACCESS_TOKEN
  const action = ctx.config.action

  async function hubspotRequest(method: string, path: string, body?: Record<string, unknown>) {
    const response = await fetch(`https://api.hubapi.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (response.status === 204) return {}
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(`HubSpot API error: ${(data.message as string) ?? response.statusText}`)
    }
    return data
  }

  function parseJson(value: unknown): unknown {
    if (typeof value !== 'string') return value
    try {
      return JSON.parse(value)
    } catch {
      throw new Error(
        'Invalid JSON input: ' + (value.length > 100 ? value.slice(0, 100) + '...' : value),
      )
    }
  }

  switch (action) {
    case 'Create Contact': {
      const properties: Record<string, string> = {}
      if (ctx.config.email) properties.email = String(ctx.config.email)
      if (ctx.config.firstName) properties.firstname = String(ctx.config.firstName)
      if (ctx.config.lastName) properties.lastname = String(ctx.config.lastName)
      const data = await hubspotRequest('POST', '/crm/v3/objects/contacts', { properties })
      return { id: data.id, properties: data.properties, data }
    }

    case 'Get Contact': {
      const data = await hubspotRequest('GET', `/crm/v3/objects/contacts/${ctx.config.contactId}`)
      return { id: data.id, properties: data.properties, data }
    }

    case 'Update Contact': {
      const properties = parseJson(ctx.config.properties) as Record<string, unknown>
      const data = await hubspotRequest(
        'PATCH',
        `/crm/v3/objects/contacts/${ctx.config.contactId}`,
        { properties },
      )
      return { id: data.id, properties: data.properties, data }
    }

    case 'Search Contacts': {
      const body: Record<string, unknown> = {}
      if (ctx.config.query) body.query = ctx.config.query
      if (ctx.config.searchFilters) body.filterGroups = parseJson(ctx.config.searchFilters)
      const data = await hubspotRequest('POST', '/crm/v3/objects/contacts/search', body)
      return { id: null, properties: null, data }
    }

    case 'Delete Contact': {
      if (!ctx.config.contactId) throw new Error('Contact ID is required for Delete Contact')
      await hubspotRequest('DELETE', `/crm/v3/objects/contacts/${ctx.config.contactId}`)
      return { id: String(ctx.config.contactId), properties: null, data: {} }
    }

    case 'List Contacts': {
      const data = await hubspotRequest(
        'GET',
        `/crm/v3/objects/contacts?limit=${ctx.config.limit ?? 20}`,
      )
      return { id: null, properties: null, data }
    }

    case 'Create Deal': {
      const properties: Record<string, string> = {}
      if (ctx.config.dealName) properties.dealname = String(ctx.config.dealName)
      if (ctx.config.dealAmount != null) properties.amount = String(ctx.config.dealAmount)
      if (ctx.config.dealStage) properties.dealstage = String(ctx.config.dealStage)
      const data = await hubspotRequest('POST', '/crm/v3/objects/deals', { properties })
      return { id: data.id, properties: data.properties, data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
