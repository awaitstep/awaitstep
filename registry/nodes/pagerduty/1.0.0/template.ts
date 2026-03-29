export default async function (ctx) {
  const apiKey = ctx.env.PAGERDUTY_API_KEY
  const action = ctx.config.action

  async function pdApi(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    extraHeaders?: Record<string, string>,
  ) {
    const headers: Record<string, string> = {
      Authorization: `Token token=${apiKey}`,
      Accept: 'application/vnd.pagerduty+json;version=2',
      ...extraHeaders,
    }
    if (body) headers['Content-Type'] = 'application/json'
    const options: RequestInit = { method, headers }
    if (body) options.body = JSON.stringify(body)
    const response = await fetch(`https://api.pagerduty.com${path}`, options)
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`PagerDuty API error (${response.status}): ${text}`)
    }
    return (await response.json()) as Record<string, unknown>
  }

  switch (action) {
    case 'Trigger Incident': {
      const routingKey = ctx.env.PAGERDUTY_ROUTING_KEY
      const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routing_key: routingKey,
          event_action: 'trigger',
          payload: {
            summary: ctx.config.title,
            severity: ctx.config.severity ?? 'error',
            source: ctx.config.serviceId ?? 'awaitstep',
            custom_details: {
              description: ctx.config.description,
            },
          },
        }),
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(`PagerDuty Events API error (${response.status}): ${text}`)
      }
      const data = (await response.json()) as Record<string, unknown>
      return {
        id: String(data.dedup_key ?? ''),
        status: String(data.status ?? 'triggered'),
        data,
      }
    }

    case 'Acknowledge Incident': {
      const data = await pdApi(
        'PUT',
        `/incidents`,
        {
          incidents: [
            {
              id: ctx.config.incidentId,
              type: 'incident_reference',
              status: 'acknowledged',
            },
          ],
        },
        { From: ctx.config.userEmail },
      )
      return {
        id: ctx.config.incidentId,
        status: 'acknowledged',
        data,
      }
    }

    case 'Resolve Incident': {
      const data = await pdApi(
        'PUT',
        `/incidents`,
        {
          incidents: [
            {
              id: ctx.config.incidentId,
              type: 'incident_reference',
              status: 'resolved',
            },
          ],
        },
        { From: ctx.config.userEmail },
      )
      return {
        id: ctx.config.incidentId,
        status: 'resolved',
        data,
      }
    }

    case 'List Incidents': {
      const data = await pdApi('GET', '/incidents')
      return { id: '', status: 'ok', data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
