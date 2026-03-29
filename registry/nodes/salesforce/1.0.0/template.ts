export default async function (ctx) {
  const instanceUrl = ctx.env.SALESFORCE_INSTANCE_URL
  const token = ctx.env.SALESFORCE_ACCESS_TOKEN
  const action = ctx.config.action
  const apiBase = `${instanceUrl}/services/data/v59.0`

  async function sfRequest(method: string, path: string, body?: Record<string, unknown>) {
    const response = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (method === 'DELETE' && response.status === 204) {
      return {}
    }
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const errors = data as unknown as Array<{ message?: string }>
      const message = Array.isArray(errors) ? errors[0]?.message : response.statusText
      throw new Error(`Salesforce API error: ${message ?? response.statusText}`)
    }
    return data
  }

  switch (action) {
    case 'Create Record': {
      const recordData =
        typeof ctx.config.data === 'string' ? JSON.parse(ctx.config.data) : ctx.config.data
      const data = await sfRequest('POST', `/sobjects/${ctx.config.objectType}`, recordData)
      return { id: data.id as string, success: true, data }
    }

    case 'Get Record': {
      const data = await sfRequest(
        'GET',
        `/sobjects/${ctx.config.objectType}/${ctx.config.recordId}`,
      )
      return { id: data.Id as string, success: true, data }
    }

    case 'Update Record': {
      const recordData =
        typeof ctx.config.data === 'string' ? JSON.parse(ctx.config.data) : ctx.config.data
      await sfRequest(
        'PATCH',
        `/sobjects/${ctx.config.objectType}/${ctx.config.recordId}`,
        recordData,
      )
      return { id: ctx.config.recordId, success: true, data: {} }
    }

    case 'SOQL Query': {
      const data = await sfRequest('GET', `/query?q=${encodeURIComponent(ctx.config.query)}`)
      return { id: '', success: true, data }
    }

    case 'Delete Record': {
      await sfRequest('DELETE', `/sobjects/${ctx.config.objectType}/${ctx.config.recordId}`)
      return { id: ctx.config.recordId, success: true, data: {} }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
