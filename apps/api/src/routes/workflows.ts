import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import type { AppEnv } from '../types.js'

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
})

const envVarNamePattern = /^[A-Z][A-Z0-9_]*$/

const envVarSchema = z.object({
  name: z.string().min(1).max(255).regex(envVarNamePattern, 'Env var name must be uppercase with underscores (e.g. MY_API_KEY)'),
  value: z.string().max(10_000),
  isSecret: z.boolean().optional(),
})

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  envVars: z.array(envVarSchema).optional(),
  triggerCode: z.string().max(50_000).optional(),
})

export const workflows = new Hono<AppEnv>()

workflows.get('/', async (c) => {
  const db = c.get('db')
  const userId = c.get('userId')
  const list = await db.listWorkflowsByUser(userId)
  return c.json(list)
})

workflows.get('/:id', async (c) => {
  return c.json(c.get('workflow'))
})

workflows.post('/', zValidator('json', createSchema), async (c) => {
  const db = c.get('db')
  const userId = c.get('userId')
  const body = c.req.valid('json')
  const workflow = await db.createWorkflow({
    id: nanoid(),
    userId,
    name: body.name,
    description: body.description,
  })
  return c.json(workflow, 201)
})

workflows.patch('/:id', zValidator('json', updateSchema), async (c) => {
  const db = c.get('db')
  const { envVars, triggerCode, ...rest } = c.req.valid('json')
  const dbData: { name?: string; description?: string; envVars?: string; triggerCode?: string } = { ...rest }
  if (envVars !== undefined) {
    dbData.envVars = JSON.stringify(envVars)
  }
  if (triggerCode !== undefined) {
    dbData.triggerCode = triggerCode
  }
  const updated = await db.updateWorkflow(c.req.param('id'), dbData)
  return c.json(updated)
})

workflows.delete('/:id', async (c) => {
  const db = c.get('db')
  await db.deleteWorkflow(c.req.param('id'))
  return c.json({ ok: true })
})
