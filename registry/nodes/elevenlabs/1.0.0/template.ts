export default async function (ctx) {
  const apiKey = ctx.env.ELEVENLABS_API_KEY
  const action = ctx.config.action
  const baseUrl = 'https://api.elevenlabs.io/v1'

  async function elevenlabsJsonRequest(
    path: string,
    method = 'GET',
    body?: Record<string, unknown>,
  ) {
    const options: RequestInit = {
      method,
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    }
    if (body) options.body = JSON.stringify(body)
    const response = await fetch(`${baseUrl}${path}`, options)
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const detail = data.detail as { message?: string } | string | undefined
      const message =
        typeof detail === 'string' ? detail : (detail as { message?: string })?.message
      throw new Error(`ElevenLabs API error: ${message ?? response.statusText}`)
    }
    return data
  }

  switch (action) {
    case 'Text to Speech': {
      const body: Record<string, unknown> = {
        text: ctx.config.text,
        model_id: ctx.config.modelId ?? 'eleven_multilingual_v2',
      }
      const voiceSettings: Record<string, unknown> = {}
      if (ctx.config.stability != null) voiceSettings.stability = ctx.config.stability
      if (ctx.config.similarityBoost != null)
        voiceSettings.similarity_boost = ctx.config.similarityBoost
      if (Object.keys(voiceSettings).length > 0) body.voice_settings = voiceSettings
      const response = await fetch(`${baseUrl}/text-to-speech/${ctx.config.voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const errorData = (await response.json()) as Record<string, unknown>
        const detail = errorData.detail as { message?: string } | string | undefined
        const message =
          typeof detail === 'string' ? detail : (detail as { message?: string })?.message
        throw new Error(`ElevenLabs API error: ${message ?? response.statusText}`)
      }
      const contentType = response.headers.get('content-type') ?? 'audio/mpeg'
      const buf = await response.arrayBuffer()
      const bytes = new Uint8Array(buf)
      const binary = Array.from(bytes)
        .map((b) => String.fromCharCode(b))
        .join('')
      const audio = btoa(binary)
      return { audio, contentType, data: { byteLength: buf.byteLength } }
    }

    case 'List Voices': {
      const data = await elevenlabsJsonRequest('/voices')
      const voices = data.voices as Array<{ voice_id: string; name: string }>
      return { audio: '', contentType: '', data: { voices } }
    }

    case 'Get Voice': {
      const data = await elevenlabsJsonRequest(`/voices/${ctx.config.voiceId}`)
      return { audio: '', contentType: '', data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
