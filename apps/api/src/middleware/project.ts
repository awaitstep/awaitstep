import { createMiddleware } from 'hono/factory'
import type { Context } from 'hono'
import type { WorkspaceInProjectRef } from '@awaitstep/db'
import { parseOrgRole } from '../lib/org-role.js'
import type { AppEnv } from '../types.js'

// Scope is read off the query string, by id (`organizationId`, `projectId`,
// `workspaceId`) or by the slugs the dashboard's URLs carry (`org`,
// `project`, `workspace`). Either way one JOIN resolves the rows and the
// caller's membership together, and a row the caller may not open answers
// exactly like one that does not exist.

/** `?workspaceId=` or `?workspace=<slug>`, when the request names one. */
function workspaceParam(c: Context<AppEnv>): WorkspaceInProjectRef | undefined {
  const id = c.req.query('workspaceId')
  if (id) return { id }
  const slug = c.req.query('workspace')
  return slug ? { slug } : undefined
}

// The one membership check for organization context. API key auth already
// set organizationId — a project key's comes off its project, an
// organization key carries its own. A session names one, and it is always
// membership-checked; `optional` only decides whether naming none is allowed.
function organizationContext(options: { optional: boolean }) {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (c.get('apiKeyScopes') !== null) return next()

    const id = c.req.query('organizationId')
    const slug = c.req.query('org')
    if (!id && !slug) {
      if (options.optional) return next()
      return c.json({ error: 'Missing organizationId (or org) query parameter' }, 400)
    }

    const org = await c
      .get('db')
      .getOrganizationIfMember(c.get('userId'), id ? { id } : { slug: slug! })
    if (!org) {
      return c.json({ error: 'Not found' }, 404)
    }

    c.set('organizationId', org.id)
    c.set('orgRole', parseOrgRole(org.role))
    await next()
  })
}

export const requireOrganization = organizationContext({ optional: false })

/** A session may omit the organization and get no organization context. */
export const resolveOptionalOrganization = organizationContext({ optional: true })

export const requireProject = createMiddleware<AppEnv>(async (c, next) => {
  const db = c.get('db')
  const workspace = workspaceParam(c)

  // A project key already carries projectId and organizationId. An
  // organization-level key carries no project — and gets none here: org
  // management and project work never share a key.
  if (c.get('apiKeyScopes') !== null) {
    const projectId = c.get('projectId') as string | undefined
    if (projectId === undefined) {
      return c.json({ error: 'An organization-level API key cannot access project resources' }, 403)
    }
    if (workspace) {
      const found = await db.getWorkspaceInProject(projectId, workspace)
      if (!found) return c.json({ error: 'Not found' }, 404)
      c.set('workspaceId', found.workspaceId)
    }
    return next()
  }

  const projectId = c.req.query('projectId')
  const org = c.req.query('org')
  const project = c.req.query('project')
  const ref = projectId ? { id: projectId } : org && project ? { org, slug: project } : null
  if (!ref) {
    return c.json({ error: 'Missing projectId (or org and project) query parameters' }, 400)
  }

  const found = await db.getProjectIfMember(c.get('userId'), ref, workspace)
  if (!found) {
    return c.json({ error: 'Not found' }, 404)
  }

  c.set('projectId', found.project.id)
  c.set('organizationId', found.project.organizationId)
  c.set('orgRole', parseOrgRole(found.role))
  if (found.workspaceId) c.set('workspaceId', found.workspaceId)
  await next()
})

/** `/workspaces/:id` and below: the workspace, its project and organization, in one read. */
export const requireWorkspace = createMiddleware<AppEnv>(async (c, next) => {
  const db = c.get('db')
  const id = c.req.param('id') ?? c.req.param('workspaceId')
  if (!id) return c.json({ error: 'Not found' }, 404)

  if (c.get('apiKeyScopes') !== null) {
    const projectId = c.get('projectId') as string | undefined
    if (projectId === undefined) {
      return c.json({ error: 'An organization-level API key cannot access project resources' }, 403)
    }
    const found = await db.getWorkspaceInProject(projectId, { id })
    if (!found) return c.json({ error: 'Not found' }, 404)
    c.set('workspaceId', found.workspaceId)
    return next()
  }

  const found = await db.getWorkspaceIfMember(c.get('userId'), { id })
  if (!found) return c.json({ error: 'Not found' }, 404)

  c.set('workspaceId', found.workspaceId)
  c.set('projectId', found.projectId)
  c.set('organizationId', found.organizationId)
  c.set('orgRole', parseOrgRole(found.role))
  await next()
})
