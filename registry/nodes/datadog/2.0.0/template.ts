export default async function (ctx) {
  const apiKey = ctx.env.DATADOG_API_KEY
  const action = ctx.config.action
  const site = ctx.config.site ?? 'datadoghq.com'

  async function ddApi(url: string, method: string, body?: unknown) {
    const headers: Record<string, string> = {
      'DD-API-KEY': apiKey,
      'Content-Type': 'application/json',
    }
    if (ctx.env.DATADOG_APP_KEY) {
      headers['DD-APPLICATION-KEY'] = ctx.env.DATADOG_APP_KEY
    }
    const options: RequestInit = { method, headers }
    if (body) options.body = JSON.stringify(body)
    const response = await fetch(url, options)
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Datadog API error (${response.status}): ${text}`)
    }
    return (await response.json()) as Record<string, unknown>
  }

  function parseTags(tags?: unknown): string[] {
    if (!tags) return []
    return String(tags)
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
  }

  function nowSeconds(): number {
    return Math.floor(Date.now() / 1000)
  }

  switch (action) {
    case 'Submit Metrics': {
      const data = await ddApi(`https://api.${site}/api/v2/series`, 'POST', {
        series: [
          {
            metric: ctx.config.metricName,
            type:
              (ctx.config.metricType ?? 'gauge') === 'count'
                ? 1
                : ctx.config.metricType === 'rate'
                  ? 2
                  : 3,
            points: [{ timestamp: nowSeconds(), value: ctx.config.metricValue }],
            tags: parseTags(ctx.config.tags),
            ...(ctx.config.hostname
              ? { resources: [{ name: ctx.config.hostname, type: 'host' }] }
              : {}),
          },
        ],
      })
      return { status: 'ok', data }
    }

    case 'Create Event': {
      const data = await ddApi(`https://api.${site}/api/v1/events`, 'POST', {
        title: ctx.config.title,
        text: ctx.config.text,
        alert_type: ctx.config.alertType ?? 'info',
        tags: parseTags(ctx.config.tags),
        ...(ctx.config.hostname ? { host: ctx.config.hostname } : {}),
      })
      return { status: 'ok', data }
    }

    case 'Send Logs': {
      const data = await ddApi(`https://http-intake.logs.${site}/api/v2/logs`, 'POST', [
        {
          message: ctx.config.text,
          ddsource: ctx.config.source ?? 'awaitstep',
          ddtags: ctx.config.tags ?? '',
          ...(ctx.config.hostname ? { hostname: ctx.config.hostname } : {}),
        },
      ])
      return { status: 'ok', data }
    }

    case 'List Monitors': {
      const data = await ddApi(`https://api.${site}/api/v1/monitor`, 'GET')
      return { status: 'ok', data: { monitors: data } }
    }

    case 'Query Metrics': {
      if (!ctx.config.query) throw new Error('Metrics Query is required for Query Metrics')
      const from = ctx.config.fromTime ?? nowSeconds() - 3600
      const to = ctx.config.toTime ?? nowSeconds()
      const params = new URLSearchParams({
        from: String(from),
        to: String(to),
        query: String(ctx.config.query),
      })
      const data = await ddApi(`https://api.${site}/api/v1/query?${params.toString()}`, 'GET')
      return { status: 'ok', data }
    }

    case 'List Events': {
      const params = new URLSearchParams()
      if (ctx.config.fromTime) params.set('start', String(ctx.config.fromTime))
      if (ctx.config.toTime) params.set('end', String(ctx.config.toTime))
      const query = params.toString() ? `?${params.toString()}` : ''
      const data = await ddApi(`https://api.${site}/api/v1/events${query}`, 'GET')
      return { status: 'ok', data }
    }

    case 'Mute Monitor': {
      if (!ctx.config.monitorId) throw new Error('Monitor ID is required for Mute Monitor')
      const data = await ddApi(
        `https://api.${site}/api/v1/monitor/${ctx.config.monitorId}/mute`,
        'POST',
      )
      return { status: 'ok', data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
