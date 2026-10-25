import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import { paginationQuerySchema } from '../lib/pagination.js'
import { apiKeyProjectPin } from '../middleware/auth.js'
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

const listEnvVarsQuerySchema = z
  .object({ projectId: z.string().optional() })
  .merge(paginationQuerySchema)

envVars.get('/', zValidator('query', listEnvVarsQuerySchema), async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const { projectId, cursor, limit } = c.req.valid('query')

  // A project-scoped key reads its own project's list and the org-wide list —
  // org-wide variables resolve into its project at deploy time — but never
  // another project's. Mutations below are pinned to the key's project.
  const pin = apiKeyProjectPin(c)
  if (pin !== null && projectId !== undefined && projectId !== pin) {
    return c.json({ error: 'Not found' }, 404)
  }

  const result = projectId
    ? await db.listEnvVarsByProject(organizationId, projectId, { cursor, limit })
    : await db.listEnvVarsByOrganization(organizationId, { cursor, limit })

  return c.json({
    data: result.data.map((v) => ({
      ...v,
      value: v.isSecret ? '••••••••' : v.value,
    })),
    nextCursor: result.nextCursor,
  })
})

envVars.post('/', zValidator('json', createEnvVarSchema), async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const userId = c.get('userId')
  const body = c.req.valid('json')

  const pin = apiKeyProjectPin(c)
  if (pin !== null && body.projectId !== pin) {
    return c.json(
      { error: "A project-scoped API key can only manage its own project's variables" },
      403,
    )
  }

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
  const body = c.req.valid('json')

  const pin = apiKeyProjectPin(c)
  const scope = pin === null ? { organizationId } : { organizationId, projectId: pin }
  const updated = await db.updateEnvVar(id, scope, body)
  if (!updated) {
    // One read, only on this error path: tell the secret-reveal refusal from
    // a plain miss, so the caller learns what to do instead of chasing a 404.
    if (body.isSecret === false && body.value === undefined) {
      const existing = await db.getEnvVarById(id)
      if (
        existing &&
        existing.organizationId === organizationId &&
        (pin === null || existing.projectId === pin) &&
        existing.isSecret
      ) {
        return c.json(
          { error: 'Provide a new value when making a secret variable non-secret' },
          422,
        )
      }
    }
    return c.json({ error: 'Not found' }, 404)
  }

  return c.json({
    ...updated,
    value: updated.isSecret ? '••••••••' : updated.value,
  })
})

envVars.delete('/:id', async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const id = c.req.param('id')

  const pin = apiKeyProjectPin(c)
  const scope = pin === null ? { organizationId } : { organizationId, projectId: pin }
  const deleted = await db.deleteEnvVar(id, scope)
  if (!deleted) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})
