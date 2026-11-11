import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { Workflow } from '@awaitstep/db'
import type { AppEnv } from '../types.js'
import { apiKeyLevel, apiKeyProjectScopes, apiKeyWorkspaceScopes, isSession } from './auth.js'
import { applyGrantRows } from './access.js'
import { ORG_KEY_ON_PROJECT } from './key-permissions.js'

/**
 * Whether a scoped key reaches the workflow: a project-level key by the
 * workflow's project, a workspace-level key by its workspace.
 */
function keyReaches(c: Context<AppEnv>, workflow: Workflow): boolean {
  const level = apiKeyLevel(c)
  if (level === 'project') return apiKeyProjectScopes(c).includes(workflow.projectId)
  if (level === 'workspace') return apiKeyWorkspaceScopes(c).includes(workflow.workspaceId)
  return true
}

/**
 * A workflow item route: the workflow, read together with the caller's rows
 * in its workspace. One they may not open — a hidden workspace, another
 * project — is not found, and the roles set here are what the capability
 * gates on edit, deploy and run read.
 */
export const requireWorkflowAccess = createMiddleware<AppEnv>(async (c, next) => {
  const workflowId = c.req.param('workflowId') ?? c.req.param('id')
  if (!workflowId) return c.json({ error: 'Not found' }, 404)

  const found = await c.get('db').getWorkflowForUser(c.get('userId'), workflowId)
  if (
    !found ||
    found.workflow.projectId !== c.get('projectId') ||
    // A scoped key reaches the workflow only if its place is in the key's set.
    !keyReaches(c, found.workflow)
  ) {
    return c.json({ error: 'Not found' }, 404)
  }

  c.set('workflow', found.workflow)
  c.set('workspaceId', found.workflow.workspaceId)
  applyGrantRows(c, found, true)
  await next()
})

/**
 * `POST /run/:workflowId`: the workflow addressed by its id alone, for a
 * project or workspace key — the key's organization and scope set stand in
 * for the project a dashboard route names. One the key's creator can't open,
 * another organization's, or one outside the key's set is not found; an
 * organization key does no workflow work.
 */
export const requireKeyWorkflowAccess = createMiddleware<AppEnv>(async (c, next) => {
  if (isSession(c)) return c.json({ error: 'Use an API key' }, 401)
  if (apiKeyLevel(c) === 'organization') return c.json({ error: ORG_KEY_ON_PROJECT }, 403)
  const workflowId = c.req.param('workflowId')
  if (!workflowId) return c.json({ error: 'Not found' }, 404)

  const found = await c.get('db').getWorkflowForUser(c.get('userId'), workflowId)
  if (
    !found ||
    found.organizationId !== c.get('organizationId') ||
    !keyReaches(c, found.workflow)
  ) {
    return c.json({ error: 'Not found' }, 404)
  }

  c.set('workflow', found.workflow)
  c.set('projectId', found.workflow.projectId)
  c.set('workspaceId', found.workflow.workspaceId)
  applyGrantRows(c, found, true)
  await next()
})

export const requireConnectionAccess = createMiddleware<AppEnv>(async (c, next) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const connectionId = c.req.param('connectionId') ?? c.req.param('id')

  if (!connectionId) return c.json({ error: 'Not found' }, 404)

  const connection = await db.getProviderConnectionById(connectionId)
  if (!connection || connection.organizationId !== organizationId) {
    return c.json({ error: 'Not found' }, 404)
  }
  // A project's own account is managed on its page (23a), where deleting one
  // with live workers is refused: the org routes don't reach it.
  if (connection.projectId) {
    return c.json(
      { error: 'This account belongs to a project. Manage it on the project’s Connections page.' },
      404,
    )
  }

  c.set('connection', connection)
  await next()
})
