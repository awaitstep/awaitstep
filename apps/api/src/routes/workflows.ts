import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import { paginationQuerySchema } from '../lib/pagination.js'
import type { AppEnv } from '../types.js'

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
})

const envVarNamePattern = /^[A-Z][A-Z0-9_]*$/

const envVarSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(255)
    .regex(envVarNamePattern, 'Env var name must be uppercase with underscores (e.g. MY_API_KEY)'),
  value: z.string().max(10_000),
  isSecret: z.boolean().optional(),
})

const npmPackageName = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/
const semverRange =
  /^(\*|latest|next|canary|[\^~]?\d+(\.\d+){0,2}(-[a-zA-Z0-9.]+)?(\s*\|\|\s*[\^~]?\d+(\.\d+){0,2}(-[a-zA-Z0-9.]+)?)*)$/

const dependenciesSchema = z
  .record(
    z.string().min(1).max(214).regex(npmPackageName, 'Invalid npm package name'),
    z
      .string()
      .min(1)
      .max(100)
      .regex(semverRange, 'Invalid version range (e.g. ^1.0.0, ~2.3, latest)'),
  )
  .refine((deps) => Object.keys(deps).length <= 15, 'Maximum 15 dependencies')

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  envVars: z.array(envVarSchema).optional(),
  triggerCode: z.string().max(50_000).optional(),
  dependencies: dependenciesSchema.optional(),
})

export const workflows = new Hono<AppEnv>()

workflows.get('/', zValidator('query', paginationQuerySchema), async (c) => {
  const db = c.get('db')
  const projectId = c.get('projectId')
  const { cursor, limit } = c.req.valid('query')
  const result = await db.listWorkflowsWithStatus(projectId, { cursor, limit })
  return c.json(result)
})

workflows.get('/:id', async (c) => {
  return c.json(c.get('workflow'))
})

workflows.get('/:id/full', async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const versionId = c.req.query('version')

  const [activeDeployment, versionsResult] = await Promise.all([
    db.getActiveDeployment(workflow.id),
    db.listVersionsByWorkflow(workflow.id, { limit: 100 }),
  ])
  const versions = versionsResult.data

  let version: (typeof versions)[number] | null = versions[0] ?? null
  if (versionId) {
    const requested = await db.getWorkflowVersionById(versionId)
    version = requested?.workflowId === workflow.id ? requested : null
  }

  return c.json({
    workflow,
    version,
    versions: versions.map(({ id, version, locked, createdAt }) => ({
      id,
      version,
      locked,
      createdAt,
    })),
    activeDeployment,
  })
})

workflows.post('/', zValidator('json', createSchema), async (c) => {
  const db = c.get('db')
  const projectId = c.get('projectId')
  const userId = c.get('userId')
  const body = c.req.valid('json')
  const workflow = await db.createWorkflow({
    id: nanoid(),
    projectId,
    createdBy: userId,
    name: body.name,
    description: body.description,
  })
  return c.json(workflow, 201)
})

workflows.patch('/:id', zValidator('json', updateSchema), async (c) => {
  const db = c.get('db')
  const { envVars, triggerCode, dependencies, ...rest } = c.req.valid('json')
  const dbData: {
    name?: string
    description?: string
    envVars?: string
    triggerCode?: string
    dependencies?: string
  } = { ...rest }
  if (envVars !== undefined) {
    dbData.envVars = JSON.stringify(envVars)
  }
  if (triggerCode !== undefined) {
    dbData.triggerCode = triggerCode
  }
  if (dependencies !== undefined) {
    dbData.dependencies = JSON.stringify(dependencies)
  }
  const updated = await db.updateWorkflow(c.req.param('id'), dbData)
  return c.json(updated)
})

workflows.patch(
  '/:id/move',
  zValidator('json', z.object({ targetProjectId: z.string().min(1) })),
  async (c) => {
    const db = c.get('db')
    const organizationId = c.get('organizationId')
    const workflow = c.get('workflow')
    if (!workflow) return c.json({ error: 'Not found' }, 404)

    const { targetProjectId } = c.req.valid('json')

    const targetProject = await db.getProjectById(targetProjectId)
    if (!targetProject || targetProject.organizationId !== organizationId) {
      return c.json({ error: 'Target project not found' }, 404)
    }

    if (targetProjectId === workflow.projectId) {
      return c.json({ error: 'Workflow is already in this project' }, 400)
    }

    // Check for env var warnings
    const workflowEnvVars = await db.getWorkflowEnvVars(workflow.id)
    const warnings: string[] = []
    const globalRefPattern = /^\{\{global\.env\.([A-Z][A-Z0-9_]*)\}\}$/

    for (const wVar of workflowEnvVars) {
      const match = wVar.value.match(globalRefPattern)
      if (match) {
        const targetVarsResult = await db.listEnvVarsByProject(organizationId, targetProjectId, {
          limit: 100,
        })
        const hasVar = targetVarsResult.data.some((v) => v.name === match[1])
        if (!hasVar) {
          warnings.push(match[1])
        }
      }
    }

    const updated = await db.updateWorkflow(workflow.id, { projectId: targetProjectId })

    return c.json({
      workflow: updated,
      warnings:
        warnings.length > 0 ? `Missing env vars in target project: ${warnings.join(', ')}` : null,
    })
  },
)

workflows.delete('/:id', async (c) => {
  const db = c.get('db')
  await db.deleteWorkflow(c.req.param('id'))
  return c.json({ ok: true })
})
