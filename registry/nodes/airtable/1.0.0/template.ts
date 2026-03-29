export default async function (ctx) {
  const apiKey = ctx.env.AIRTABLE_API_KEY
  const action = ctx.config.action

  async function airtableRequest(method: string, path: string, body?: Record<string, unknown>) {
    const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` }
    if (body) headers['Content-Type'] = 'application/json'
    const response = await fetch(`https://api.airtable.com/v0${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const err = data.error as { message?: string } | undefined
      throw new Error(`Airtable API error: ${err?.message ?? response.statusText}`)
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

  const basePath = `/${ctx.config.baseId}/${ctx.config.tableId}`

  switch (action) {
    case 'Create Record': {
      const data = await airtableRequest('POST', basePath, {
        fields: parseJson(ctx.config.fields) ?? {},
      })
      return { id: data.id, fields: data.fields, data }
    }

    case 'Get Record': {
      const data = await airtableRequest('GET', `${basePath}/${ctx.config.recordId}`)
      return { id: data.id, fields: data.fields, data }
    }

    case 'Update Record': {
      const data = await airtableRequest('PATCH', `${basePath}/${ctx.config.recordId}`, {
        fields: parseJson(ctx.config.fields) ?? {},
      })
      return { id: data.id, fields: data.fields, data }
    }

    case 'List Records': {
      const params = new URLSearchParams()
      if (ctx.config.filterFormula) params.set('filterByFormula', ctx.config.filterFormula)
      if (ctx.config.maxRecords) params.set('maxRecords', String(ctx.config.maxRecords))
      const query = params.toString() ? `?${params.toString()}` : ''
      const data = await airtableRequest('GET', `${basePath}${query}`)
      return { id: null, fields: null, data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
