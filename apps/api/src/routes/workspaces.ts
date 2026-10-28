import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { ACCESS_REASONS, WORKSPACE_COLOURS, slugify } from '@awaitstep/ir'
import { isUniqueViolation } from '@awaitstep/db'
import { zValidator } from '../lib/validation.js'
import { FOR_KEY, FOR_SESSION, workspaceRecord } from '../lib/scope-records.js'
import { workspaceSlugSchema } from '../lib/slugs.js'
import type { AppEnv } from '../types.js'

const colourSchema = z.enum(WORKSPACE_COLOURS)

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(255),
  /** Defaults to the name, slugified. */
  slug: workspaceSlugSchema.optional(),
  description: z.string().max(1000).optional(),
  colour: colourSchema.optional(),
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

// Who may create, rename, delete or move: the router's requireOrgAdmin.
export const workspaces = new Hono<AppEnv>()

const SLUG_TAKEN = 'Another workspace in this project already uses that URL'

workspaces.get('/', async (c) => {
  const rows = await c.get('db').listWorkspacesByProject(c.get('projectId'))
  const orgRole = c.get('orgRole') ?? 'member'
  const audience = c.get('apiKeyScopes') === null ? FOR_SESSION : FOR_KEY
  return c.json({ data: rows.map((row) => workspaceRecord(row, orgRole, audience)) })
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
  try {
    const workspace = await c.get('db').createWorkspace({
      id: nanoid(),
      projectId: c.get('projectId'),
      name: body.name,
      slug: parsed.data,
      description: body.description?.trim() || null,
      colour: body.colour,
      createdBy: c.get('userId'),
    })
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
  const deleted = await c.get('db').deleteWorkspaceUnlessLast(c.get('workspaceId')!)
  if (!deleted) return c.json({ error: ACCESS_REASONS.lastWorkspace }, 409)
  return c.json({ ok: true })
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
  // The same read requireWorkspace made for the source, for the target; the
  // update checks the pair again, so a target gone meanwhile moves nothing.
  const target = await db.getWorkspaceInProject(c.get('projectId'), { id: targetWorkspaceId })
  if (!target) return c.json({ error: 'Target workspace not found' }, 404)
  const moved = await db.moveWorkflowsToWorkspace(workspaceId, targetWorkspaceId, workflowIds)
  return c.json({ moved })
})
