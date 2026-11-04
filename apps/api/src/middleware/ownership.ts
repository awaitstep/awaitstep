import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types.js'
import { apiKeyLevel, apiKeyProjectScopes, apiKeyWorkspaceScopes } from './auth.js'
import { applyGrantRows } from './access.js'

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
  if (!found || found.workflow.projectId !== c.get('projectId')) {
    return c.json({ error: 'Not found' }, 404)
  }
  // A scoped key reaches the workflow only if its place is in the key's set:
  // a project-level key by the workflow's project, a workspace-level key by
  // its workspace.
  const level = apiKeyLevel(c)
  if (level === 'project' && !apiKeyProjectScopes(c).includes(found.workflow.projectId)) {
    return c.json({ error: 'Not found' }, 404)
  }
  if (level === 'workspace' && !apiKeyWorkspaceScopes(c).includes(found.workflow.workspaceId)) {
    return c.json({ error: 'Not found' }, 404)
  }

  c.set('workflow', found.workflow)
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
