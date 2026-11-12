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
      const modelStr = ctx.config.model
      if (!modelStr) throw new Error('Model is required for Create Prediction')
      const [owner_name, versionPart] = String(modelStr).split(':')
      const body: Record<string, unknown> = {
        input: ctx.config.input ?? {},
      }
      if (versionPart) {
        body.version = versionPart
      } else {
        body.model = owner_name
      }
      const data = await replicateRequest('/predictions', 'POST', body)
      return { id: String(data.id ?? ''), status: String(data.status ?? ''), data }
    }

    case 'Get Prediction': {
      const data = await replicateRequest(`/predictions/${ctx.config.predictionId}`)
      return { id: String(data.id ?? ''), status: String(data.status ?? ''), data }
    }

    case 'Cancel Prediction': {
      const data = await replicateRequest(`/predictions/${ctx.config.predictionId}/cancel`, 'POST')
      return { id: String(data.id ?? ''), status: String(data.status ?? ''), data }
    }

    case 'List Predictions': {
      const data = await replicateRequest('/predictions')
      return { id: '', status: '', data: { items: data } }
    }

    case 'List Models': {
      const data = await replicateRequest('/models')
      return { id: '', status: '', data }
    }

    case 'Get Model': {
      if (!ctx.config.model) throw new Error('Model is required for Get Model')
      const data = await replicateRequest(`/models/${ctx.config.model}`)
      return { id: String(data.id ?? ''), status: '', data }
    }

    case 'List Deployments': {
      const data = await replicateRequest('/deployments')
      return { id: '', status: '', data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
