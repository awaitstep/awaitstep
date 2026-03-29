export default async function (ctx) {
  const restUrl = ctx.env.UPSTASH_REDIS_REST_URL
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

  switch (action) {
    case 'GET': {
      const data = await redisCommand(['GET', ctx.config.key])
      return { result: String(data.result ?? ''), data }
    }

    case 'SET': {
      const cmd: (string | number)[] = ['SET', ctx.config.key, ctx.config.value]
      if (ctx.config.ex) {
        cmd.push('EX', ctx.config.ex)
      }
      const data = await redisCommand(cmd)
      return { result: String(data.result ?? ''), data }
    }

    case 'DEL': {
      const data = await redisCommand(['DEL', ctx.config.key])
      return { result: String(data.result ?? ''), data }
    }

    case 'HSET': {
      const data = await redisCommand(['HSET', ctx.config.key, ctx.config.field, ctx.config.value])
      return { result: String(data.result ?? ''), data }
    }

    case 'HGET': {
      const data = await redisCommand(['HGET', ctx.config.key, ctx.config.field])
      return { result: String(data.result ?? ''), data }
    }

    case 'LPUSH': {
      const data = await redisCommand(['LPUSH', ctx.config.key, ctx.config.value])
      return { result: String(data.result ?? ''), data }
    }

    case 'LRANGE': {
      const data = await redisCommand([
        'LRANGE',
        ctx.config.key,
        ctx.config.start ?? 0,
        ctx.config.stop ?? -1,
      ])
      return { result: String(data.result ?? ''), data }
    }

    case 'INCR': {
      const data = await redisCommand(['INCR', ctx.config.key])
      return { result: String(data.result ?? ''), data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
