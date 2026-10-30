import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import { paginationQuerySchema } from '../lib/pagination.js'
import { isUniqueViolation } from '@awaitstep/db'
import { ACCESS_REASONS, isOrgAdmin, projectCapabilities } from '@awaitstep/ir'
import { isSession } from '../middleware/auth.js'
import { FOR_KEY, FOR_SESSION, projectRecord } from '../lib/scope-records.js'
import { CHANGED_MEANWHILE, lockBodySchema, lockResponse } from '../lib/locks.js'
import { sharedItemRecord, sharedListQuerySchema } from '../lib/sharing.js'
import { parseOrgRole } from '../lib/org-role.js'
import { recordAudit } from '../lib/audit.js'
import { projectSlugSchema } from '../lib/slugs.js'
import type { AppEnv } from '../types.js'

const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  slug: projectSlugSchema,
  description: z.string().max(1000).optional(),
})

const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: projectSlugSchema.optional(),
  description: z.string().max(1000).optional(),
})

const SLUG_TAKEN = 'Another project in this organization already uses that URL'

export const projects = new Hono<AppEnv>()

projects.get('/', zValidator('query', paginationQuerySchema), async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const { cursor, limit } = c.req.valid('query')
  const result = await db.listProjectsByOrganization(organizationId, c.get('userId'), {
    cursor,
    limit,
  })
  const audience = isSession(c) ? FOR_SESSION : FOR_KEY
  return c.json({
    ...result,
    data: result.data.map((row) => projectRecord(row, audience)),
  })
})

projects.post('/', zValidator('json', createProjectSchema), async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const body = c.req.valid('json')

  // A project is born with its Default workspace; both rows or neither.
  try {
    const { project, workspace } = await db.createProject({
      id: nanoid(),
      organizationId,
      name: body.name,
      slug: body.slug,
      description: body.description,
      defaultWorkspaceId: nanoid(),
      createdBy: c.get('userId'),
    })
    return c.json({ ...project, defaultWorkspace: workspace }, 201)
  } catch (error) {
    // The (organization, slug) index is the check: no read before the write.
    if (isUniqueViolation(error)) return c.json({ error: SLUG_TAKEN }, 409)
    throw error
  }
})

projects.patch('/:id', zValidator('json', updateProjectSchema), async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const id = c.req.param('id')

  const body = c.req.valid('json')
  try {
    const updated = await db.updateProject(id, organizationId, body)
    if (!updated) return c.json({ error: 'Not found' }, 404)
    return c.json(updated)
  } catch (error) {
    if (isUniqueViolation(error)) return c.json({ error: SLUG_TAKEN }, 409)
    throw error
  }
})

projects.delete('/:id', async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const id = c.req.param('id')

  const name = c.get('projectName') ?? id
  // The locks are checked in the statement; only a refusal reads why.
  if (await db.deleteProject(id, organizationId)) {
    // Recorded at the organization: the project it would name is gone.
    await recordAudit(c, { event: 'project.delete', facts: { name } })
    return c.json({ ok: true })
  }
  const locks = await db.getProjectLocks(id, organizationId)
  if (!locks) return c.json({ error: 'Not found' }, 404)
  const can = projectCapabilities(c.get('projectRole'), locks, c.get('orgRole')).delete
  const reason = can.reason ?? CHANGED_MEANWHILE
  await recordAudit(c, {
    event: 'project.delete.blocked',
    facts: { name, reason },
    projectId: id,
  })
  return c.json({ error: reason }, 409)
})

/** Turns the project's deletion lock on or off; on again keeps who set it and when. */
projects.put('/:id/lock', zValidator('json', lockBodySchema), async (c) => {
  const id = c.req.param('id')
  const { locked } = c.req.valid('json')
  const row = await c.get('db').setProjectLock(id, c.get('organizationId'), c.get('userId'), locked)
  if (!row) return c.json({ error: 'Not found' }, 404)
  if (row.changed) {
    await recordAudit(c, {
      event: locked ? 'project.lock' : 'project.unlock',
      facts: { name: c.get('projectName') ?? id },
      projectId: id,
    })
  }
  return c.json(lockResponse(row))
})

/** Project settings › Shared library: every workspace's shared items, hidden ones named (D-B6-8). */
projects.get('/:id/shared', zValidator('query', sharedListQuerySchema), async (c) => {
  const { cursor, limit, kind } = c.req.valid('query')
  const page = await c.get('db').listSharedWorkflows(
    {
      projectId: c.get('projectId'),
      organizationId: c.get('organizationId'),
      viewer: c.get('userId'),
      kind,
    },
    { cursor, limit },
  )
  return c.json({ ...page, data: page.data.map((row) => sharedItemRecord(row, 'project')) })
})

const SLUG_TAKEN_THERE = 'Another project in that organization already uses this URL'

/**
 * Move the project to another organization the caller also runs. Its
 * workflows, workspaces, keys and variables go with it; rows of people who
 * are not in the target organization go, the rest follow, and open
 * invitations into it lose their places there. A locked project stays.
 */
projects.post(
  '/:id/move',
  zValidator('json', z.object({ organizationId: z.string().min(1) })),
  async (c) => {
    const db = c.get('db')
    const from = c.get('organizationId')
    const id = c.req.param('id')
    const userId = c.get('userId')
    const { organizationId: to } = c.req.valid('json')
    if (to === from) return c.json({ error: 'The project is already in this organization' }, 400)
    // One unit, the caller's standing in the target checked in its
    // statement; the project's row then says whether it moved, and only a
    // refusal costs a read to say why.
    let movedAt: string
    try {
      movedAt = await db.moveProjectToOrganization(id, from, to, userId)
    } catch (error) {
      if (isUniqueViolation(error)) return c.json({ error: SLUG_TAKEN_THERE }, 409)
      throw error
    }
    const outcome = await db.getProjectMoveOutcome(id, from, to)
    const name = c.get('projectName') ?? id
    if (outcome?.organizationId === to) {
      // A concurrent move of the same project got there first: it records.
      if (outcome.updatedAt !== movedAt) return c.json({ ok: true })
      // Both organizations' logs keep it: the one it left, and the one it joined.
      await recordAudit(
        c,
        { event: 'project.move.out', facts: { name, otherOrg: outcome.toName ?? undefined } },
        {
          event: 'project.move.in',
          facts: { name, otherOrg: outcome.fromName ?? undefined },
          organizationId: to,
          projectId: id,
        },
      )
      return c.json({ ok: true })
    }
    if (outcome?.lockedAt) {
      await recordAudit(c, {
        event: 'project.move.blocked',
        facts: { name, reason: ACCESS_REASONS.lockFirst },
        projectId: id,
      })
      return c.json({ error: ACCESS_REASONS.lockFirst }, 409)
    }
    const targetRole = await db.getOrgRole(to, userId)
    if (targetRole === null || !isOrgAdmin(parseOrgRole(targetRole))) {
      return c.json({ error: ACCESS_REASONS.orgAdmins }, 403)
    }
    return c.json({ error: 'Not found' }, 404)
  },
)
