import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import type { AppEnv } from '../types.js'

const slugPattern = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/

const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100).regex(slugPattern, 'Slug must be lowercase letters, digits, and hyphens'),
  description: z.string().max(1000).optional(),
})

const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
})

export const projects = new Hono<AppEnv>()

projects.get('/', async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const list = await db.listProjectsByOrganization(organizationId)
  return c.json(list)
})

projects.post('/', zValidator('json', createProjectSchema), async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const body = c.req.valid('json')

  const project = await db.createProject({
    id: nanoid(),
    organizationId,
    name: body.name,
    slug: body.slug,
    description: body.description,
  })
  return c.json(project, 201)
})

projects.patch('/:id', zValidator('json', updateProjectSchema), async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const id = c.req.param('id')

  const existing = await db.getProjectById(id)
  if (!existing || existing.organizationId !== organizationId) {
    return c.json({ error: 'Not found' }, 404)
  }

  const body = c.req.valid('json')
  const updated = await db.updateProject(id, body)
  return c.json(updated)
})

projects.delete('/:id', async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const id = c.req.param('id')

  const existing = await db.getProjectById(id)
  if (!existing || existing.organizationId !== organizationId) {
    return c.json({ error: 'Not found' }, 404)
  }

  await db.deleteProject(id)
  return c.json({ ok: true })
})
