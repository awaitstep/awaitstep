import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import type { ConnectionSummary } from '@awaitstep/ir'
import type { ConnectionListOptions, ConnectionListRow, ConnectionTokenCheck } from '@awaitstep/db'
import { zValidator } from '../lib/validation.js'
import { paginationQuerySchema } from '../lib/pagination.js'
import type { AppEnv } from '../types.js'
import { createLogger } from '../lib/logger.js'
import { apiKeyLevel, apiKeyProjectHome, apiKeyProjectScopes } from '../middleware/auth.js'
import { recordAudit } from '../lib/audit.js'
import { clearConnectionNotices } from '../lib/notify.js'
import { checkCredentialsGated, parseCredentials, providerNamed } from '../lib/connection-token.js'
import { BAD_ACCOUNT_ID, badAccountId, parseTokenStatus } from '../lib/connection-fields.js'

const projectsFields = {
  /** Serves every project, including ones created later. */
  allProjects: z.boolean().optional(),
  /** The projects it serves when not all of them; implies `allProjects: false`. */
  projectIds: z.array(z.string().min(1).max(100)).max(500).optional(),
}

const createConnectionSchema = z.object({
  provider: z.string().min(1).max(100),
  credentials: z.record(z.string(), z.string()),
  name: z.string().min(1).max(255),
  ...projectsFields,
})

const updateConnectionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  /** Merged into what is stored: `{ apiToken }` alone replaces the token and keeps the account. */
  credentials: z.record(z.string(), z.string()).optional(),
  ...projectsFields,
})

const listQuerySchema = paginationQuerySchema.extend({
  /** Only connections serving this project, by id or by slug. */
  projectId: z.string().min(1).optional(),
  project: z.string().min(1).optional(),
})

const INVALID_PROJECTS = { error: 'Pick projects from this organization', field: 'projects' }

/**
 * Who reads project names in the list: a person by their roles; a project or
 * workspace key its own project; an organization key as its creator now —
 * keys outlive a demotion, and must not keep the sight it took (review L1).
 */
function listReader(c: Context<AppEnv>): ConnectionListOptions['visibleTo'] {
  // A scoped key sees project names only for the projects it reaches — a
  // project key its own set, a workspace key its one project — never its
  // creator's full set (which would leak out-of-scope project identifiers).
  const level = apiKeyLevel(c)
  if (level === 'project') return { projectIds: apiKeyProjectScopes(c) }
  if (level === 'workspace') {
    const project = apiKeyProjectHome(c)
    return { projectIds: project ? [project] : [] }
  }
  return { userId: c.get('userId') }
}

/** `allProjects` / `projectIds` as the adapter takes them; a list alone narrows. */
function coverageOf(body: { allProjects?: boolean; projectIds?: string[] }) {
  if (body.allProjects === undefined && body.projectIds === undefined) return {}
  const allProjects = body.allProjects ?? false
  return { allProjects, projectIds: allProjects ? [] : (body.projectIds ?? []) }
}

export function createConnectionRoutes() {
  const connections = new Hono<AppEnv>()

  connections.get('/', zValidator('query', listQuerySchema), async (c) => {
    const { cursor, limit, projectId, project } = c.req.valid('query')
    const result = await c.get('db').listConnections(c.get('organizationId'), {
      cursor,
      limit,
      project: projectId ? { id: projectId } : project ? { slug: project } : undefined,
      visibleTo: listReader(c),
    })
    return c.json({ data: result.data.map(connectionSummary), nextCursor: result.nextCursor })
  })

  connections.post('/', zValidator('json', createConnectionSchema), async (c) => {
    const db = c.get('db')
    const organizationId = c.get('organizationId')
    const body = c.req.valid('json')
    const provider = providerNamed(body.provider)
    if (!provider) return c.json({ error: `Unsupported provider: ${body.provider}` }, 400)
    if (badAccountId(body.provider, body.credentials)) return c.json(BAD_ACCOUNT_ID, 400)

    // "Check token and connect": nothing is stored for a token the provider refuses.
    const check = await checkCredentialsGated(c, provider, body.credentials)
    if (!check.ok) return check.response

    const conn = await db.createConnection({
      id: nanoid(),
      organizationId,
      createdBy: c.get('userId'),
      provider: body.provider,
      credentials: JSON.stringify(body.credentials),
      name: body.name,
      ...coverageOf(body),
      token: check.token,
      visibleTo: listReader(c),
    })
    if (!conn) return c.json(INVALID_PROJECTS, 400)
    await recordAudit(c, {
      event: 'connection.create',
      facts: { name: body.name, provider: body.provider },
    })
    return c.json(connectionSummary(conn), 201)
  })

  connections.post(
    '/verify-token',
    zValidator(
      'json',
      z.object({
        provider: z.string().min(1),
        credentials: z.record(z.string(), z.string()),
      }),
    ),
    async (c) => {
      const body = c.req.valid('json')
      const provider = providerNamed(body.provider)
      if (!provider?.inspectCredentials) {
        return c.json({ error: `Unsupported provider: ${body.provider}` }, 400)
      }
      // Asks which accounts the token reaches. A named account is only used to
      // verify an account-owned token at it, never to refuse the check.
      const check = await checkCredentialsGated(c, provider, body.credentials, {
        listAccounts: true,
        checkAccount: false,
      })
      if (!check.ok) {
        // A refused token reads as `valid: false`, as this route always answered.
        if (check.response.status === 400) {
          return c.json({ valid: false, accounts: [], expiresAt: null })
        }
        return check.response
      }
      return c.json({
        valid: true,
        accounts: check.inspection.accounts,
        expiresAt: check.inspection.expiresAt,
      })
    },
  )

  connections.patch('/:id', zValidator('json', updateConnectionSchema), async (c) => {
    const db = c.get('db')
    const id = c.req.param('id')
    const organizationId = c.get('organizationId')
    const body = c.req.valid('json')
    const before = c.get('connection')
    if (!before) return c.json({ error: 'Not found' }, 404)

    let credentials: string | undefined
    let token: ConnectionTokenCheck | undefined
    if (body.credentials) {
      const merged = { ...parseCredentials(before.credentials), ...body.credentials }
      // Stored credentials that can't be read (another encryption key) lose the
      // account in the merge: ask for it rather than store a token without one.
      if (before.provider === 'cloudflare' && !merged.accountId) {
        return c.json(
          { error: 'Enter the account ID again with the new token', field: 'accountId' },
          400,
        )
      }
      if (badAccountId(before.provider, merged)) return c.json(BAD_ACCOUNT_ID, 400)
      const provider = providerNamed(before.provider)
      if (!provider) return c.json({ error: `Unsupported provider: ${before.provider}` }, 400)
      const check = await checkCredentialsGated(c, provider, merged)
      if (!check.ok) return check.response
      credentials = JSON.stringify(merged)
      token = check.token
    }

    const coverage = coverageOf(body)
    const conn = await db.updateConnection(id, {
      organizationId,
      ...(body.name && { name: body.name }),
      ...(credentials && { credentials, token }),
      ...coverage,
      visibleTo: listReader(c),
    })
    // The row was there when the request began (the ownership read): a write that
    // changed nothing was refused by its project list, or lost to a delete.
    if (!conn) {
      return (coverage.projectIds?.length ?? 0) > 0
        ? c.json(INVALID_PROJECTS, 400)
        : c.json({ error: 'Not found' }, 404)
    }
    // A new token: the old one's warnings no longer hold.
    if (credentials) await clearConnectionNotices(db, organizationId, id)
    const change = [
      body.name && body.name !== before.name ? `Renamed from ${before.name}` : null,
      body.credentials ? 'Credentials changed' : null,
      body.allProjects !== undefined || body.projectIds !== undefined ? 'Projects changed' : null,
    ].filter((part): part is string => part !== null)
    if (change.length > 0) {
      await recordAudit(c, {
        event: 'connection.update',
        facts: { name: conn.name, change: change.join(', ') },
      })
    }
    return c.json(connectionSummary(conn))
  })

  connections.delete('/:id', async (c) => {
    const db = c.get('db')
    // A delete that found the row already gone (a concurrent one) records nothing.
    if (await db.deleteConnection(c.req.param('id'))) {
      await clearConnectionNotices(db, c.get('organizationId'), c.req.param('id'))
      await recordAudit(c, {
        event: 'connection.delete',
        facts: { name: c.get('connection')?.name ?? c.req.param('id') },
      })
    }
    return c.json({ ok: true })
  })

  return connections
}

/** The list's row with its secrets redacted and its account named by suffix. */
function connectionSummary(row: ConnectionListRow): ConnectionSummary {
  const redacted = redactCredentials(row)
  const accountId =
    typeof redacted.credentials === 'object' ? redacted.credentials.accountId : undefined
  return {
    id: row.id,
    organizationId: row.organizationId,
    provider: row.provider,
    name: row.name,
    credentials: redacted.credentials,
    createdBy: row.createdBy,
    createdByName: row.createdByName,
    accountSuffix: accountId ? accountId.slice(-4) : null,
    allProjects: row.allProjects,
    projects: row.projects,
    hiddenProjects: row.hiddenProjects,
    tokenStatus: parseTokenStatus(row.tokenStatus),
    tokenExpiresAt: row.tokenExpiresAt,
    tokenCheckedAt: row.tokenCheckedAt,
    deployments: row.deployments,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

const SAFE_CREDENTIAL_FIELDS = new Set([
  'accountId',
  'accountName',
  'name',
  'provider',
  'region',
  'email',
])

function redactCredentials<T extends { credentials: string }>(
  conn: T,
): Omit<T, 'credentials'> & { credentials: Record<string, string> | string } {
  try {
    const creds = JSON.parse(conn.credentials) as Record<string, string>
    const redacted: Record<string, string> = {}
    for (const [key, value] of Object.entries(creds)) {
      redacted[key] = SAFE_CREDENTIAL_FIELDS.has(key) ? value : '***'
    }
    return { ...conn, credentials: redacted }
  } catch (error) {
    createLogger('redactCredentials').error('failed', error)
    return { ...conn, credentials: '****' }
  }
}
