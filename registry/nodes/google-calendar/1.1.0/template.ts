export default async function (ctx) {
  const token = ctx.env.GOOGLE_CALENDAR_ACCESS_TOKEN
  const action = ctx.config.action
  const calendarId = encodeURIComponent(ctx.config.calendarId ?? 'primary')
  const calendarBase = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`

  async function calendarFetch(url: string, method: string, body?: unknown) {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (method === 'DELETE' && response.ok) return {}
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const err = data.error as { message?: string } | undefined
      throw new Error(`Google Calendar API error: ${err?.message ?? response.statusText}`)
    }
    return data
  }

  async function calendarApi(method: string, path: string, body?: unknown) {
    return calendarFetch(`${calendarBase}${path}`, method, body)
  }

  switch (action) {
    case 'Create Event': {
      const body: Record<string, unknown> = {
        summary: ctx.config.summary,
        start: { dateTime: ctx.config.startTime },
        end: { dateTime: ctx.config.endTime },
      }
      if (ctx.config.description) body.description = ctx.config.description
      if (ctx.config.location) body.location = ctx.config.location
      const data = await calendarApi('POST', '', body)
      return { id: data.id, status: data.status, data }
    }

    case 'Get Event': {
      const data = await calendarApi('GET', `/${ctx.config.eventId}`)
      return { id: data.id, status: data.status, data }
    }

    case 'Update Event': {
      const body: Record<string, unknown> = {}
      if (ctx.config.summary) body.summary = ctx.config.summary
      if (ctx.config.description) body.description = ctx.config.description
      if (ctx.config.startTime) body.start = { dateTime: ctx.config.startTime }
      if (ctx.config.endTime) body.end = { dateTime: ctx.config.endTime }
      if (ctx.config.location) body.location = ctx.config.location
      const data = await calendarApi('PATCH', `/${ctx.config.eventId}`, body)
      return { id: data.id, status: data.status, data }
    }

    case 'Delete Event': {
      await calendarApi('DELETE', `/${ctx.config.eventId}`)
      return { id: ctx.config.eventId, status: 'cancelled', data: {} }
    }

    case 'List Events': {
      const params = new URLSearchParams()
      if (ctx.config.timeMin) params.set('timeMin', String(ctx.config.timeMin))
      if (ctx.config.timeMax) params.set('timeMax', String(ctx.config.timeMax))
      params.set('maxResults', String(ctx.config.maxResults ?? 50))
      params.set('singleEvents', 'true')
      params.set('orderBy', 'startTime')
      const data = await calendarApi('GET', `?${params.toString()}`)
      return { id: null, status: 'ok', data }
    }

    case 'List Calendars': {
      const data = await calendarFetch(
        'https://www.googleapis.com/calendar/v3/users/me/calendarList',
        'GET',
      )
      return { id: null, status: 'ok', data }
    }

    case 'Quick Add Event': {
      if (!ctx.config.quickAddText) {
        throw new Error('Quick Add Text is required for Quick Add Event')
      }
      const params = new URLSearchParams({ text: String(ctx.config.quickAddText) })
      const data = await calendarApi('POST', `/quickAdd?${params.toString()}`)
      return { id: data.id, status: data.status, data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
