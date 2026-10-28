import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import { paginationQuerySchema } from '../lib/pagination.js'
import { isUniqueViolation } from '@awaitstep/db'
import { FOR_KEY, FOR_SESSION, projectRecord } from '../lib/scope-records.js'
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
  const result = await db.listProjectsByOrganization(organizationId, { cursor, limit })
  const orgRole = c.get('orgRole') ?? 'member'
  const audience = c.get('apiKeyScopes') === null ? FOR_SESSION : FOR_KEY
  return c.json({
    ...result,
    data: result.data.map((row) => projectRecord(row, orgRole, audience)),
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
