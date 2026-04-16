import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createD1DatabaseAdapter, createD1DrizzleDb, sqliteSchema } from '@awaitstep/db/d1'
import { createApp, createAuth } from '../index.js'
import { createTokenCrypto } from '../lib/token-crypto.js'
import { createLogger } from '../lib/logger.js'
import { buildNodeRegistry, type RegistryFile } from '../lib/node-registry.js'
import { createRemoteNodeRegistry } from '../lib/remote-node-registry.js'
import { createEmailService } from '../lib/email.js'
import registryData from '../../../../nodes/registry.json' with { type: 'json' }

const DEFAULT_REGISTRY_URL = 'https://raw.githubusercontent.com/awaitstep/awaitstep/main/registry'

export interface Env {
  DB: D1Database
  TOKEN_ENCRYPTION_KEY: string
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL?: string
  CORS_ORIGIN?: string
  RESEND_API_KEY?: string
  RESEND_FROM_EMAIL?: string
  APP_NAME?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  REGISTRY_URL?: string
  ENABLE_LOCAL_DEV?: string
}

let cached: { env: Env; baseURL: string; app: ReturnType<typeof createApp> } | null = null

async function buildApp(env: Env, baseURL: string): Promise<ReturnType<typeof createApp>> {
  const logger = createLogger('app')

  if (!env.TOKEN_ENCRYPTION_KEY) {
    throw new Error('TOKEN_ENCRYPTION_KEY secret is required')
  }
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error('BETTER_AUTH_SECRET secret is required')
  }

  const tokenCrypto = await createTokenCrypto(env.TOKEN_ENCRYPTION_KEY)
  const drizzleDb = createD1DrizzleDb(env.DB)
  const db = createD1DatabaseAdapter(env.DB, { tokenCrypto })

  let sendMagicLink:
    | ((data: { email: string; url: string; token: string }) => Promise<void>)
    | undefined
  if (env.RESEND_API_KEY) {
    const emailService = createEmailService({
      apiKey: env.RESEND_API_KEY,
      fromAddress: env.RESEND_FROM_EMAIL,
      appName: env.APP_NAME,
      appUrl: baseURL,
    })
    sendMagicLink = (data) => emailService.sendMagicLink(data)
  }

  const auth = createAuth({
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(drizzleDb, { provider: 'sqlite', schema: sqliteSchema }),
    trustedOrigins: [baseURL, ...(env.CORS_ORIGIN ? [env.CORS_ORIGIN] : [])],
    sendMagicLink,
    github: env.GITHUB_CLIENT_ID
      ? { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET! }
      : undefined,
    google: env.GOOGLE_CLIENT_ID
      ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET! }
      : undefined,
  })

  const nodeRegistry = buildNodeRegistry(registryData as unknown as RegistryFile)
  const registryUrl = env.REGISTRY_URL ?? DEFAULT_REGISTRY_URL
  const remoteNodeRegistry = createRemoteNodeRegistry({ baseUrl: registryUrl })

  return createApp({
    db,
    auth,
    logger,
    corsOrigin: env.CORS_ORIGIN ?? baseURL,
    isDev: false,
    enableLocalDev: false,
    runtime: 'workers',
    nodeRegistry,
    remoteNodeRegistry,
    appName: env.APP_NAME,
  })
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const baseURL = env.BETTER_AUTH_URL ?? new URL(request.url).origin
    if (!cached || cached.env !== env || cached.baseURL !== baseURL) {
      cached = { env, baseURL, app: await buildApp(env, baseURL) }
    }
    return cached.app.fetch(request, env, ctx)
  },
}
