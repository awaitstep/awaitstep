import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import { paginationQuerySchema } from '../lib/pagination.js'
import { isUniqueViolation } from '@awaitstep/db'
import { ACCESS_REASONS, isOrgAdmin } from '@awaitstep/ir'
import { isSession } from '../middleware/auth.js'
import { FOR_KEY, FOR_SESSION, projectRecord } from '../lib/scope-records.js'
import { parseOrgRole } from '../lib/org-role.js'
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

  const deleted = await db.deleteProject(id, organizationId)
  if (!deleted) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})

const SLUG_TAKEN_THERE = 'Another project in that organization already uses this URL'

/**
 * Move the project to another organization the caller also runs. Its
 * workflows, workspaces, keys and variables go with it; rows of people who
 * are not in the target organization go, the rest follow, and open
 * invitations into it lose their places there.
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
    try {
      await db.moveProjectToOrganization(id, from, to, userId)
    } catch (error) {
      if (isUniqueViolation(error)) return c.json({ error: SLUG_TAKEN_THERE }, 409)
      throw error
    }
    const project = await db.getProjectById(id)
    if (project?.organizationId === to) return c.json({ ok: true })
    const targetRole = await db.getOrgRole(to, userId)
    if (targetRole === null || !isOrgAdmin(parseOrgRole(targetRole))) {
      return c.json({ error: ACCESS_REASONS.orgAdmins }, 403)
    }
    return c.json({ error: 'Not found' }, 404)
  },
)
