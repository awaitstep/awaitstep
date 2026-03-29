export default async function (ctx) {
  const writeKey = ctx.env.SEGMENT_WRITE_KEY
  const action = ctx.config.action

  async function segmentApi(endpoint: string, body: Record<string, unknown>) {
    const response = await fetch(`https://api.segment.io/v1/${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(writeKey + ':')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Segment API error (${response.status}): ${text}`)
    }
    const data = (await response.json()) as Record<string, unknown>
    return data
  }

  function parseJson(value: unknown): unknown {
    return typeof value === 'string' ? JSON.parse(value) : value
  }

  const base: Record<string, unknown> = {}
  if (ctx.config.userId) base.userId = ctx.config.userId
  if (ctx.config.anonymousId) base.anonymousId = ctx.config.anonymousId

  switch (action) {
    case 'Track Event': {
      const data = await segmentApi('track', {
        ...base,
        event: ctx.config.event,
        properties: ctx.config.properties ? parseJson(ctx.config.properties) : {},
      })
      return { success: true, data }
    }

    case 'Identify User': {
      const data = await segmentApi('identify', {
        ...base,
        traits: ctx.config.traits ? parseJson(ctx.config.traits) : {},
      })
      return { success: true, data }
    }

    case 'Group': {
      const data = await segmentApi('group', {
        ...base,
        groupId: ctx.config.groupId,
        traits: ctx.config.traits ? parseJson(ctx.config.traits) : {},
      })
      return { success: true, data }
    }

    case 'Page': {
      const data = await segmentApi('page', {
        ...base,
        name: ctx.config.name,
        properties: ctx.config.properties ? parseJson(ctx.config.properties) : {},
      })
      return { success: true, data }
    }

    case 'Screen': {
      const data = await segmentApi('screen', {
        ...base,
        name: ctx.config.name,
        properties: ctx.config.properties ? parseJson(ctx.config.properties) : {},
      })
      return { success: true, data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
