import { recordAccountEvent, recordOrganizationUpdate, recordSignIn } from '../lib/audit.js'
import { runMaintenance } from '../lib/maintenance.js'
import type { DrizzleDatabaseAdapter } from '@awaitstep/db'
import {
  workerDatabase,
  type WorkerDatabase,
  type WorkerDatabaseBindings,
} from './worker-database.js'
import { organizationCreated, useExtensionHooks } from '../lib/extension-hooks.js'
import { createApp, createAuth, type AppDeps } from '../index.js'
import type { AppExtension, ExtensionsPackage } from '../types.js'
import { checkExtensions } from '../lib/extensions.js'
import { useExtensionProviders } from '../lib/provider-registry.js'
import { checkOAuthReturnPath } from '../lib/oauth-return-path.js'
import { accountProvidersOf, type AuthOptions } from '../auth/config.js'
import { createTokenCrypto } from '../lib/token-crypto.js'
import { createLogger } from '../lib/logger.js'
import { parseAppOrigins } from '../lib/app-origins.js'
import { imageStoreFromEnv } from '../lib/image-store-env.js'
import { discardOwnerImages } from '../lib/images.js'
import { buildNodeRegistry, type RegistryFile } from '../lib/node-registry.js'
import { createRemoteNodeRegistry } from '../lib/remote-node-registry.js'
import {
  ACCESS_REASONS,
  checkDisabledFeatures,
  deleteBlockedReason,
  type OssFeature,
} from '@awaitstep/ir'
import { createAppEmails, createEmailService, type EmailService } from '../lib/email.js'
import { checkPublicRunUrl } from '../lib/public-run-url.js'
import { syncActiveRuns } from '../lib/run-sync.js'
import {
  settleRun,
  tellFunctionsFailed,
  type FailedCall,
  type RecordedRun,
} from '../lib/run-settle.js'
import { SandboxWranglerDeployer, SandboxTestSessionRunner } from '@awaitstep/provider-cloudflare'
import { testSessionLimitsFromEnv } from '../lib/test-session-env.js'
import { reapTestSessions } from '../lib/test-sessions.js'
import { containerSleepAfter, resolveTestSessionLimits } from '../lib/test-session-policy.js'
import { cloudflareOAuthFromEnv } from '../lib/cloudflare-oauth-config.js'
import { createConnectionRefresh } from '../lib/connection-refresh.js'
import { getSandbox, type Sandbox } from '@cloudflare/sandbox'
import registryData from '../../../../nodes/registry.json' with { type: 'json' }

const DEFAULT_REGISTRY_URL = 'https://raw.githubusercontent.com/awaitstep/awaitstep/main/registry'

export interface Env extends WorkerDatabaseBindings {
  SANDBOX: DurableObjectNamespace<Sandbox>
  TOKEN_ENCRYPTION_KEY: string
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL?: string
  /** The app's origin, or a comma-separated list of them; the first is the dashboard's. */
  CORS_ORIGIN?: string
  /** The web app's origin, for invite links; defaults to CORS_ORIGIN's first, then the API's URL. */
  WEB_URL?: string
  /** `1` logs invite links instead of sending them when RESEND_API_KEY is unset — QA only. */
  LOG_EMAIL_LINKS?: string
  RESEND_API_KEY?: string
  RESEND_FROM_EMAIL?: string
  APP_NAME?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  /** Self-managed Cloudflare OAuth client; unset, Connections offers API tokens only. */
  CLOUDFLARE_OAUTH_CLIENT_ID?: string
  CLOUDFLARE_OAUTH_CLIENT_SECRET?: string
  /** The registered callback; defaults to `<BETTER_AUTH_URL>/api/oauth/cloudflare/callback`. */
  CLOUDFLARE_OAUTH_REDIRECT_URI?: string
  /** Space- or comma-separated OAuth scope IDs; defaults to the deploy minimum. */
  CLOUDFLARE_OAUTH_SCOPES?: string
  REGISTRY_URL?: string
  SANDBOX_DEPLOY_TIMEOUT?: string
  SANDBOX_SLEEP_AFTER?: string
  /**
   * `s3` keeps uploaded photos and logos in R2 through its S3 API (the
   * cloud's setting); unset, D1 keeps them in the image rows.
   */
  IMAGE_STORE?: string
  /** `https://<account-id>.r2.cloudflarestorage.com` for R2. */
  S3_ENDPOINT?: string
  S3_BUCKET?: string
  S3_ACCESS_KEY_ID?: string
  S3_SECRET_ACCESS_KEY?: string
  /** `auto` for R2 (the default). */
  S3_REGION?: string
}

/** The image store this deployment's settings ask for. */
function workerImageStore(env: Env, db: DrizzleDatabaseAdapter) {
  return imageStoreFromEnv(env as unknown as Record<string, string | undefined>, db)
}

/** The first tick of an hour (the cron fires every minute). */
function isTopOfHour(scheduledTime: number): boolean {
  return new Date(scheduledTime).getUTCMinutes() === 0
}

/** The web origin links are built on when no request supplies one (the cron). */
function cronWebOrigin(env: Env): string | undefined {
  return env.WEB_URL ?? parseAppOrigins(env.CORS_ORIGIN)[0] ?? env.BETTER_AUTH_URL
}

/** The app's mail for this deployment: Resend when a key is set, else logged. */
function workerEmails(env: Env, baseURL: string, logger: ReturnType<typeof createLogger>) {
  const webUrl = env.WEB_URL || parseAppOrigins(env.CORS_ORIGIN)[0] || baseURL
  let emailService: EmailService | null = null
  let sendMagicLink:
    ((data: { email: string; url: string; token: string }) => Promise<void>) | undefined
  if (env.RESEND_API_KEY) {
    emailService = createEmailService({
      apiKey: env.RESEND_API_KEY,
      fromAddress: env.RESEND_FROM_EMAIL,
      appName: env.APP_NAME,
      appUrl: webUrl,
    })
    const service = emailService
    sendMagicLink = (data) => service.sendMagicLink(data)
  }
  const emails = createAppEmails({
    webUrl,
    service: emailService,
    logLinks: env.LOG_EMAIL_LINKS === '1',
    log: (message) => logger.warn(message),
    // A link the flag asks to see is the point of its line: it is logged as is.
    logLink: (message) => logger.warnAsIs(message),
  })
  return { emails, sendMagicLink }
}

/**
 * Everything `createApp` needs on Workers, built from the Worker's bindings,
 * and the database scope its requests run in: an entry that builds its own
 * app must run every request (and cron run) inside `database.run`, or a
 * Postgres-backed app refuses its queries. A wrapping entry adds its own
 * deps (extensions) on top.
 */
export async function buildWorkerDeps(
  env: Env,
  baseURL: string,
): Promise<{ deps: AppDeps; database: WorkerDatabase }> {
  const logger = createLogger('app')

  if (!env.TOKEN_ENCRYPTION_KEY) {
    throw new Error('TOKEN_ENCRYPTION_KEY secret is required')
  }
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error('BETTER_AUTH_SECRET secret is required')
  }

  const tokenCrypto = await createTokenCrypto(env.TOKEN_ENCRYPTION_KEY)
  const cloudflareOAuth = cloudflareOAuthFromEnv(
    env as unknown as Record<string, string | undefined>,
    {
      baseURL,
      isDev: false,
      originConfigured: Boolean(env.BETTER_AUTH_URL || env.WEB_URL || env.CORS_ORIGIN),
    },
  )
  const database = workerDatabase(env, {
    tokenCrypto,
    refreshConnection: createConnectionRefresh(cloudflareOAuth),
  })
  const db = database.db
  const imageStore = workerImageStore(env, db)

  const { emails, sendMagicLink } = workerEmails(env, baseURL, logger)

  const authOptions: AuthOptions = {
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    deleteOrganizationProblem: async (organizationId) => {
      const left = await db.countProjectsInOrganization(organizationId)
      return left > 0 ? ACCESS_REASONS.projectsLeft(left) : null
    },
    onSessionCreated: (session) => recordSignIn(db, session),
    onOrganizationCreated: (data) => organizationCreated(db, data),
    onOrganizationUpdated: (data) => recordOrganizationUpdate(db, data),
    deleteUserProblem: async (userId) => deleteBlockedReason(await db.soleOwnedOrgNames(userId)),
    onAccountEvent: (event) => recordAccountEvent(db, event),
    onImageOwnerDeleted: (owner) => discardOwnerImages(db, imageStore, owner),
    database: database.authDatabase,
    trustedOrigins: [...new Set([baseURL, ...parseAppOrigins(env.CORS_ORIGIN)])],
    sendMagicLink,
    github: env.GITHUB_CLIENT_ID
      ? { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET! }
      : undefined,
    google: env.GOOGLE_CLIENT_ID
      ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET! }
      : undefined,
  }
  const auth = createAuth(authOptions)

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

  const appOrigins = parseAppOrigins(env.CORS_ORIGIN)

  const deps: AppDeps = {
    accountProviders: accountProvidersOf(authOptions),
    db,
    auth,
    logger,
    corsOrigin: appOrigins.length > 0 ? appOrigins : baseURL,
    isDev: false,
    enableLocalDev: false,
    runtime: 'workers',
    // A Worker has no stub: only a real client in the environment turns the
    // OAuth routes on.
    cloudflareOAuth,
    webUrl: env.WEB_URL || appOrigins[0] || baseURL,
    // Cloudflare's edge writes cf-connecting-ip on every request; the web
    // Worker forwards it across the service binding.
    clientIpPolicy: { mode: 'edge', header: 'cf-connecting-ip' },
    nodeRegistry,
    remoteNodeRegistry,
    appName: env.APP_NAME,
    deployer,
    testSessionRunner: testSessionRunnerFor(env, sessionSleepAfter),
    testSessionLimits,
    emails,
    imageStore,
  }
  return { deps, database }
}

// A test session's container must outlast the session's idle window, so the
// runner asks for its own sleepAfter rather than the deploy's. Every call takes
// the session's own window: falling back to the deploy's five minutes on any
// call without options reset the container to sleep long before the session
// expired. The request path and the cron reaper both build the runner here so
// their container lifetimes cannot drift apart.
function testSessionRunnerFor(env: Env, sleepAfter: string): SandboxTestSessionRunner {
  return new SandboxTestSessionRunner(
    (id, options) => getSandbox(env.SANDBOX, id, { sleepAfter: options?.sleepAfter ?? sleepAfter }),
    { sleepAfter },
  )
}

/** The database for work no request started (the cron, a queue). */
async function backgroundDatabase(env: Env): Promise<WorkerDatabase> {
  const tokenCrypto = await createTokenCrypto(env.TOKEN_ENCRYPTION_KEY)
  const cloudflareOAuth = cloudflareOAuthFromEnv(
    env as unknown as Record<string, string | undefined>,
    {
      baseURL: cronWebOrigin(env) ?? 'http://localhost',
      isDev: false,
      originConfigured: Boolean(env.BETTER_AUTH_URL || env.WEB_URL || env.CORS_ORIGIN),
    },
  )
  return workerDatabase(env, {
    tokenCrypto,
    refreshConnection: createConnectionRefresh(cloudflareOAuth),
  })
}

/** Mail for that work: none without a configured web origin, when links would be relative. */
function backgroundEmails(env: Env) {
  const origin = cronWebOrigin(env)
  return origin ? workerEmails(env, origin, createLogger('cron')).emails : undefined
}

/**
 * Brings recorded runs up to date outside a request, for an entry that hears
 * of them itself (a provider that reports its own runs' ends): each run is
 * read from its provider, and a failure told to its watchers. Answers each
 * run's status in order; null where the run could not be read.
 */
export async function settleRecordedRuns(
  env: Env,
  runs: readonly RecordedRun[],
): Promise<Array<string | null>> {
  const database = await backgroundDatabase(env)
  const emails = backgroundEmails(env)
  return database.run(() =>
    Promise.all(runs.map((run) => settleRun(database.db, run, emails).catch(() => null))),
  )
}

/**
 * Tells the watchers of functions whose calls failed, for an entry that
 * counts calls instead of recording them (no run to settle). Never throws:
 * a notice not sent costs the caller nothing.
 */
export async function tellCallsFailed(env: Env, calls: readonly FailedCall[]): Promise<void> {
  if (calls.length === 0) return
  try {
    const database = await backgroundDatabase(env)
    const emails = backgroundEmails(env)
    await database.run(() => tellFunctionsFailed(database.db, calls, emails))
  } catch (error) {
    // The calls are counted; their notice is the only thing lost.
    createLogger('queue').error('Failed calls could not be told', { error: String(error) })
  }
}

export type { FailedCall }

/**
 * What a Worker entry plugs in: the extensions package's own export, so the
 * Worker and the dev server read one shape. The public Worker passes nothing.
 */
export type WorkerOptions = Partial<ExtensionsPackage>

/**
 * The options as `createApp` takes them, checked: a malformed set throws.
 * Installs the extensions' providers here, at module load, and not only in
 * `createApp`: the cron handler never builds the app, and resolves providers.
 */
export function workerAppOptions(options: WorkerOptions): {
  extensions: readonly AppExtension[]
  disabledFeatures: readonly OssFeature[]
  oauthReturnPath?: string
  acceptedAuth?: ExtensionsPackage['acceptedAuth']
  publicRunUrl?: string
} {
  const extensions = options.extensions ?? []
  checkExtensions(extensions)
  useExtensionProviders(extensions)
  useExtensionHooks(extensions)
  return {
    extensions,
    disabledFeatures: checkDisabledFeatures(options.disabled ?? []),
    ...(options.oauthReturnPath !== undefined && {
      oauthReturnPath: checkOAuthReturnPath(options.oauthReturnPath),
    }),
    ...(options.acceptedAuth !== undefined && { acceptedAuth: options.acceptedAuth }),
    ...(options.publicRunUrl !== undefined && {
      publicRunUrl: checkPublicRunUrl(options.publicRunUrl),
    }),
  }
}

/**
 * The Worker's handlers. The public Worker is `createWorker()`; an entry that
 * plugs features in exports `createWorker(extensionsPackage)` as its default
 * instead, and must also `export { Sandbox } from '@cloudflare/sandbox'`, as
 * `worker.ts` does — wrangler refuses the containers config without it.
 * A malformed set of extensions, an unknown switch or a return path that could
 * leave the web app throws here, at module load.
 */
export function createWorker(options: WorkerOptions = {}) {
  const appOptions = workerAppOptions(options)
  let cached: {
    env: Env
    baseURL: string
    app: ReturnType<typeof createApp>
    database: WorkerDatabase
  } | null = null

  return {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      const baseURL = env.BETTER_AUTH_URL ?? new URL(request.url).origin
      if (!cached || cached.env !== env || cached.baseURL !== baseURL) {
        const { deps, database } = await buildWorkerDeps(env, baseURL)
        cached = { env, baseURL, app: createApp({ ...deps, ...appOptions }), database }
      }
      const { app, database } = cached
      // Everything the request starts, a streamed body included, runs on its own connections.
      return database.run(() => app.fetch(request, env, ctx))
    },

    // Cron-driven counterpart of serve.ts's interval loop: reconciles run
    // status and per-step telemetry so API reads stay pure DB queries.
    async scheduled(
      controller: ScheduledController,
      env: Env,
      ctx: ExecutionContext,
    ): Promise<void> {
      const database = await backgroundDatabase(env)
      const db = database.db
      // Nothing in a Worker survives between requests, so the cron is where
      // expired sessions get stopped.
      const limits = resolveTestSessionLimits(
        testSessionLimitsFromEnv(env as unknown as Record<string, string | undefined>),
      )
      const sleepAfter = containerSleepAfter(limits)
      // allSettled, not all: one task rejecting would otherwise end the others'
      // waitUntil partway through, leaving sessions unreaped.
      ctx.waitUntil(
        database.run(() =>
          Promise.allSettled([
            // No request here, so no origin to fall back on: without a configured
            // web origin the links would be relative, and failures go to the Inbox only.
            syncActiveRuns(db, { emails: backgroundEmails(env) }),
            // The cron runs every minute; the purges and the expiry check need an hour.
            isTopOfHour(controller.scheduledTime)
              ? runMaintenance(db, new Date(), workerImageStore(env, db))
              : Promise.resolve(),
            reapTestSessions({
              db,
              runner: testSessionRunnerFor(env, sleepAfter),
              limits,
            }),
          ]),
        ),
      )
    },
  } satisfies ExportedHandler<Env>
}
