import { Hono, type Context } from 'hono'
import { nanoid } from 'nanoid'
import {
  authorizationUrl,
  CloudflareOAuthError,
  createOAuthState,
  createPkcePair,
  exchangeAuthorizationCode,
  listAuthorizedAccounts,
  type CloudflareOAuthTokens,
  revokeToken,
} from '@awaitstep/provider-cloudflare'
import type { AppEnv } from '../types.js'
import type { CloudflareOAuthRuntime } from '../lib/cloudflare-oauth-config.js'
import { parseOrgRole } from '../lib/org-role.js'
import { createLogger } from '../lib/logger.js'
import { recordAudit } from '../lib/audit.js'
import { parseCredentials } from '../lib/connection-token.js'
import { clearConnectionNotices } from '../lib/notify.js'
import { authKindOf } from '../lib/connection-fields.js'
import { orgCapabilities, projectCapabilities, resolveRoles, UNLOCKED_PROJECT } from '@awaitstep/ir'

const log = createLogger('cloudflare-oauth')

/** How long a pending authorization may sit before the callback refuses it. */
const STATE_TTL_MS = 10 * 60_000
/** A small ceiling so a loop of starts cannot grow the map without bound. */
const MAX_PENDING = 500
const MAX_PENDING_PER_USER = 5
const MAX_PENDING_PER_ORG = 50

interface PendingAuthorization {
  orgId: string
  orgSlug: string
  userId: string
  codeVerifier: string
  /** Set when the flow re-authorizes an existing OAuth connection in place. */
  connectionId?: string
  /** Set when the account is the project's own (or becomes a workspace's default). */
  projectId?: string
  projectSlug?: string
  workspaceId?: string
  createdAt: number
}

interface Options {
  config: CloudflareOAuthRuntime
  /** The web app's origin, where the callback sends the browser back. */
  webUrl: string
}

/**
 * Whether this deployment can start an OAuth connection, for the page to
 * choose between "Connect with Cloudflare" and the API-token dialog. Always
 * mounted; the start/callback routes only exist when a client is configured.
 */
export function createCloudflareOAuthStatusRoutes(config?: CloudflareOAuthRuntime) {
  const routes = new Hono<AppEnv>()
  routes.get('/status', (c) => c.json({ enabled: Boolean(config) }))
  return routes
}

/**
 * The Cloudflare OAuth connection flow: a `start` that sends the browser to
 * authorize, and a `callback` that exchanges the code. A callback with no
 * connection in its state creates one; with a connection it re-authorizes
 * that row in place, so reconnecting never leaves a duplicate.
 */
export function createCloudflareOAuthRoutes(options: Options) {
  const pending = new Map<string, PendingAuthorization>()

  const prune = () => {
    const cutoff = Date.now() - STATE_TTL_MS
    for (const [state, entry] of pending) {
      if (entry.createdAt < cutoff) pending.delete(state)
    }
  }

  const resultUrl = (
    orgSlug: string,
    params: Record<string, string>,
    projectSlug?: string,
  ): string => {
    const base = options.webUrl.replace(/\/+$/, '')
    const query = new URLSearchParams(params).toString()
    const project = projectSlug ? `${encodeURIComponent(projectSlug)}/` : ''
    return `${base}/${encodeURIComponent(orgSlug)}/${project}connections?${query}`
  }

  // The replaced authorization is withdrawn so the person's Cloudflare
  // profile doesn't keep a dead grant. A failure is logged, never fatal.
  const revokePrevious = async (
    before: { credentials: string } | null,
    nextRefresh: string | undefined,
  ) => {
    const previous = before ? parseCredentials(before.credentials).refreshToken : undefined
    if (!previous || previous === nextRefresh) return
    await revokeToken(options.config, previous, 'refresh_token').catch((error: unknown) => {
      log.warn('Cloudflare OAuth old grant revoke failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }

  // A grant exchanged but not stored is withdrawn at once: otherwise the
  // person's Cloudflare account keeps an authorization nothing here can revoke.
  const revokeIssued = async (tokens: CloudflareOAuthTokens | undefined) => {
    if (!tokens) return
    const token = tokens.refreshToken ?? tokens.accessToken
    await revokeToken(
      options.config,
      token,
      tokens.refreshToken ? 'refresh_token' : 'access_token',
    ).catch((error: unknown) => {
      log.warn('Cloudflare OAuth issued-grant revoke failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }

  /**
   * The start checked manageSettings once. Re-check at callback: a person
   * removed or demoted in the ten minutes between still holds a valid state,
   * and must not be able to bind an account after losing the right to.
   */
  const stillAllowed = async (c: Context<AppEnv>, entry: PendingAuthorization) => {
    if (entry.projectId) {
      const found = await c
        .get('db')
        .getProjectIfMember(
          c.get('userId'),
          { id: entry.projectId },
          entry.workspaceId ? { id: entry.workspaceId } : undefined,
        )
      if (!found || found.project.organizationId !== entry.orgId) return false
      const roles = resolveRoles({
        orgRole: found.orgRole ? parseOrgRole(found.orgRole) : null,
        projectGrant: found.projectGrant,
        workspaceGrant: found.workspaceGrant,
      })
      return projectCapabilities(roles.projectRole, UNLOCKED_PROJECT, roles.orgRole).manageSettings
        .allowed
    }
    const org = await c.get('db').getOrganizationIfMember(c.get('userId'), { id: entry.orgId })
    return Boolean(org && orgCapabilities(parseOrgRole(org.role)).manageSettings.allowed)
  }

  const errorPage = (message: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Authorization failed</title>
<style>body{font:15px/1.5 ui-sans-serif,system-ui,sans-serif;max-width:520px;margin:64px auto;padding:0 20px;color:#1c1f24}</style>
</head><body><h1>Authorization failed</h1><p>${message}</p>
<p>Close this tab and try again from AwaitStep's Connections page.</p></body></html>`

  const routes = new Hono<AppEnv>()

  routes.get('/start', async (c) => {
    const orgSlug = c.req.query('org')
    if (!orgSlug) return c.json({ error: 'Missing org query parameter' }, 400)

    const projectSlugParam = c.req.query('project')
    const workspaceSlugParam = c.req.query('workspace')
    const workspaceIdParam = c.req.query('workspaceId')
    if ((workspaceSlugParam || workspaceIdParam) && !projectSlugParam) {
      return c.json({ error: 'A workspace connection also names its project' }, 400)
    }

    // An organization account is the org admins'; a project account (or a
    // workspace's default) is the project's admins'. The page only draws the
    // button for them, and the URL must not be the way around it. A project
    // start resolves the org through the project read, not a second read.
    let orgId: string
    let project: { id: string; slug: string } | undefined
    let workspaceId: string | undefined
    if (projectSlugParam) {
      const found = await c
        .get('db')
        .getProjectIfMember(
          c.get('userId'),
          { org: orgSlug, slug: projectSlugParam },
          workspaceIdParam
            ? { id: workspaceIdParam }
            : workspaceSlugParam
              ? { slug: workspaceSlugParam }
              : undefined,
        )
      if (!found) return c.json({ error: 'Not found' }, 404)
      const roles = resolveRoles({
        orgRole: found.orgRole ? parseOrgRole(found.orgRole) : null,
        projectGrant: found.projectGrant,
        workspaceGrant: found.workspaceGrant,
      })
      const can = projectCapabilities(
        roles.projectRole,
        UNLOCKED_PROJECT,
        roles.orgRole,
      ).manageSettings
      if (!can.allowed) return c.json({ error: can.reason ?? 'Forbidden' }, 403)
      orgId = found.project.organizationId
      project = { id: found.project.id, slug: found.project.slug }
      workspaceId = found.workspace?.id
    } else {
      const org = await c.get('db').getOrganizationIfMember(c.get('userId'), { slug: orgSlug })
      if (!org) return c.json({ error: 'Not found' }, 404)
      const can = orgCapabilities(parseOrgRole(org.role)).manageSettings
      if (!can.allowed) return c.json({ error: can.reason ?? 'Forbidden' }, 403)
      orgId = org.id
    }

    // Reconnecting names the row to update, never a second row. An org page
    // reconnects an organization account, a project page its own; an API
    // token is replaced through its own dialog.
    const connectionId = c.req.query('connection')
    let reconnect: string | undefined
    if (connectionId) {
      const existing = await c.get('db').getProviderConnectionById(connectionId, orgId)
      const rightPlace = project ? existing?.projectId === project.id : existing?.projectId === null
      if (!existing || !rightPlace) {
        return c.json({ error: 'Not found' }, 404)
      }
      if (authKindOf(existing.credentials) !== 'oauth') {
        return c.json(
          { error: 'That connection uses an API token. Replace the token instead.' },
          400,
        )
      }
      reconnect = existing.id
    }

    prune()
    const mine = [...pending.values()].filter((entry) => entry.userId === c.get('userId')).length
    const forOrg = [...pending.values()].filter((entry) => entry.orgId === orgId).length
    if (
      pending.size >= MAX_PENDING ||
      mine >= MAX_PENDING_PER_USER ||
      forOrg >= MAX_PENDING_PER_ORG
    ) {
      return c.json({ error: 'Too many authorizations are pending. Try again in a minute.' }, 429)
    }

    const state = createOAuthState()
    const pkce = await createPkcePair()
    pending.set(state, {
      orgId,
      orgSlug,
      userId: c.get('userId'),
      codeVerifier: pkce.verifier,
      ...(reconnect && { connectionId: reconnect }),
      ...(project && { projectId: project.id, projectSlug: project.slug }),
      ...(workspaceId && { workspaceId }),
      createdAt: Date.now(),
    })
    log.info('Cloudflare OAuth start', { org: orgSlug, stub: options.config.stub })
    return c.redirect(
      // A stored connection needs a refresh token, which `offline_access`
      // asks for. The stub keeps no token and the stub client has no refresh
      // grant, so it is requested only for a real client.
      authorizationUrl(options.config, {
        state,
        codeChallenge: pkce.challenge,
        offlineAccess: !options.config.stub,
      }),
      302,
    )
  })

  routes.get('/callback', async (c) => {
    const state = c.req.query('state')
    const entry = state ? pending.get(state) : undefined
    if (!state || !entry) {
      return c.html(
        errorPage('This authorization link expired. Start again from the Connections page.'),
        400,
      )
    }
    pending.delete(state)

    if (Date.now() - entry.createdAt > STATE_TTL_MS) {
      return c.html(
        errorPage('This authorization took too long. Start again from the Connections page.'),
        400,
      )
    }
    if (entry.userId !== c.get('userId')) {
      return c.html(
        errorPage('This authorization belongs to a different session. Start again.'),
        400,
      )
    }

    const refusal = c.req.query('error')
    if (refusal) {
      const description = c.req.query('error_description') ?? refusal
      log.info('Cloudflare OAuth refused', {
        org: entry.orgSlug,
        reason: refusal,
        description,
      })
      // Only the user declining is a cancellation. `invalid_scope` and the
      // rest are configuration refusals, and saying "cancelled" hides that.
      const outcome = refusal === 'access_denied' ? 'denied' : 'error'
      return c.redirect(
        resultUrl(entry.orgSlug, { oauth: outcome, reason: refusal }, entry.projectSlug),
        302,
      )
    }

    const code = c.req.query('code')
    if (!code) {
      return c.redirect(
        resultUrl(entry.orgSlug, { oauth: 'error', reason: 'code' }, entry.projectSlug),
        302,
      )
    }

    if (!(await stillAllowed(c, entry))) {
      log.warn('Cloudflare OAuth refused: no longer allowed', { org: entry.orgSlug })
      return c.redirect(
        resultUrl(entry.orgSlug, { oauth: 'error', reason: 'forbidden' }, entry.projectSlug),
        302,
      )
    }

    let tokens: CloudflareOAuthTokens | undefined
    try {
      tokens = await exchangeAuthorizationCode(options.config, {
        code,
        codeVerifier: entry.codeVerifier,
      })
      const accounts = await listAuthorizedAccounts(options.config, tokens.accessToken)
      if (accounts.length === 0) {
        log.warn('Cloudflare OAuth reached no accounts', {
          org: entry.orgSlug,
          stub: options.config.stub,
        })
        await revokeIssued(tokens)
        return c.redirect(
          resultUrl(entry.orgSlug, { oauth: 'error', reason: 'no_accounts' }, entry.projectSlug),
          302,
        )
      }
      if (accounts.length > 1) {
        // One account per connection: taking the first would bind a grant
        // covering accounts the person may not have meant to share.
        log.warn('Cloudflare OAuth grant covers several accounts', { org: entry.orgSlug })
        await revokeIssued(tokens)
        return c.redirect(
          resultUrl(
            entry.orgSlug,
            { oauth: 'error', reason: 'multiple_accounts' },
            entry.projectSlug,
          ),
          302,
        )
      }
      const account = accounts[0]!
      // The audit row and the connection both belong to the org the start
      // named; `/oauth` carries no `?org=`, so set it here.
      c.set('organizationId', entry.orgId)
      log.info('Cloudflare OAuth authorized', {
        org: entry.orgSlug,
        account: account.name,
        stub: options.config.stub,
        expiresIn: tokens.expiresIn,
        refreshToken: tokens.refreshToken !== null,
      })

      // The stub's tokens mean nothing to Cloudflare, so a connection made
      // from them would be a row deploy and the health check could only fail
      // on. A real grant is stored.
      let connected = false
      if (!options.config.stub) {
        const checkedAt = new Date().toISOString()
        const ttl = tokens.expiresIn > 0 ? tokens.expiresIn : 3600
        const expiresAt = new Date(Date.now() + ttl * 1000).toISOString()
        const credentials = {
          authKind: 'oauth',
          accountId: account.id,
          apiToken: tokens.accessToken,
          ...(tokens.refreshToken && { refreshToken: tokens.refreshToken }),
          ...(expiresAt && { expiresAt }),
          // OAuth says the granted scope equals the requested one when the
          // response omits it. Store that rather than leaving the card unable
          // to tell whether a deploy scope is missing.
          scopes: tokens.scope || options.config.scopes.join(' '),
        }
        try {
          if (entry.projectId) {
            let connectionId = entry.connectionId
            let createdHere = false
            if (connectionId) {
              const before = await c.get('db').getProviderConnectionById(connectionId)
              if (
                before &&
                parseCredentials(before.credentials).accountId &&
                parseCredentials(before.credentials).accountId !== account.id
              ) {
                throw new Error('A different Cloudflare account was authorized')
              }
              const updated = await c.get('db').updateConnection(connectionId, {
                organizationId: entry.orgId,
                credentials: JSON.stringify(credentials),
                // The row carries no expiry: the access token's hour is in the credentials
                // and renewed on read; putting it on the row would fire the expiry notice.
                token: { status: 'active', expiresAt: null, checkedAt },
              })
              if (!updated) throw new Error('The connection is no longer there')
              await revokePrevious(before, credentials.refreshToken)
              await recordAudit(c, {
                event: 'connection.update',
                facts: { name: updated.name, change: 'Reconnected with OAuth' },
                projectId: entry.projectId,
              })
              await clearConnectionNotices(c.get('db'), entry.orgId, connectionId)
            } else {
              const created = await c.get('db').createProjectConnection({
                id: nanoid(),
                projectId: entry.projectId,
                organizationId: entry.orgId,
                createdBy: entry.userId,
                provider: 'cloudflare',
                name: account.name,
                credentials: JSON.stringify(credentials),
                // The row carries no expiry: the access token's hour is in the credentials
                // and renewed on read; putting it on the row would fire the expiry notice.
                token: { status: 'active', expiresAt: null, checkedAt },
                // A workspace-scoped connect makes the account that
                // workspace's default; it does not change the project's.
                makeDefault: !entry.workspaceId,
              })
              if (!created) throw new Error('The project did not take the connection')
              connectionId = created.id
              createdHere = true
              await recordAudit(c, {
                event: 'project_connection.create',
                facts: { name: account.name, summary: 'This project only' },
                projectId: entry.projectId,
              })
            }
            if (entry.workspaceId && connectionId) {
              const change = await c.get('db').setWorkspaceConnection({
                projectId: entry.projectId,
                workspaceId: entry.workspaceId,
                connectionId,
                setBy: entry.userId,
              })
              if (change.connectionName === null) {
                // Don't leave an account the toast says was never saved.
                if (createdHere && connectionId) {
                  await c.get('db').removeProjectConnection(entry.projectId, connectionId)
                }
                throw new Error('The workspace did not take the connection')
              }
              if (change.changed) {
                await recordAudit(c, {
                  event: 'workspace_connection.set',
                  facts: {
                    name: change.workspaceName ?? 'Workspace',
                    change: `Deploys to ${change.connectionName}`,
                  },
                  projectId: entry.projectId,
                })
              }
            }
            connected = true
          } else if (entry.connectionId) {
            const before = await c.get('db').getProviderConnectionById(entry.connectionId)
            if (
              before &&
              parseCredentials(before.credentials).accountId &&
              parseCredentials(before.credentials).accountId !== account.id
            ) {
              throw new Error('A different Cloudflare account was authorized')
            }
            const updated = await c.get('db').updateConnection(entry.connectionId, {
              organizationId: entry.orgId,
              credentials: JSON.stringify(credentials),
              // The row carries no expiry: the access token's hour is in the credentials
              // and renewed on read; putting it on the row would fire the expiry notice.
              token: { status: 'active', expiresAt: null, checkedAt },
            })
            if (!updated) throw new Error('The connection is no longer there')
            await revokePrevious(before, credentials.refreshToken)
            connected = true
            await recordAudit(c, {
              event: 'connection.update',
              facts: { name: updated.name, change: 'Reconnected with OAuth' },
            })
            await clearConnectionNotices(c.get('db'), entry.orgId, entry.connectionId)
          } else {
            const created = await c.get('db').createConnection({
              id: nanoid(),
              organizationId: entry.orgId,
              createdBy: entry.userId,
              provider: 'cloudflare',
              credentials: JSON.stringify(credentials),
              name: account.name,
              allProjects: true,
              projectIds: [],
              // The row carries no expiry: the access token's hour is in the credentials
              // and renewed on read; putting it on the row would fire the expiry notice.
              token: { status: 'active', expiresAt: null, checkedAt },
              visibleTo: { userId: entry.userId },
            })
            if (!created) throw new Error('The organization did not take the connection')
            connected = true
            await recordAudit(c, {
              event: 'connection.create',
              facts: { name: account.name, provider: 'cloudflare' },
            })
          }
        } catch (error) {
          log.warn('Cloudflare OAuth connection could not be saved', {
            org: entry.orgSlug,
            account: account.name,
            error: error instanceof Error ? error.message : String(error),
          })
          return c.redirect(
            resultUrl(entry.orgSlug, { oauth: 'error', reason: 'save' }, entry.projectSlug),
            302,
          )
        }
      }

      return c.redirect(
        resultUrl(
          entry.orgSlug,
          {
            oauth: 'ok',
            account: account.name,
            ...(connected && { connected: '1' }),
          },
          entry.projectSlug,
        ),
        302,
      )
    } catch (error) {
      await revokeIssued(tokens)
      log.warn('Cloudflare OAuth exchange failed', {
        org: entry.orgSlug,
        stub: options.config.stub,
        code: error instanceof CloudflareOAuthError ? error.code : undefined,
        error: error instanceof Error ? error.message : String(error),
      })
      return c.redirect(
        resultUrl(entry.orgSlug, { oauth: 'error', reason: 'exchange' }, entry.projectSlug),
        302,
      )
    }
  })

  return routes
}
