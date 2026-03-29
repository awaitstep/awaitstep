export default async function (ctx) {
  const apiKey = ctx.env.TRELLO_API_KEY
  const apiToken = ctx.env.TRELLO_API_TOKEN
  const action = ctx.config.action

  function authParams() {
    return `key=${apiKey}&token=${apiToken}`
  }

  async function trelloApi(method: string, path: string, body?: Record<string, unknown>) {
    const separator = path.includes('?') ? '&' : '?'
    const url = `https://api.trello.com/1${path}${separator}${authParams()}`
    const headers: Record<string, string> = {}
    if (body) headers['Content-Type'] = 'application/json'
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(`Trello API error: ${(data.message as string) ?? response.statusText}`)
    }
    return data
  }

  switch (action) {
    case 'Create Card': {
      const body: Record<string, unknown> = {
        idList: ctx.config.listId,
        name: ctx.config.name,
      }
      if (ctx.config.description) body.desc = ctx.config.description
      const data = await trelloApi('POST', '/cards', body)
      return { id: data.id as string, status: 'created', data }
    }

    case 'Get Card': {
      const data = await trelloApi('GET', `/cards/${ctx.config.cardId}`)
      return { id: data.id as string, status: 'ok', data }
    }

    case 'Update Card': {
      const body: Record<string, unknown> = {}
      if (ctx.config.name) body.name = ctx.config.name
      if (ctx.config.description) body.desc = ctx.config.description
      const data = await trelloApi('PUT', `/cards/${ctx.config.cardId}`, body)
      return { id: data.id as string, status: 'updated', data }
    }

    case 'List Cards': {
      const data = await trelloApi('GET', `/lists/${ctx.config.listId}/cards`)
      return { id: null, status: 'ok', data }
    }

    case 'Move Card': {
      const data = await trelloApi('PUT', `/cards/${ctx.config.cardId}`, {
        idList: ctx.config.targetListId,
      })
      return { id: data.id as string, status: 'moved', data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
