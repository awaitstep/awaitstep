import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import type { AppEnv } from '../types.js'

const envVarNamePattern = /^[A-Z][A-Z0-9_]*$/

const createEnvVarSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(255)
    .regex(
      envVarNamePattern,
      'Must be uppercase letters, digits, and underscores (e.g. MY_API_KEY)',
    ),
  value: z.string().min(1).max(10_000),
  isSecret: z.boolean().default(false),
  projectId: z.string().optional(),
})

const updateEnvVarSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(255)
    .regex(
      envVarNamePattern,
      'Must be uppercase letters, digits, and underscores (e.g. MY_API_KEY)',
    )
    .optional(),
  value: z.string().min(1).max(10_000).optional(),
  isSecret: z.boolean().optional(),
})

export const envVars = new Hono<AppEnv>()

envVars.get('/', async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const projectId = c.req.query('projectId')

  const vars = projectId
    ? await db.listEnvVarsByProject(organizationId, projectId)
    : await db.listEnvVarsByOrganization(organizationId)

  return c.json(
    vars.map((v) => ({
      ...v,
      value: v.isSecret ? '••••••••' : v.value,
    })),
  )
})

envVars.post('/', zValidator('json', createEnvVarSchema), async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const userId = c.get('userId')
  const body = c.req.valid('json')

  const envVar = await db.createEnvVar({
    id: nanoid(),
    organizationId,
    projectId: body.projectId ?? null,
    createdBy: userId,
    name: body.name,
    value: body.value,
    isSecret: body.isSecret,
  })

  if (!envVar) {
    return c.json({ error: 'Project not found' }, 404)
  }

  return c.json(
    {
      ...envVar,
      value: envVar.isSecret ? '••••••••' : envVar.value,
    },
    201,
  )
})

envVars.patch('/:id', zValidator('json', updateEnvVarSchema), async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const id = c.req.param('id')

  const existing = await db.getEnvVarById(id)
  if (!existing || existing.organizationId !== organizationId) {
    return c.json({ error: 'Not found' }, 404)
  }

  const body = c.req.valid('json')
  const updated = await db.updateEnvVar(id, body)
  if (!updated) return c.json({ error: 'Not found' }, 404)

  return c.json({
    ...updated,
    value: updated.isSecret ? '••••••••' : updated.value,
  })
})

envVars.delete('/:id', async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const id = c.req.param('id')

  const existing = await db.getEnvVarById(id)
  if (!existing || existing.organizationId !== organizationId) {
    return c.json({ error: 'Not found' }, 404)
  }

  await db.deleteEnvVar(id)
  return c.json({ ok: true })
})
