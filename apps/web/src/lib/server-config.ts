import { z } from 'zod'

const serverConfigSchema = z.object({
  apiBase: z.url(),
})

type ServerConfig = z.infer<typeof serverConfigSchema>

let config: ServerConfig | null = null

export function getServerConfig(): ServerConfig {
  if (config) return config

  config = serverConfigSchema.parse({
    apiBase: import.meta.env.VITE_API_URL || `http://localhost:${process.env.PORT || 8080}`,
  })

  return config
}

export function getApiBase(): string {
  return getServerConfig().apiBase
}
