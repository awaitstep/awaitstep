import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import {
  PROJECT_CONNECTION_REASONS,
  type AvailableConnection,
  type ProjectConnections,
} from '@awaitstep/ir'
import { isUniqueViolation, type ProjectConnectionsRows } from '@awaitstep/db'
import { zValidator } from '../lib/validation.js'
import { recordAudit } from '../lib/audit.js'
import { clearConnectionNotices } from '../lib/notify.js'
import { checkCredentialsGated, parseCredentials, providerNamed } from '../lib/connection-token.js'
import {
  accountSuffixOf,
  authKindOf,
  credentialError,
  parseTokenStatus,
  scopesOf,
} from '../lib/connection-fields.js'
import { canDeployWithScopes } from '@awaitstep/provider-cloudflare'
import { revokeConnectionGrant } from '../lib/connection-oauth.js'
import type { AppEnv } from '../types.js'

// A project's Cloudflare accounts (23a–23c), under `/projects/:id` (the
// router's requireProjectParam). Reading is anyone's who can open the
// project; every write is its admins' and the org's owners and admins
// (`requireProjectCan('manageSettings')`, D-PC-3). An account connected here
// is always the project's own: one for the whole organization is connected on
// the org's page, by its owners and admins.

const connectionIdSchema = z.string().min(1).max(100)

const addSchema = z.object({ connectionIds: z.array(connectionIdSchema).min(1).max(50) })

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    accountId: z.string().trim().min(1).max(100),
    token: z.string().min(1).max(1000),
    makeDefault: z.boolean().default(true),
  })
  // A field this endpoint doesn't take (an old client's `share`) is refused, not ignored.
  .strict()

const updateSchema = z
  .object({
    /** A new name; on its own, a rename that touches no credentials. */
    name: z.string().trim().min(1).max(255).optional(),
    token: z.string().min(1).max(1000).optional(),
    /** A new account id with the token; the stored one is kept when omitted. */
    accountId: z.string().trim().min(1).max(100).optional(),
  })
  .strict()
  .refine((body) => body.name !== undefined || body.token !== undefined, {
    message: 'Send a name or a token',
  })
  .refine((body) => body.accountId === undefined || body.token !== undefined, {
    message: 'An account ID goes with a new token',
    path: ['accountId'],
  })

const NOT_FOUND = { error: 'Not found' }

function projectOf(c: Context<AppEnv>) {
  return { projectId: c.get('projectId')!, organizationId: c.get('organizationId') }
}

function projectConnections(rows: ProjectConnectionsRows): ProjectConnections {
  return {
    connections: rows.connections.map(({ credentials, tokenStatus, ...row }) => {
      const scopes = scopesOf(credentials)
      const authKind = authKindOf(credentials)
      const canDeploy = authKind !== 'oauth' || canDeployWithScopes(scopes)
      return {
        ...row,
        accountSuffix: accountSuffixOf(credentials),
        tokenStatus: parseTokenStatus(tokenStatus),
        authKind,
        canDeploy,
      }
    }),
    workspaces: rows.workspaces,
  }
}

/**
 * Two default changes at once on Postgres both pass their checks and one loses
 * on the one-default index: answered as a refusal, not a 500.
 */
async function unlessDefaultRace<T>(
  c: Context<AppEnv>,
  write: Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  try {
    return { ok: true, value: await write }
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    return {
      ok: false,
      response: c.json({ error: PROJECT_CONNECTION_REASONS.defaultChanged }, 409),
    }
  }
}

export const projectConnectionRoutes = new Hono<AppEnv>()

/** The project's accounts and where each workspace deploys. */
projectConnectionRoutes.get('/connections', async (c) => {
  const { projectId, organizationId } = projectOf(c)
  const rows = await c.get('db').listProjectConnections(projectId, organizationId, c.get('userId'))
  if (!rows) return c.json(NOT_FOUND, 404)
  return c.json(projectConnections(rows))
})

/** The organization's accounts as Add connection lists them: added, available, restricted. */
projectConnectionRoutes.get('/connections/available', async (c) => {
  const { projectId, organizationId } = projectOf(c)
  const rows = await c
    .get('db')
    .listAvailableProjectConnections(projectId, organizationId, c.get('userId'))
  const data: AvailableConnection[] = rows.map(({ credentials, tokenStatus, ...row }) => ({
    ...row,
    accountSuffix: accountSuffixOf(credentials),
    tokenStatus: parseTokenStatus(tokenStatus),
  }))
  return c.json({ data })
})

/** Adds organization accounts that serve the project; the first one it gets is its default. */
projectConnectionRoutes.post('/connections', zValidator('json', addSchema), async (c) => {
  const { projectId, organizationId } = projectOf(c)
  const { connectionIds } = c.req.valid('json')
  const write = await unlessDefaultRace(
    c,
    c.get('db').addProjectConnections({
      projectId,
      organizationId,
      connectionIds,
      createdBy: c.get('userId'),
    }),
  )
  if (!write.ok) return write.response
  const result = write.value
  if (result.added.length === 0) {
    // Every one already added: nothing to do, and nothing wrong with asking.
    if (result.alreadyAdded.length === new Set(connectionIds).size) {
      return c.json({ added: [], defaultId: null })
    }
    return c.json({ error: PROJECT_CONNECTION_REASONS.notAvailable }, 400)
  }
  await recordAudit(
    c,
    ...result.added.map((added) => ({
      event: 'project_connection.add' as const,
      facts: { name: added.name },
      projectId,
    })),
  )
  return c.json({ added: result.added, defaultId: result.defaultId }, 201)
})

/** Connects a new Cloudflare account from the project, its token checked first. */
projectConnectionRoutes.post('/connections/new', zValidator('json', createSchema), async (c) => {
  const { projectId, organizationId } = projectOf(c)
  const body = c.req.valid('json')
  const credentials = { accountId: body.accountId, apiToken: body.token }
  const invalid = credentialError('cloudflare', credentials)
  if (invalid) return c.json(invalid, 400)
  const provider = providerNamed('cloudflare')
  if (!provider) return c.json({ error: 'Unsupported provider: cloudflare' }, 400)

  // "Check token and connect": nothing is stored for a token Cloudflare refuses.
  const check = await checkCredentialsGated(c, provider, credentials)
  if (!check.ok) return check.response

  const write = await unlessDefaultRace(
    c,
    c.get('db').createProjectConnection({
      id: nanoid(),
      projectId,
      organizationId,
      createdBy: c.get('userId'),
      provider: 'cloudflare',
      name: body.name,
      credentials: JSON.stringify(credentials),
      token: check.token,
      makeDefault: body.makeDefault,
    }),
  )
  if (!write.ok) return write.response
  const created = write.value
  if (!created) return c.json(NOT_FOUND, 404)
  await recordAudit(c, {
    event: 'project_connection.create',
    facts: { name: body.name, summary: 'This project only' },
    projectId,
  })
  return c.json(
    {
      id: created.id,
      name: created.name,
      scope: 'project',
      isDefault: created.isDefault,
    },
    201,
  )
})

/**
 * Renames an account the project owns, or replaces its token (and optionally
 * the account id). A rename alone is one statement, the ownership in its WHERE.
 */
projectConnectionRoutes.patch(
  '/connections/:connectionId',
  zValidator('json', updateSchema),
  async (c) => {
    const { projectId, organizationId } = projectOf(c)
    const connectionId = c.req.param('connectionId')
    const body = c.req.valid('json')
    const db = c.get('db')
    if (body.token === undefined) {
      const renamed = await db.updateConnection(connectionId, {
        organizationId,
        ownedBy: projectId,
        name: body.name,
      })
      if (!renamed) return c.json({ error: PROJECT_CONNECTION_REASONS.ownedOnly }, 404)
      await recordAudit(c, {
        event: 'project_connection.update',
        facts: { name: renamed.name, change: 'Renamed' },
        projectId,
      })
      return c.json({
        id: renamed.id,
        name: renamed.name,
        tokenStatus: parseTokenStatus(renamed.tokenStatus),
        tokenExpiresAt: renamed.tokenExpiresAt,
      })
    }
    const owned = await db.getProjectOwnedConnection(connectionId, projectId)
    if (!owned) return c.json({ error: PROJECT_CONNECTION_REASONS.ownedOnly }, 404)
    if (authKindOf(owned.credentials) === 'oauth') {
      return c.json(
        { error: 'This account uses OAuth. Reconnect it instead of replacing a token.' },
        400,
      )
    }
    const merged = {
      ...parseCredentials(owned.credentials),
      apiToken: body.token,
      ...(body.accountId && { accountId: body.accountId }),
    }
    // Stored credentials that can't be read (another encryption key) lose the account in the merge.
    if (!merged.accountId) {
      return c.json(
        { error: 'Enter the account ID again with the new token', field: 'accountId' },
        400,
      )
    }
    const invalid = credentialError(owned.provider, merged)
    if (invalid) return c.json(invalid, 400)
    const provider = providerNamed(owned.provider)
    if (!provider) return c.json({ error: `Unsupported provider: ${owned.provider}` }, 400)
    const check = await checkCredentialsGated(c, provider, merged)
    if (!check.ok) return check.response

    const updated = await db.updateConnection(connectionId, {
      organizationId,
      ownedBy: projectId,
      ...(body.name !== undefined && { name: body.name }),
      credentials: JSON.stringify(merged),
      token: check.token,
    })
    // Deleted (or moved) since the read above.
    if (!updated) return c.json(NOT_FOUND, 404)
    await clearConnectionNotices(db, organizationId, connectionId)
    await recordAudit(c, {
      event: 'project_connection.update',
      facts: {
        name: updated.name,
        change: body.name !== undefined ? 'Renamed and token replaced' : 'Token replaced',
      },
      projectId,
    })
    return c.json({
      id: updated.id,
      name: updated.name,
      tokenStatus: parseTokenStatus(updated.tokenStatus),
      tokenExpiresAt: updated.tokenExpiresAt,
    })
  },
)

/**
 * Takes an account off the project: an added one leaves it, an owned one is
 * deleted. Workspaces set to it follow the project default again (D-PC-6).
 */
projectConnectionRoutes.delete('/connections/:connectionId', async (c) => {
  const { projectId, organizationId } = projectOf(c)
  const connectionId = c.req.param('connectionId')
  const db = c.get('db')
  // Read the owned row first: once removed, its credentials are gone. The
  // grant is withdrawn only if the removal actually goes through — a blocked
  // delete must leave the working account alone.
  const ownedBefore = await db.getProjectOwnedConnection(connectionId, projectId)
  const removed = await db.removeProjectConnection(projectId, connectionId)
  if (!removed) return c.json(NOT_FOUND, 404)
  if (removed.blockedBy.length > 0 || removed.blockedElsewhere > 0) {
    return c.json(
      {
        error: PROJECT_CONNECTION_REASONS.stillDeployed(
          removed.blockedBy,
          removed.blockedElsewhere,
        ),
      },
      409,
    )
  }
  if (removed.owned) {
    if (ownedBefore) await revokeConnectionGrant(c, ownedBefore)
    await clearConnectionNotices(db, organizationId, connectionId)
  }
  const change = [
    removed.owned ? 'Deleted: it belonged to this project' : null,
    removed.wasDefault ? 'Was the default' : null,
    removed.workspacesCleared > 0
      ? `${removed.workspacesCleared} workspace${removed.workspacesCleared === 1 ? '' : 's'} back on the project default`
      : null,
  ].filter((part): part is string => part !== null)
  await recordAudit(c, {
    event: 'project_connection.remove',
    facts: { name: removed.name, ...(change.length > 0 && { change: change.join(' · ') }) },
    projectId,
  })
  return c.json({ ok: true, ...removed })
})

/** Makes one of the project's accounts the one its workspaces deploy to by default. */
projectConnectionRoutes.put(
  '/default-connection',
  zValidator('json', z.object({ connectionId: connectionIdSchema })),
  async (c) => {
    const { projectId } = projectOf(c)
    const { connectionId } = c.req.valid('json')
    const write = await unlessDefaultRace(
      c,
      c.get('db').setProjectDefaultConnection(projectId, connectionId),
    )
    if (!write.ok) return write.response
    const name = write.value
    if (!name) return c.json({ error: PROJECT_CONNECTION_REASONS.notProjects }, 400)
    await recordAudit(c, { event: 'project_connection.default', facts: { name }, projectId })
    return c.json({ defaultId: connectionId })
  },
)

/** Points a workspace at one of the project's accounts, or (null) back to the project default. */
projectConnectionRoutes.put(
  '/workspaces/:workspaceId/connection',
  zValidator('json', z.object({ connectionId: connectionIdSchema.nullable() })),
  async (c) => {
    const { projectId } = projectOf(c)
    const workspaceId = c.req.param('workspaceId')
    const { connectionId } = c.req.valid('json')
    const result = await c.get('db').setWorkspaceConnection({
      projectId,
      workspaceId,
      connectionId,
      setBy: c.get('userId'),
    })
    if (result.workspaceName === null) return c.json(NOT_FOUND, 404)
    if (connectionId !== null && result.connectionName === null) {
      return c.json({ error: PROJECT_CONNECTION_REASONS.notProjects }, 400)
    }
    if (result.changed) {
      await recordAudit(c, {
        event: 'workspace_connection.set',
        facts: {
          name: result.workspaceName,
          change:
            connectionId === null
              ? 'Follows the project default'
              : `Deploys to ${result.connectionName}`,
        },
        projectId,
        workspaceId,
      })
    }
    return c.json({ workspaceId, connectionId })
  },
)
