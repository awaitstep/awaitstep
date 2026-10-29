import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import { paginationQuerySchema } from '../lib/pagination.js'
import {
  NPM_PACKAGE_NAME_PATTERN,
  NPM_VERSION_RANGE_PATTERN,
  MAX_WORKFLOW_DEPENDENCIES,
  PROJECT_HANDLERS_PATH,
  hasHandlerModules,
  projectHandlerModules,
} from '@awaitstep/ir'
import { inheritedWorkspaceRole, workspaceCapabilities } from '@awaitstep/ir'
import { unresolvableEnvRefs } from '../lib/env-resolve.js'
import { rolesOf } from '../lib/scope-records.js'
import { apiKeyProjectPin, apiKeyWorkspacePin } from '../middleware/auth.js'
import type { AppEnv } from '../types.js'

const NO_FACTS = {
  ownLock: false,
  lockedByProject: null,
  isLastWorkspace: false,
  sharedInUse: false,
}
import { stopWorkflowTestSessions } from '../lib/test-sessions.js'

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  kind: z.enum(['workflow', 'script']).optional(),
  /** Else the `workspace`/`workspaceId` query parameter, else the project's oldest workspace. */
  workspaceId: z.string().min(1).optional(),
})

const listQuerySchema = paginationQuerySchema.extend({
  kind: z.enum(['workflow', 'script']).optional(),
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

// Shared with IR validation and the deployers — see packages/ir/src/dependencies.ts.
const dependenciesSchema = z
  .record(
    z.string().min(1).max(214).regex(NPM_PACKAGE_NAME_PATTERN, 'Invalid npm package name'),
    z
      .string()
      .min(1)
      .max(100)
      .regex(NPM_VERSION_RANGE_PATTERN, 'Invalid version range (e.g. ^1.0.0, ~2.3, latest)'),
  )
  .refine(
    (deps) => Object.keys(deps).length <= MAX_WORKFLOW_DEPENDENCIES,
    `Maximum ${MAX_WORKFLOW_DEPENDENCIES} dependencies`,
  )

const deployConfigSchema = z
  .object({
    route: z
      .object({
        pattern: z.string().min(1).max(255),
        zoneName: z.string().min(1).max(255),
      })
      .optional(),
  })
  .optional()

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  envVars: z.array(envVarSchema).optional(),
  triggerCode: z.string().max(50_000).optional(),
  dependencies: dependenciesSchema.optional(),
  deployConfig: deployConfigSchema,
})

const SECRET_MASK = '••••••••'

function maskWorkflowSecrets<T extends { envVars?: string | null }>(workflow: T): T {
  if (!workflow.envVars) return workflow
  try {
    const vars = JSON.parse(workflow.envVars) as {
      name: string
      value: string
      isSecret?: boolean
    }[]
    const masked = vars.map((v) => (v.isSecret ? { ...v, value: SECRET_MASK } : v))
    return { ...workflow, envVars: JSON.stringify(masked) }
  } catch {
    return workflow
  }
}

export const workflows = new Hono<AppEnv>()

workflows.get('/', zValidator('query', listQuerySchema), async (c) => {
  const db = c.get('db')
  const projectId = c.get('projectId')
  const { cursor, limit, kind } = c.req.valid('query')
  // Without a workspace, only the workspaces the caller can open are listed.
  const result = await db.listWorkflowsWithStatus(
    projectId,
    { cursor, limit },
    { workspaceId: c.get('workspaceId'), kind, visibleTo: c.get('userId') },
  )
  return c.json({ ...result, data: result.data.map(maskWorkflowSecrets) })
})

workflows.get('/:id', async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  return c.json(maskWorkflowSecrets(workflow))
})

workflows.get('/:id/full', async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const versionId = c.req.query('version')

  const [activeDeployment, versionsResult, projectFiles, handlersFile, requested] =
    await Promise.all([
      db.getActiveDeployment(workflow.id),
      db.listVersionsByWorkflow(workflow.id, { limit: 100 }),
      db.listWorkflowFileSummaries(workflow.id),
      db.getWorkflowFile(workflow.id, PROJECT_HANDLERS_PATH),
      versionId ? db.getWorkflowVersionById(versionId) : null,
    ])
  const versions = versionsResult.data

  let version: (typeof versions)[number] | null = versions[0] ?? null
  if (versionId) {
    version = requested?.workflowId === workflow.id ? requested : null
  }

  // A project handlers.ts is the live trigger code: the canvas hydrates it
  // (and its bindings panel reads it) in place of the legacy column. With
  // handler modules the trigger code is not consulted at all, and the
  // canvas learns which queues the project consumes from the file names.
  const handlers = projectHandlerModules(projectFiles)
  const triggerCode = hasHandlerModules(handlers)
    ? null
    : (handlersFile?.source ?? workflow.triggerCode)

  return c.json({
    workflow: { ...maskWorkflowSecrets(workflow), triggerCode },
    handlers: {
      modules: hasHandlerModules(handlers),
      consumedQueues: handlers.queues.map((q) => q.queue),
    },
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

  // A workspace key builds in its workspace only; another named in the body
  // is as hidden to it as one its creator cannot open.
  const workspacePin = apiKeyWorkspacePin(c)
  if (workspacePin !== null && body.workspaceId && body.workspaceId !== workspacePin) {
    return c.json({ error: 'Workspace not found' }, 404)
  }
  // Building needs an Editor in the target workspace. One named in the query
  // was resolved with the caller's role; one named in the body is read here;
  // none means the project's oldest, which the project role alone decides.
  let role = c.get('workspaceRole')
  if (body.workspaceId && body.workspaceId !== c.get('workspaceId')) {
    const target = await db.getWorkspaceIfMember(userId, { id: body.workspaceId })
    if (!target || target.projectId !== projectId)
      return c.json({ error: 'Workspace not found' }, 404)
    role = rolesOf(target).workspaceRole
  } else if (!role) {
    role = inheritedWorkspaceRole(c.get('projectRole'))
  }
  const can = role ? workspaceCapabilities(role, NO_FACTS).edit : null
  if (!can?.allowed) {
    return c.json({ error: can?.reason ?? 'Pick a workspace you can build in' }, 403)
  }

  const workflow = await db.createWorkflow({
    id: nanoid(),
    projectId,
    workspaceId: body.workspaceId ?? c.get('workspaceId') ?? null,
    createdBy: userId,
    name: body.name,
    description: body.description,
    kind: body.kind,
  })
  // The insert itself checks the workspace is the project's.
  if (!workflow) return c.json({ error: 'Workspace not found' }, 404)
  return c.json(workflow, 201)
})

workflows.patch('/:id', zValidator('json', updateSchema), async (c) => {
  const db = c.get('db')
  const workflowId = c.req.param('id')
  const { envVars, triggerCode, dependencies, deployConfig, ...rest } = c.req.valid('json')
  const dbData: {
    name?: string
    description?: string
    triggerCode?: string
    dependencies?: string
    deployConfig?: string
  } = { ...rest }
  if (envVars !== undefined) {
    // Merge masked secrets with existing decrypted values
    const existing = await db.getWorkflowEnvVars(workflowId)
    const existingByName = new Map(existing.map((v) => [v.name, v]))
    const merged = envVars.map((v) => {
      if (v.isSecret && v.value === SECRET_MASK) {
        const prev = existingByName.get(v.name)
        if (prev) return { name: v.name, value: prev.value, isSecret: true }
      }
      return { name: v.name, value: v.value, isSecret: v.isSecret ?? false }
    })
    await db.setWorkflowEnvVars(workflowId, merged)
  }
  if (triggerCode !== undefined) {
    dbData.triggerCode = triggerCode
  }
  if (dependencies !== undefined) {
    dbData.dependencies = JSON.stringify(dependencies)
  }
  if (deployConfig !== undefined) {
    dbData.deployConfig = JSON.stringify(deployConfig)
  }
  const updated = await db.updateWorkflow(workflowId, dbData)
  return c.json(maskWorkflowSecrets(updated))
})

workflows.patch(
  '/:id/move',
  zValidator('json', z.object({ targetProjectId: z.string().min(1) })),
  async (c) => {
    const db = c.get('db')
    const organizationId = c.get('organizationId')
    const workflow = c.get('workflow')
    if (!workflow) return c.json({ error: 'Not found' }, 404)

    // A move always crosses a project boundary, so a key pinned to one
    // project has no legitimate move to make.
    if (apiKeyProjectPin(c) !== null) {
      return c.json(
        { error: 'A project-scoped API key cannot move workflows between projects' },
        403,
      )
    }

    const { targetProjectId } = c.req.valid('json')

    // The target is read with the caller's roles there: moving into a
    // project is a project admin's act, and a hidden one is not found.
    const target = await db.getProjectIfMember(c.get('userId'), { id: targetProjectId })
    if (!target || target.project.organizationId !== organizationId) {
      return c.json({ error: 'Target project not found' }, 404)
    }
    if (rolesOf(target).projectRole !== 'admin') {
      return c.json({ error: 'Only project admins can move workflows into a project' }, 403)
    }

    if (targetProjectId === workflow.projectId) {
      return c.json({ error: 'Workflow is already in this project' }, 400)
    }

    // Check for env var warnings
    // What the destination cannot supply, judged the way a deploy judges it:
    // one query, both project and org scope, no page limit. Listing the
    // first 100 project variables per reference missed org-level ones and
    // warned about variables that resolve perfectly well.
    const warnings = await unresolvableEnvRefs(db, organizationId, targetProjectId, workflow)

    // Into the target's oldest workspace in the same statement: a workflow
    // left in a workspace of its old project would be read and deleted there.
    const updated = await db.moveWorkflowToProject(workflow.id, targetProjectId)
    if (!updated) return c.json({ error: 'Not found' }, 404)

    return c.json({
      workflow: maskWorkflowSecrets(updated),
      warnings:
        warnings.length > 0 ? `Missing env vars in target project: ${warnings.join(', ')}` : null,
    })
  },
)

workflows.delete('/:id', async (c) => {
  const db = c.get('db')
  const workflowId = c.req.param('id')

  // Every session for this workflow, not just the caller's: a colleague's
  // container would otherwise keep running with no route left to stop it —
  // their session answers 404 once the workflow is gone, while still
  // holding their concurrency slot.
  const runner = c.get('testSessionRunner')
  if (runner) {
    await stopWorkflowTestSessions(
      { db, runner, limits: c.get('testSessionLimits') },
      workflowId,
      'Workflow deleted',
    )
  }

  await db.deleteWorkflow(workflowId)
  return c.json({ ok: true })
})
