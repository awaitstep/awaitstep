import type { Ctx, Output } from './ctx'

export default async function (ctx: Ctx): Promise<Output> {
  const action = ctx.config.action as string
  const city = ctx.config.city as string
  const apiKey = ctx.env.WEATHER_API_KEY

  const response = await fetch(
    `https://api.example.com/${action === 'Forecast' ? 'forecast' : 'current'}?city=${encodeURIComponent(city)}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  )
  const data = (await response.json()) as { temperature?: number; message?: string }
  if (!response.ok) {
    throw new Error(`Weather API ${response.status}: ${data.message ?? 'request failed'}`)
  }
  return { temperature: data.temperature ?? null, data }
}
