export default async function (ctx) {
  const apiKey = ctx.env.NOTION_API_KEY
  const action = ctx.config.action

  async function notionRequest(method: string, path: string, body?: Record<string, unknown>) {
    const response = await fetch(`https://api.notion.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(`Notion API error: ${(data.message as string) ?? response.statusText}`)
    }
    return data
  }

  function parseJson(value: unknown): unknown {
    return typeof value === 'string' ? JSON.parse(value) : value
  }

  switch (action) {
    case 'Create Page': {
      const body: Record<string, unknown> = {
        parent: { database_id: ctx.config.databaseId },
        properties: parseJson(ctx.config.properties) ?? {},
      }
      if (ctx.config.content) {
        body.children = [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ type: 'text', text: { content: ctx.config.content } }],
            },
          },
        ]
      }
      const data = await notionRequest('POST', '/pages', body)
      return { id: data.id, url: data.url, data }
    }

    case 'Get Page': {
      const data = await notionRequest('GET', `/pages/${ctx.config.pageId}`)
      return { id: data.id, url: data.url, data }
    }

    case 'Update Page': {
      const data = await notionRequest('PATCH', `/pages/${ctx.config.pageId}`, {
        properties: parseJson(ctx.config.properties) ?? {},
      })
      return { id: data.id, url: data.url, data }
    }

    case 'Query Database': {
      const body: Record<string, unknown> = {}
      if (ctx.config.filter) body.filter = parseJson(ctx.config.filter)
      if (ctx.config.sorts) body.sorts = parseJson(ctx.config.sorts)
      const data = await notionRequest('POST', `/databases/${ctx.config.databaseId}/query`, body)
      return { id: ctx.config.databaseId, url: null, data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
