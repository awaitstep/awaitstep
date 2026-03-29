export default async function (ctx) {
  const apiToken = ctx.env.REPLICATE_API_TOKEN
  const action = ctx.config.action
  const baseUrl = 'https://api.replicate.com/v1'

  async function replicateRequest(path: string, method = 'GET', body?: Record<string, unknown>) {
    const headers: Record<string, string> = { Authorization: `Bearer ${apiToken}` }
    if (body) headers['Content-Type'] = 'application/json'
    const options: RequestInit = {
      method,
      headers,
    }
    if (body) options.body = JSON.stringify(body)
    const response = await fetch(`${baseUrl}${path}`, options)
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const detail = data.detail as string | undefined
      throw new Error(`Replicate API error: ${detail ?? response.statusText}`)
    }
    return data
  }

  switch (action) {
    case 'Create Prediction': {
      const modelStr = ctx.config.model as string
      const [owner_name, versionPart] = modelStr.split(':')
      const body: Record<string, unknown> = {
        input: ctx.config.input ?? {},
      }
      if (versionPart) {
        body.version = versionPart
      } else {
        body.model = owner_name
      }
      const data = await replicateRequest('/predictions', 'POST', body)
      return { id: data.id as string, status: data.status as string, data }
    }

    case 'Get Prediction': {
      const data = await replicateRequest(`/predictions/${ctx.config.predictionId}`)
      return { id: data.id as string, status: data.status as string, data }
    }

    case 'Cancel Prediction': {
      const data = await replicateRequest(`/predictions/${ctx.config.predictionId}/cancel`, 'POST')
      return { id: data.id as string, status: data.status as string, data }
    }

    case 'List Predictions': {
      const data = await replicateRequest('/predictions')
      return { id: '', status: '', data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
