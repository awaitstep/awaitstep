export default async function (ctx) {
  const authToken = ctx.env.SENTRY_AUTH_TOKEN
  const action = ctx.config.action
  const org = ctx.config.organization

  async function sentryApi(method: string, path: string, body?: Record<string, unknown>) {
    const options: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    }
    if (body) options.body = JSON.stringify(body)
    const response = await fetch(`https://sentry.io/api/0${path}`, options)
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Sentry API error (${response.status}): ${text}`)
    }
    return (await response.json()) as any
  }

  switch (action) {
    case 'List Issues': {
      const data = await sentryApi('GET', `/projects/${org}/${ctx.config.project}/issues/`)
      return { id: '', status: 'ok', data }
    }

    case 'Get Issue': {
      const data = await sentryApi('GET', `/issues/${ctx.config.issueId}/`)
      return {
        id: String(data.id ?? ''),
        status: String(data.status ?? ''),
        data,
      }
    }

    case 'Resolve Issue': {
      const data = await sentryApi('PUT', `/issues/${ctx.config.issueId}/`, { status: 'resolved' })
      return {
        id: String(data.id ?? ''),
        status: 'resolved',
        data,
      }
    }

    case 'List Events': {
      const data = await sentryApi('GET', `/projects/${org}/${ctx.config.project}/events/`)
      return { id: '', status: 'ok', data }
    }

    case 'Create Release': {
      const data = await sentryApi('POST', `/organizations/${org}/releases/`, {
        version: ctx.config.releaseVersion,
        projects: [ctx.config.project],
      })
      return {
        id: String(data.version ?? ''),
        status: 'created',
        data,
      }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
