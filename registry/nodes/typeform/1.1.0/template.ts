export default async function (ctx) {
  const accessToken = ctx.env.TYPEFORM_ACCESS_TOKEN
  const action = ctx.config.action
  const baseUrl = 'https://api.typeform.com'

  async function typeformRequest(method: string, path: string, body?: Record<string, unknown>) {
    const response = await fetch(`${baseUrl}${path}`, {
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
      const message = data.description as string | undefined
      throw new Error(`Typeform API error: ${message ?? response.statusText}`)
    }
    return data
  }

  switch (action) {
    case 'List Forms': {
      const data = await typeformRequest('GET', '/forms')
      return { id: null, data }
    }

    case 'Get Form': {
      const data = await typeformRequest('GET', `/forms/${ctx.config.formId}`)
      return { id: data.id as string, data }
    }

    case 'List Responses': {
      const pageSize = ctx.config.pageSize ?? 25
      const data = await typeformRequest(
        'GET',
        `/forms/${ctx.config.formId}/responses?page_size=${pageSize}`,
      )
      return { id: String(ctx.config.formId ?? ''), data }
    }

    case 'Create Form': {
      const body: Record<string, unknown> = {}
      if (ctx.config.title) body.title = ctx.config.title
      if (ctx.config.fields) {
        if (typeof ctx.config.fields === 'string') {
          try {
            body.fields = JSON.parse(ctx.config.fields)
          } catch {
            throw new Error('Invalid JSON in fields field')
          }
        } else {
          body.fields = ctx.config.fields
        }
      }
      const data = await typeformRequest('POST', '/forms', body)
      return { id: data.id as string, data }
    }

    case 'Delete Form': {
      if (!ctx.config.formId) throw new Error('Form ID is required for Delete Form')
      await typeformRequest('DELETE', `/forms/${ctx.config.formId}`)
      return { id: String(ctx.config.formId), data: {} }
    }

    case 'List Workspaces': {
      const data = await typeformRequest('GET', '/workspaces')
      return { id: null, data }
    }

    case 'Get Response': {
      if (!ctx.config.formId) throw new Error('Form ID is required for Get Response')
      if (!ctx.config.responseId) throw new Error('Response ID is required for Get Response')
      const data = await typeformRequest(
        'GET',
        `/forms/${ctx.config.formId}/responses/${ctx.config.responseId}`,
      )
      return { id: String(ctx.config.responseId), data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
