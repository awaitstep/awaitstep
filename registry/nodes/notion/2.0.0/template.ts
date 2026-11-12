export default async function (ctx) {
  const apiKey = ctx.env.NOTION_API_KEY
  const action = ctx.config.action
  const notionVersion = '2026-03-11'

  async function notionRequest(method: string, path: string, body?: Record<string, unknown>) {
    const response = await fetch(`https://api.notion.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Notion-Version': notionVersion,
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
    if (typeof value !== 'string') return value
    try {
      return JSON.parse(value)
    } catch {
      throw new Error(
        'Invalid JSON input: ' + (value.length > 100 ? value.slice(0, 100) + '...' : value),
      )
    }
  }

  function dataSourceId(): string {
    const id = ctx.config.dataSourceId
    if (!id) throw new Error('Data Source ID is required for this action')
    return String(id)
  }

  switch (action) {
    case 'Create Page': {
      const body: Record<string, unknown> = {
        parent: { type: 'data_source_id', data_source_id: dataSourceId() },
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

    case 'Query Data Source': {
      const body: Record<string, unknown> = {
        page_size: ctx.config.pageSize ?? 100,
      }
      if (ctx.config.filter) body.filter = parseJson(ctx.config.filter)
      if (ctx.config.sorts) body.sorts = parseJson(ctx.config.sorts)
      const data = await notionRequest('POST', `/data_sources/${dataSourceId()}/query`, body)
      return { id: dataSourceId(), url: null, data }
    }

    case 'Get Database': {
      if (!ctx.config.databaseId) throw new Error('Database ID is required for Get Database')
      const data = await notionRequest('GET', `/databases/${ctx.config.databaseId}`)
      return { id: String(ctx.config.databaseId), url: null, data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
