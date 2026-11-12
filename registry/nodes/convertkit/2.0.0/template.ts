export default async function (ctx: any) {
  const apiKey = ctx.env.KIT_API_KEY
  const action = ctx.config.action
  const baseUrl = 'https://api.kit.com/v4'

  async function kitRequest(method: string, path: string, body?: Record<string, unknown>) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'X-Kit-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (response.status === 204) return {}
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const errors = data.errors as string[] | undefined
      throw new Error(`Kit API error: ${errors?.[0] ?? response.statusText}`)
    }
    return data
  }

  function requireEmail(): string {
    const email = ctx.config.email
    if (!email) throw new Error('Email is required for this action')
    return String(email)
  }

  function subscriberId(data: Record<string, unknown>): string {
    const subscriber = data.subscriber as { id?: number | string } | undefined
    return subscriber?.id === undefined ? '' : String(subscriber.id)
  }

  switch (action) {
    case 'Add Subscriber': {
      const body: Record<string, unknown> = { email_address: requireEmail() }
      if (ctx.config.firstName) body.first_name = ctx.config.firstName
      const data = await kitRequest('POST', '/subscribers', body)
      return { id: subscriberId(data), data }
    }

    case 'Tag Subscriber': {
      if (!ctx.config.tagId) throw new Error('Tag ID is required for Tag Subscriber')
      const data = await kitRequest('POST', `/tags/${ctx.config.tagId}/subscribers`, {
        email_address: requireEmail(),
      })
      return { id: subscriberId(data), data }
    }

    case 'List Subscribers': {
      const status = String(ctx.config.statusFilter ?? 'active')
      const limit = ctx.config.limit ?? 50
      const query =
        status === 'all'
          ? `per_page=${limit}`
          : `status=${encodeURIComponent(status)}&per_page=${limit}`
      const data = await kitRequest('GET', `/subscribers?${query}`)
      return { id: '', data }
    }

    case 'Remove Tag': {
      if (!ctx.config.tagId) throw new Error('Tag ID is required for Remove Tag')
      const email = encodeURIComponent(requireEmail())
      const data = await kitRequest(
        'DELETE',
        `/tags/${ctx.config.tagId}/subscribers?email_address=${email}`,
      )
      return { id: requireEmail(), data }
    }

    case 'Add to Sequence': {
      if (!ctx.config.sequenceId) throw new Error('Sequence ID is required for Add to Sequence')
      const data = await kitRequest('POST', `/sequences/${ctx.config.sequenceId}/subscribers`, {
        email_address: requireEmail(),
      })
      return { id: subscriberId(data), data }
    }

    case 'Get Subscriber': {
      const email = encodeURIComponent(requireEmail())
      const data = await kitRequest('GET', `/subscribers?email_address=${email}`)
      const subscribers = data.subscribers as Array<{ id?: number | string }> | undefined
      const id = subscribers?.[0]?.id
      return { id: id === undefined ? '' : String(id), data }
    }

    case 'List Tags': {
      const data = await kitRequest('GET', '/tags')
      return { id: '', data }
    }

    case 'List Forms': {
      const data = await kitRequest('GET', '/forms')
      return { id: '', data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
