export default async function (ctx: any) {
  function upstashUrl(): string {
    const raw = String(ctx.env.UPSTASH_REDIS_REST_URL ?? '')
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      throw new Error('UPSTASH_REDIS_REST_URL must be a valid URL')
    }
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.upstash.io')) {
      throw new Error('UPSTASH_REDIS_REST_URL must be an https://*.upstash.io URL')
    }
    return url.origin
  }

  const restUrl = upstashUrl()
  const restToken = ctx.env.UPSTASH_REDIS_REST_TOKEN
  const action = ctx.config.action

  async function redisCommand(command: (string | number)[]) {
    const response = await fetch(restUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${restToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Upstash Redis error (${response.status}): ${text}`)
    }
    return (await response.json()) as { result: unknown }
  }

  function serialise(value: unknown): string {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    return JSON.stringify(value)
  }

  switch (action) {
    case 'GET': {
      const data = await redisCommand(['GET', String(ctx.config.key)])
      return { result: serialise(data.result), data }
    }

    case 'SET': {
      const cmd: (string | number)[] = [
        'SET',
        String(ctx.config.key),
        String(ctx.config.value ?? ''),
      ]
      if (ctx.config.ex) cmd.push('EX', Number(ctx.config.ex))
      const data = await redisCommand(cmd)
      return { result: serialise(data.result), data }
    }

    case 'DEL': {
      const data = await redisCommand(['DEL', String(ctx.config.key)])
      return { result: serialise(data.result), data }
    }

    case 'HSET': {
      const data = await redisCommand([
        'HSET',
        String(ctx.config.key),
        String(ctx.config.field ?? ''),
        String(ctx.config.value ?? ''),
      ])
      return { result: serialise(data.result), data }
    }

    case 'HGET': {
      const data = await redisCommand([
        'HGET',
        String(ctx.config.key),
        String(ctx.config.field ?? ''),
      ])
      return { result: serialise(data.result), data }
    }

    case 'LPUSH': {
      const data = await redisCommand([
        'LPUSH',
        String(ctx.config.key),
        String(ctx.config.value ?? ''),
      ])
      return { result: serialise(data.result), data }
    }

    case 'LRANGE': {
      const data = await redisCommand([
        'LRANGE',
        String(ctx.config.key),
        Number(ctx.config.start ?? 0),
        Number(ctx.config.stop ?? -1),
      ])
      return { result: serialise(data.result), data }
    }

    case 'INCR': {
      const data = await redisCommand(['INCR', String(ctx.config.key)])
      return { result: serialise(data.result), data }
    }

    case 'EXISTS': {
      const data = await redisCommand(['EXISTS', String(ctx.config.key)])
      return { result: serialise(data.result), data }
    }

    case 'EXPIRE': {
      const data = await redisCommand([
        'EXPIRE',
        String(ctx.config.key),
        Number(ctx.config.ex ?? 60),
      ])
      return { result: serialise(data.result), data }
    }

    case 'INCRBY': {
      const data = await redisCommand([
        'INCRBY',
        String(ctx.config.key),
        Number(ctx.config.value ?? 1),
      ])
      return { result: serialise(data.result), data }
    }

    case 'SCAN': {
      const cmd: (string | number)[] = ['SCAN', String(ctx.config.cursor ?? '0')]
      if (ctx.config.pattern) cmd.push('MATCH', String(ctx.config.pattern))
      cmd.push('COUNT', Number(ctx.config.count ?? 100))
      const data = await redisCommand(cmd)
      return { result: serialise(data.result), data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
