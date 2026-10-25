import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createD1DatabaseAdapter, createD1DrizzleDb, sqliteSchema } from '@awaitstep/db/d1'
import { createApp, createAuth } from '../index.js'
import { createTokenCrypto } from '../lib/token-crypto.js'
import { createLogger } from '../lib/logger.js'
import { buildNodeRegistry, type RegistryFile } from '../lib/node-registry.js'
import { createRemoteNodeRegistry } from '../lib/remote-node-registry.js'
import { createEmailService } from '../lib/email.js'
import { syncActiveRuns } from '../lib/run-sync.js'
import { SandboxWranglerDeployer, SandboxTestSessionRunner } from '@awaitstep/provider-cloudflare'
import { testSessionLimitsFromEnv } from '../lib/test-session-env.js'
import { reapTestSessions } from '../lib/test-sessions.js'
import { containerSleepAfter, resolveTestSessionLimits } from '../lib/test-session-policy.js'
import { getSandbox, type Sandbox } from '@cloudflare/sandbox'
import registryData from '../../../../nodes/registry.json' with { type: 'json' }

// Re-export Sandbox DO class — required by wrangler when containers config is enabled.
// If the SANDBOX binding is not configured, this export is unused and harmless.
export { Sandbox } from '@cloudflare/sandbox'

const DEFAULT_REGISTRY_URL = 'https://raw.githubusercontent.com/awaitstep/awaitstep/main/registry'

export interface Env {
  DB: D1Database
  SANDBOX: DurableObjectNamespace<Sandbox>
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
  SANDBOX_DEPLOY_TIMEOUT?: string
  SANDBOX_SLEEP_AFTER?: string
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
    ((data: { email: string; url: string; token: string }) => Promise<void>) | undefined
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

  const sleepAfter = env.SANDBOX_SLEEP_AFTER ?? '5m'
  const maxDeployMs = env.SANDBOX_DEPLOY_TIMEOUT
    ? parseInt(env.SANDBOX_DEPLOY_TIMEOUT, 10) * 1000
    : undefined

  const deployer = new SandboxWranglerDeployer(
    (id: string) => getSandbox(env.SANDBOX, id, { sleepAfter }),
    maxDeployMs ? { maxDeployMs } : undefined,
  )

  const testSessionLimits = testSessionLimitsFromEnv(
    env as unknown as Record<string, string | undefined>,
  )
  const sessionSleepAfter = containerSleepAfter(resolveTestSessionLimits(testSessionLimits))

  return createApp({
    db,
    auth,
    logger,
    corsOrigin: env.CORS_ORIGIN ?? baseURL,
    isDev: false,
    enableLocalDev: false,
    runtime: 'workers',
    // Cloudflare's edge writes cf-connecting-ip on every request; the web
    // Worker forwards it across the service binding.
    clientIpPolicy: { mode: 'edge', header: 'cf-connecting-ip' },
    nodeRegistry,
    remoteNodeRegistry,
    appName: env.APP_NAME,
    deployer,
    // A test session's container must outlast the session's idle window, so
    // the runner asks for its own sleepAfter rather than the deploy's.
    // Every call takes the session's own window: falling back to the
    // deploy's five minutes on any call without options reset the container
    // to sleep long before the session expires.
    testSessionRunner: new SandboxTestSessionRunner(
      (id, options) =>
        getSandbox(env.SANDBOX, id, { sleepAfter: options?.sleepAfter ?? sessionSleepAfter }),
      { sleepAfter: sessionSleepAfter },
    ),
    testSessionLimits,
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

  // Cron-driven counterpart of serve.ts's interval loop: reconciles run
  // status and per-step telemetry so API reads stay pure DB queries.
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const tokenCrypto = await createTokenCrypto(env.TOKEN_ENCRYPTION_KEY)
    const db = createD1DatabaseAdapter(env.DB, { tokenCrypto })
    // Nothing in a Worker survives between requests, so the cron is where
    // expired sessions get stopped.
    const limits = resolveTestSessionLimits(
      testSessionLimitsFromEnv(env as unknown as Record<string, string | undefined>),
    )
    const sleepAfter = containerSleepAfter(limits)
    // allSettled, not all: one task rejecting would otherwise end the other
    // one's waitUntil partway through, leaving sessions unreaped.
    ctx.waitUntil(
      Promise.allSettled([
        syncActiveRuns(db),
        reapTestSessions({
          db,
          runner: new SandboxTestSessionRunner(
            (id, options) =>
              getSandbox(env.SANDBOX, id, { sleepAfter: options?.sleepAfter ?? sleepAfter }),
            { sleepAfter },
          ),
          limits,
        }),
      ]),
    )
  },
}
