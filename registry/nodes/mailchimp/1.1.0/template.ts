export default async function (ctx: any) {
  const apiKey = ctx.env.MAILCHIMP_API_KEY
  const action = ctx.config.action
  const dc = apiKey.split('-').pop()
  const baseUrl = `https://${dc}.api.mailchimp.com/3.0`

  async function mcRequest(method: string, path: string, body?: Record<string, unknown>) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${btoa(`apikey:${apiKey}`)}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (response.status === 204) return { data: {} }
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const detail = data.detail
      const message = typeof detail === 'string' ? detail : JSON.stringify(detail)
      throw new Error(`Mailchimp API error: ${message || response.statusText}`)
    }
    return data
  }

  function md5(input: string): string {
    const bytes = new TextEncoder().encode(input)
    const paddedLength = ((bytes.length + 8) >> 6) * 64 + 64
    const buffer = new Uint8Array(paddedLength)
    buffer.set(bytes)
    buffer[bytes.length] = 0x80
    const view = new DataView(buffer.buffer)
    view.setUint32(paddedLength - 8, (bytes.length * 8) >>> 0, true)
    view.setUint32(paddedLength - 4, Math.floor((bytes.length * 8) / 0x100000000), true)

    const shifts = [
      7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9,
      14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15,
      21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
    ]
    const constants = Array.from({ length: 64 }, (_, index) =>
      Math.floor(Math.abs(Math.sin(index + 1)) * 4294967296),
    )

    let a0 = 0x67452301
    let b0 = 0xefcdab89
    let c0 = 0x98badcfe
    let d0 = 0x10325476

    for (let offset = 0; offset < paddedLength; offset += 64) {
      const words = Array.from({ length: 16 }, (_, index) =>
        view.getUint32(offset + index * 4, true),
      )
      let a = a0
      let b = b0
      let c = c0
      let d = d0

      for (let index = 0; index < 64; index += 1) {
        let f: number
        let g: number
        if (index < 16) {
          f = (b & c) | (~b & d)
          g = index
        } else if (index < 32) {
          f = (d & b) | (~d & c)
          g = (5 * index + 1) % 16
        } else if (index < 48) {
          f = b ^ c ^ d
          g = (3 * index + 5) % 16
        } else {
          f = c ^ (b | ~d)
          g = (7 * index) % 16
        }
        const rotated = (a + f + constants[index] + words[g]) | 0
        const sum = (b + ((rotated << shifts[index]) | (rotated >>> (32 - shifts[index])))) | 0
        a = d
        d = c
        c = b
        b = sum
      }

      a0 = (a0 + a) | 0
      b0 = (b0 + b) | 0
      c0 = (c0 + c) | 0
      d0 = (d0 + d) | 0
    }

    const hex = (value: number) =>
      [0, 8, 16, 24]
        .map((shift) => ((value >>> shift) & 0xff).toString(16).padStart(2, '0'))
        .join('')
    return hex(a0) + hex(b0) + hex(c0) + hex(d0)
  }

  function subscriberHash() {
    const email = ctx.config.email
    if (!email) throw new Error('Email is required for this action')
    return md5(email.toLowerCase())
  }

  function parseMergeFields() {
    if (!ctx.config.mergeFields) return undefined
    if (typeof ctx.config.mergeFields === 'string') {
      try {
        return JSON.parse(ctx.config.mergeFields)
      } catch {
        throw new Error('Invalid JSON in Merge Fields')
      }
    }
    return ctx.config.mergeFields
  }

  switch (action) {
    case 'Add Subscriber': {
      const body: Record<string, unknown> = {
        email_address: ctx.config.email,
        status: ctx.config.status ?? 'subscribed',
      }
      const mergeFields = parseMergeFields()
      if (mergeFields) body.merge_fields = mergeFields
      const data = await mcRequest('POST', `/lists/${ctx.config.listId}/members`, body)
      return { id: String(data.id ?? ''), status: String(data.status ?? ''), data }
    }

    case 'Update Subscriber': {
      const body: Record<string, unknown> = {}
      if (ctx.config.status) body.status = ctx.config.status
      const mergeFields = parseMergeFields()
      if (mergeFields) body.merge_fields = mergeFields
      const data = await mcRequest(
        'PATCH',
        `/lists/${ctx.config.listId}/members/${subscriberHash()}`,
        body,
      )
      return { id: String(data.id ?? ''), status: String(data.status ?? ''), data }
    }

    case 'Get Subscriber': {
      const data = await mcRequest('GET', `/lists/${ctx.config.listId}/members/${subscriberHash()}`)
      return { id: String(data.id ?? ''), status: String(data.status ?? ''), data }
    }

    case 'List Members': {
      const data = await mcRequest('GET', `/lists/${ctx.config.listId}/members`)
      return { id: '', status: 'ok', data }
    }

    case 'Create Campaign': {
      const data = await mcRequest('POST', '/campaigns', {
        type: ctx.config.campaignType ?? 'regular',
        recipients: { list_id: ctx.config.listId },
        settings: {
          subject_line: ctx.config.subject,
          from_name: ctx.config.fromName,
          reply_to: ctx.config.replyTo,
        },
      })
      return { id: String(data.id ?? ''), status: String(data.status ?? ''), data }
    }

    case 'Delete Subscriber': {
      await mcRequest('DELETE', `/lists/${ctx.config.listId}/members/${subscriberHash()}`)
      return { id: String(ctx.config.email ?? ''), status: 'deleted', data: {} }
    }

    case 'Add Tag': {
      if (!ctx.config.tag) throw new Error('Tag Name is required for Add Tag')
      const data = await mcRequest(
        'POST',
        `/lists/${ctx.config.listId}/members/${subscriberHash()}/tags`,
        { tags: [{ name: ctx.config.tag, status: 'active' }] },
      )
      return { id: String(ctx.config.email ?? ''), status: 'tagged', data }
    }

    case 'Send Campaign': {
      if (!ctx.config.campaignId) throw new Error('Campaign ID is required for Send Campaign')
      const data = await mcRequest('POST', `/campaigns/${ctx.config.campaignId}/actions/send`)
      return { id: String(ctx.config.campaignId), status: 'sent', data }
    }

    case 'List Campaigns': {
      const limit = ctx.config.limit ?? 10
      const data = await mcRequest('GET', `/campaigns?count=${limit}`)
      return { id: '', status: 'ok', data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
