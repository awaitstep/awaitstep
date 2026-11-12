export default async function (ctx) {
  const apiKey = ctx.env.ELEVENLABS_API_KEY
  const action = ctx.config.action
  const baseUrl = 'https://api.elevenlabs.io'
  const outputFormat = ctx.config.outputFormat ?? 'mp3_44100_128'

  async function elevenlabsJsonRequest(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const detail = data.detail as { message?: string } | string | undefined
      const message =
        typeof detail === 'string' ? detail : (detail as { message?: string })?.message
      throw new Error(`ElevenLabs API error: ${message ?? response.statusText}`)
    }
    return data
  }

  async function audioResponse(response: Response) {
    if (!response.ok) {
      const errorData = (await response.json()) as Record<string, unknown>
      const detail = errorData.detail as { message?: string } | string | undefined
      const message =
        typeof detail === 'string' ? detail : (detail as { message?: string })?.message
      throw new Error(`ElevenLabs API error: ${message ?? response.statusText}`)
    }
    const contentType = response.headers.get('content-type') ?? 'audio/mpeg'
    const buffer = await response.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    const chunkSize = 0x8000
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
    }
    return { audio: btoa(binary), contentType, data: { byteLength: buffer.byteLength } }
  }

  switch (action) {
    case 'Text to Speech': {
      if (!ctx.config.voiceId) throw new Error('Voice ID is required for Text to Speech')
      if (!ctx.config.text) throw new Error('Text is required for Text to Speech')
      const body: Record<string, unknown> = {
        text: ctx.config.text,
        model_id: ctx.config.modelId ?? 'eleven_v4',
      }
      const voiceSettings: Record<string, unknown> = {}
      if (ctx.config.stability != null) voiceSettings.stability = ctx.config.stability
      if (ctx.config.similarityBoost != null) {
        voiceSettings.similarity_boost = ctx.config.similarityBoost
      }
      if (Object.keys(voiceSettings).length > 0) body.voice_settings = voiceSettings
      const response = await fetch(
        `${baseUrl}/v1/text-to-speech/${ctx.config.voiceId}?output_format=${outputFormat}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      )
      return audioResponse(response)
    }

    case 'List Voices': {
      const data = await elevenlabsJsonRequest('GET', '/v2/voices')
      return { audio: '', contentType: '', data }
    }

    case 'Get Voice': {
      if (!ctx.config.voiceId) throw new Error('Voice ID is required for Get Voice')
      const data = await elevenlabsJsonRequest('GET', `/v1/voices/${ctx.config.voiceId}`)
      return { audio: '', contentType: '', data }
    }

    case 'List Models': {
      const data = await elevenlabsJsonRequest('GET', '/v1/models')
      return { audio: '', contentType: '', data }
    }

    case 'Sound Effects': {
      if (!ctx.config.text) throw new Error('Text is required for Sound Effects')
      const body: Record<string, unknown> = {
        text: ctx.config.text,
        model_id: 'eleven_text_to_sound_v3',
      }
      if (ctx.config.durationSeconds) body.duration_seconds = ctx.config.durationSeconds
      const response = await fetch(`${baseUrl}/v1/sound-generation?output_format=${outputFormat}`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      return audioResponse(response)
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
