import { createMiddleware } from 'hono/factory'
import type { Context } from 'hono'
import type { ProjectRef, WorkspaceInProjectRef } from '@awaitstep/db'
import { parseOrgRole } from '../lib/org-role.js'
import type { AppEnv } from '../types.js'
import {
  apiKeyLevel,
  apiKeyProjectScopes,
  apiKeyWorkspaceScopes,
  apiKeySoleProject,
  apiKeySoleWorkspace,
  isSession,
} from './auth.js'
import { applyGrantRows } from './access.js'

// Scope is read off the query string, by id (`organizationId`, `projectId`,
// `workspaceId`) or by the slugs the dashboard's URLs carry (`org`,
// `project`, `workspace`), or off the path (`/projects/:id`,
// `/workspaces/:id`). Either way one read resolves the rows, the caller's
// membership rows and whether they may open the place, and a row they may
// not open answers exactly like one that does not exist. For an API key the
// caller is the key's creator, whose standing the key acts with; the key's
// project pin — and a workspace key's workspace pin — is checked against
// what was found, and a workspace key naming another workspace is told
// "not found", as for a workspace its creator cannot open.

const ORG_KEY_ON_PROJECT = 'An organization-level API key cannot access project resources'

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
    if (!isSession(c)) return next()

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

/** The project a request names in its query, with the caller's roles there. */
export const requireProject = createMiddleware<AppEnv>(async (c, next) => {
  const db = c.get('db')
  const level = apiKeyLevel(c)

  // A workspace-level key addresses one of its workspaces; its project comes
  // off that workspace, so it is resolved by the workspace, not a project ref.
  if (!isSession(c) && level === 'workspace') {
    const named = workspaceParam(c)
    const scopes = apiKeyWorkspaceScopes(c)
    // Named by slug: resolve it within the key's project (any of its scope
    // workspaces names that project), then hold the result to the key's set —
    // a workspace outside it is not found, exactly as one its creator cannot open.
    if (named && 'slug' in named) {
      const anchor = scopes[0]
        ? await db.getWorkspaceIfMember(c.get('userId'), { id: scopes[0] })
        : null
      const found = anchor
        ? await db.getProjectIfMember(c.get('userId'), { id: anchor.projectId }, named)
        : null
      const resolvedId = found?.workspace?.id
      if (!found || !resolvedId || !scopes.includes(resolvedId)) {
        return c.json({ error: 'Not found' }, 404)
      }
      c.set('workspaceId', resolvedId)
      c.set('workspace', found.workspace!)
      c.set('workspaceName', found.workspace!.name)
      c.set('projectId', found.project.id)
      c.set('organizationId', found.project.organizationId)
      c.set('projectName', found.project.name)
      applyGrantRows(c, found, true)
      return next()
    }
    const workspaceId = named && 'id' in named ? named.id : (apiKeySoleWorkspace(c) ?? undefined)
    if (!workspaceId) {
      return c.json(
        { error: 'This API key reaches several workspaces; name one with ?workspaceId' },
        400,
      )
    }
    if (!scopes.includes(workspaceId)) {
      return c.json({ error: 'Not found' }, 404)
    }
    const found = await db.getWorkspaceIfMember(c.get('userId'), { id: workspaceId })
    if (!found) return c.json({ error: 'Not found' }, 404)
    c.set('workspaceId', found.workspaceId)
    c.set('projectId', found.projectId)
    c.set('organizationId', found.organizationId)
    c.set('projectName', found.projectName)
    c.set('workspaceName', found.workspaceName)
    applyGrantRows(c, found, true)
    return next()
  }

  const workspace = workspaceParam(c)
  // An empty parameter is no parameter, as the routers' choosers read it.
  const namedSlug = c.req.query('project') || undefined
  let ref: ProjectRef
  if (!isSession(c)) {
    // An organization-level key does no project work; org management and
    // project work never share a key.
    if (level === 'organization') return c.json({ error: ORG_KEY_ON_PROJECT }, 403)
    // A project-level key addresses one of the projects it reaches, named by
    // id or slug, or — when it reaches exactly one — defaulting to it.
    const namedId = c.req.query('projectId') || undefined
    if (namedId) ref = { id: namedId }
    else if (namedSlug) {
      const org = c.req.query('org')
      if (!org) {
        return c.json({ error: 'Missing projectId (or org and project) query parameters' }, 400)
      }
      ref = { org, slug: namedSlug }
    } else {
      const sole = apiKeySoleProject(c)
      if (!sole) {
        return c.json(
          { error: 'This API key reaches several projects; name one with ?projectId' },
          400,
        )
      }
      ref = { id: sole }
    }
  } else {
    const projectId = c.req.query('projectId')
    const org = c.req.query('org')
    const project = c.req.query('project')
    if (projectId) ref = { id: projectId }
    else if (org && project) ref = { org, slug: project }
    else {
      return c.json({ error: 'Missing projectId (or org and project) query parameters' }, 400)
    }
  }

  const found = await db.getProjectIfMember(c.get('userId'), ref, workspace)
  if (
    !found ||
    (!isSession(c) && namedSlug !== undefined && found.project.slug !== namedSlug) ||
    // A project outside the key's set is not found, as one its creator cannot open.
    (level === 'project' && !apiKeyProjectScopes(c).includes(found.project.id))
  ) {
    return c.json({ error: 'Not found' }, 404)
  }

  c.set('projectId', found.project.id)
  c.set('organizationId', found.project.organizationId)
  c.set('projectName', found.project.name)
  if (found.workspace) {
    c.set('workspaceId', found.workspace.id)
    c.set('workspace', found.workspace)
    c.set('workspaceName', found.workspace.name)
  }
  applyGrantRows(c, found, found.workspace !== null)
  await next()
})

/** `/projects/:id` and below: the project by its path id, with the caller's roles. */
export const requireProjectParam = createMiddleware<AppEnv>(async (c, next) => {
  const id = c.req.param('id') ?? c.req.param('projectId')
  if (!id) return c.json({ error: 'Not found' }, 404)
  // Everything under a project item manages the project: not a project- or
  // workspace-scoped key's business, its own projects included, and said so
  // rather than hidden. Organization keys reach their org's projects here.
  if (apiKeyLevel(c) === 'project' || apiKeyLevel(c) === 'workspace') {
    return c.json({ error: 'A project-scoped API key cannot manage organization resources' }, 403)
  }

  const found = await c.get('db').getProjectIfMember(c.get('userId'), { id })
  if (!found) return c.json({ error: 'Not found' }, 404)
  // An organization-level key reaches the projects of its own organization only.
  if (!isSession(c) && found.project.organizationId !== c.get('organizationId')) {
    return c.json({ error: 'Not found' }, 404)
  }

  c.set('projectId', found.project.id)
  c.set('organizationId', found.project.organizationId)
  c.set('projectName', found.project.name)
  applyGrantRows(c, found, false)
  await next()
})

/** `/workspaces/:id` and below: the workspace, its project and organization, with the caller's roles. */
export const requireWorkspace = createMiddleware<AppEnv>(async (c, next) => {
  const id = c.req.param('id') ?? c.req.param('workspaceId')
  if (!id) return c.json({ error: 'Not found' }, 404)
  const level = apiKeyLevel(c)
  // An organization-level key does no workspace work.
  if (!isSession(c) && level === 'organization') {
    return c.json({ error: ORG_KEY_ON_PROJECT }, 403)
  }

  const found = await c.get('db').getWorkspaceIfMember(c.get('userId'), { id })
  if (
    !found ||
    // A project-level key reaches the workspace only if its project is in the
    // key's set; a workspace-level key only if the workspace itself is.
    (level === 'project' && !apiKeyProjectScopes(c).includes(found.projectId)) ||
    (level === 'workspace' && !apiKeyWorkspaceScopes(c).includes(found.workspaceId))
  ) {
    return c.json({ error: 'Not found' }, 404)
  }

  c.set('workspaceId', found.workspaceId)
  c.set('projectId', found.projectId)
  c.set('organizationId', found.organizationId)
  c.set('projectName', found.projectName)
  c.set('workspaceName', found.workspaceName)
  applyGrantRows(c, found, true)
  await next()
})
