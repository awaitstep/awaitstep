import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { ACCESS_REASONS, WORKSPACE_COLOURS, slugify, workspaceCapabilities } from '@awaitstep/ir'
import { isUniqueViolation } from '@awaitstep/db'
import { zValidator } from '../lib/validation.js'
import { apiKeyWorkspacePin, isSession } from '../middleware/auth.js'
import { CHANGED_MEANWHILE, lockBodySchema, lockResponse } from '../lib/locks.js'
import { sharedItemRecord, sharedListQuerySchema } from '../lib/sharing.js'
import { FOR_KEY, FOR_SESSION, rolesOf, workspaceRecord } from '../lib/scope-records.js'
import { workspaceSlugSchema } from '../lib/slugs.js'
import { recordAudit } from '../lib/audit.js'
import type { AppEnv } from '../types.js'

const colourSchema = z.enum(WORKSPACE_COLOURS)

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(255),
  /** Defaults to the name, slugified. */
  slug: workspaceSlugSchema.optional(),
  description: z.string().max(1000).optional(),
  colour: colourSchema.optional(),
  /** "Who can get in → choose people": people in the organization, each with a role here. */
  members: z
    .array(z.object({ userId: z.string().min(1), role: z.enum(['admin', 'editor', 'viewer']) }))
    .max(100)
    .optional(),
})

const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  slug: workspaceSlugSchema.optional(),
  description: z.string().max(1000).nullable().optional(),
  colour: colourSchema.optional(),
})

const moveWorkflowsSchema = z.object({
  workflowIds: z.array(z.string().min(1)).min(1).max(100),
  targetWorkspaceId: z.string().min(1),
})

// Who may create, rename, delete or move: the router's capability gates.
export const workspaces = new Hono<AppEnv>()

const SLUG_TAKEN = 'Another workspace in this project already uses that URL'

workspaces.get('/', async (c) => {
  const rows = await c.get('db').listWorkspacesByProject(c.get('projectId'), c.get('userId'))
  const audience = isSession(c) ? FOR_SESSION : FOR_KEY
  return c.json({ data: rows.map((row) => workspaceRecord(row, audience)) })
})

workspaces.post('/', zValidator('json', createWorkspaceSchema), async (c) => {
  const body = c.req.valid('json')
  // A slug made from the name fails the same way a given one would: empty
  // ("needs a letter or digit") or a page's ("taken by a page").
  const derived = body.slug === undefined
  const parsed = workspaceSlugSchema.safeParse(body.slug ?? slugify(body.name))
  if (!parsed.success) {
    const message =
      derived && !slugify(body.name)
        ? 'The name needs at least one letter or number'
        : (parsed.error.issues[0]?.message ?? 'Invalid URL')
    return c.json(
      {
        error: 'Validation failed',
        details: [{ path: derived ? 'name' : 'slug', message }],
      },
      422,
    )
  }
  const db = c.get('db')
  const members = [...new Map((body.members ?? []).map((m) => [m.userId, m])).values()]
  // Who can get in is a person's decision: a key creates the workspace, not its roster.
  if (members.length > 0 && !isSession(c)) {
    return c.json({ error: 'An API key cannot add people to a workspace' }, 403)
  }
  if (members.length > 0) {
    // Everyone named must already be in the organization: the write skips
    // anyone who is not, so the refusal has to come first — one count.
    const userIds = members.map((m) => m.userId)
    const check = await db.checkInOrganization(c.get('organizationId'), { userIds })
    if (check.users !== userIds.length) {
      return c.json({ error: 'Everyone you add must already be in the organization' }, 409)
    }
  }
  try {
    const workspace = await db.createWorkspace(
      {
        id: nanoid(),
        projectId: c.get('projectId'),
        name: body.name,
        slug: parsed.data,
        description: body.description?.trim() || null,
        colour: body.colour,
        createdBy: c.get('userId'),
      },
      members,
    )
    if (!workspace) return c.json({ error: SLUG_TAKEN }, 409)
    return c.json(workspace, 201)
  } catch (error) {
    // Two creates racing past the statement's own check meet the unique index.
    if (isUniqueViolation(error)) return c.json({ error: SLUG_TAKEN }, 409)
    throw error
  }
})

workspaces.get('/:id', async (c) => {
  const workspace = await c.get('db').getWorkspaceById(c.get('workspaceId')!)
  if (!workspace) return c.json({ error: 'Not found' }, 404)
  return c.json(workspace)
})

workspaces.patch('/:id', zValidator('json', updateWorkspaceSchema), async (c) => {
  const body = c.req.valid('json')
  try {
    const updated = await c.get('db').updateWorkspace(c.get('workspaceId')!, {
      ...body,
      description: body.description === undefined ? undefined : body.description?.trim() || null,
    })
    if (!updated) {
      // requireWorkspace found the row a moment ago, so a miss is the slug check.
      if (body.slug !== undefined) return c.json({ error: SLUG_TAKEN }, 409)
      return c.json({ error: 'Not found' }, 404)
    }
    return c.json(updated)
  } catch (error) {
    if (isUniqueViolation(error)) return c.json({ error: SLUG_TAKEN }, 409)
    throw error
  }
})

workspaces.delete('/:id', async (c) => {
  const db = c.get('db')
  const id = c.get('workspaceId')!
  // Recorded at the project: the workspace it would name is gone or stays as it was.
  const audited = { facts: { name: c.get('workspaceName') ?? id }, projectId: c.get('projectId') }
  // Locks and "not the last" are checked in the statement; only a refusal reads why.
  if (await db.deleteWorkspaceUnlessBlocked(id)) {
    await recordAudit(c, { event: 'workspace.delete', ...audited })
    return c.json({ ok: true })
  }
  const locks = await db.getWorkspaceLocks(id)
  if (!locks) return c.json({ error: 'Not found' }, 404)
  // Nothing calls across workspaces until the Call Workflow node links callers (D-B6-3).
  const can = workspaceCapabilities(c.get('workspaceRole')!, { ...locks, sharedInUse: false })
  const reason = can.delete.reason ?? CHANGED_MEANWHILE
  await recordAudit(c, {
    event: 'workspace.delete.blocked',
    ...audited,
    facts: { ...audited.facts, reason },
  })
  return c.json({ error: reason }, 409)
})

/** "Shared with Sales": what the project's other workspaces shared, read-only here. */
workspaces.get('/:id/shared', zValidator('query', sharedListQuerySchema), async (c) => {
  const { cursor, limit, kind } = c.req.valid('query')
  const page = await c.get('db').listSharedWorkflows(
    {
      projectId: c.get('projectId'),
      organizationId: c.get('organizationId'),
      viewer: c.get('userId'),
      exceptWorkspaceId: c.get('workspaceId')!,
      kind,
    },
    { cursor, limit },
  )
  // A workspace key opens its own workspace only, which this list leaves out.
  const opens = apiKeyWorkspacePin(c) === null
  return c.json({
    ...page,
    data: page.data.map((row) => sharedItemRecord(row, 'workspace', opens)),
  })
})

/**
 * Turns the workspace's own deletion lock on or off. While its project is
 * locked the project's lock decides, and the switch is refused.
 */
workspaces.put('/:id/lock', zValidator('json', lockBodySchema), async (c) => {
  const db = c.get('db')
  const id = c.get('workspaceId')!
  const { locked } = c.req.valid('json')
  const row = await db.setWorkspaceLock(id, c.get('userId'), locked)
  if (row) {
    if (row.changed) {
      await recordAudit(c, {
        event: locked ? 'workspace.lock' : 'workspace.unlock',
        facts: { name: c.get('workspaceName') ?? id },
        projectId: c.get('projectId'),
        workspaceId: id,
      })
    }
    return c.json(lockResponse(row))
  }
  const locks = await db.getWorkspaceLocks(id)
  if (!locks) return c.json({ error: 'Not found' }, 404)
  const reason = locks.lockedByProject
    ? ACCESS_REASONS.lockedBy(locks.lockedByProject)
    : CHANGED_MEANWHILE
  return c.json({ error: reason }, 409)
})

/**
 * Moves workflows to another workspace of the same project. A target that
 * is not this project's is not found; ids that are not in this workspace
 * move nothing, and the response lists what did.
 */
workspaces.post('/:id/move-workflows', zValidator('json', moveWorkflowsSchema), async (c) => {
  const db = c.get('db')
  const { workflowIds, targetWorkspaceId } = c.req.valid('json')
  const workspaceId = c.get('workspaceId')!
  if (targetWorkspaceId === workspaceId) {
    return c.json({ error: 'The workflows are already in this workspace' }, 400)
  }
  // The same read requireWorkspace made for the source, for the target: one
  // the caller cannot open is not found, and moving workflows into one is
  // building there. The update checks the pair again, so a target gone
  // meanwhile moves nothing.
  const target = await db.getWorkspaceIfMember(c.get('userId'), { id: targetWorkspaceId })
  if (!target || target.projectId !== c.get('projectId')) {
    return c.json({ error: 'Target workspace not found' }, 404)
  }
  const can = workspaceCapabilities(rolesOf(target).workspaceRole!, {
    ownLock: false,
    lockedByProject: null,
    isLastWorkspace: false,
    sharedInUse: false,
  }).edit
  if (!can.allowed) return c.json({ error: can.reason }, 403)
  const moved = await db.moveWorkflowsToWorkspace(workspaceId, targetWorkspaceId, workflowIds)
  await recordAudit(
    c,
    ...moved.map((workflow) => ({
      event: 'workflow.move' as const,
      facts: { name: workflow.name, place: target.workspaceName },
      projectId: c.get('projectId'),
      workspaceId,
    })),
  )
  return c.json({ moved: moved.map((workflow) => workflow.id) })
})
