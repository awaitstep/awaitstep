import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { ENV_VAR_NAME, variableLevelOf } from '@awaitstep/ir'
import { isUniqueViolation, type EnvVar, type VariablePlace } from '@awaitstep/db'
import { zValidator } from '../lib/validation.js'
import { paginationQuerySchema } from '../lib/pagination.js'
import { addressedLevel } from '../middleware/level.js'
import { recordAudit, type AuditRecord } from '../lib/audit.js'
import type { AppEnv } from '../types.js'

// Variables at three levels (B4), addressed at the level they are set at —
// `?org=` the organization's, `&project=` a project's, `&workspace=` a
// workspace's — which the router resolved with the caller's roles and gated
// (`requireLevelCan('manageVariables')` on every write): org owners and
// admins set the organization's, project admins a project's, workspace
// admins a workspace's; anyone who can open the level reads it. A key's
// project or workspace pin is its address. A write by id is pinned to the
// addressed place by the statement, so a row of another level is not found.

const SECRET_MASK = '••••••••'

const nameSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(ENV_VAR_NAME, 'Must be uppercase letters, digits, and underscores (e.g. MY_API_KEY)')

const valueSchema = z.string().min(1).max(10_000)

// The level is in the query; a body naming one is refused with a pointer
// rather than stripped, so a variable never lands somewhere else quietly.
const createEnvVarSchema = z.object({
  name: nameSchema,
  value: valueSchema,
  isSecret: z.boolean().default(false),
  projectId: z.string().optional(),
  workspaceId: z.string().optional(),
})

const updateEnvVarSchema = z.object({
  name: nameSchema.optional(),
  value: valueSchema.optional(),
  isSecret: z.boolean().optional(),
})

const ADDRESS_IN_QUERY =
  'Address the level in the query (?org=, &project=, &workspace=), not in the body'

/** Where the request is addressed: the level and the ids the scope middleware resolved. */
function placeOf(c: Context<AppEnv>): VariablePlace {
  const level = addressedLevel(c)
  const organizationId = c.get('organizationId')
  if (level === 'organization') return { level, organizationId }
  if (level === 'project') return { level, organizationId, projectId: c.get('projectId') }
  return {
    level,
    organizationId,
    projectId: c.get('projectId'),
    workspaceId: c.get('workspaceId')!,
  }
}

/** Where a variable event is recorded: the level it is set at. */
function auditPlace(place: VariablePlace): Pick<AuditRecord, 'projectId' | 'workspaceId'> {
  if (place.level === 'organization') return {}
  return {
    projectId: place.projectId,
    workspaceId: place.level === 'workspace' ? place.workspaceId : null,
  }
}

/** A row as the API answers it: its level, the secret masked. */
function record<T extends EnvVar>(row: T) {
  return { ...row, level: variableLevelOf(row), value: row.isSecret ? SECRET_MASK : row.value }
}

function alreadySet(name: string) {
  return {
    error: `${name} is already set here. Edit it instead`,
    details: [{ path: 'name', message: 'Already set here. Edit it instead' }],
  }
}

export const envVars = new Hono<AppEnv>()

/** The addressed level's own rows; the organization's carry how many projects the caller can open override each. */
envVars.get('/', zValidator('query', paginationQuerySchema), async (c) => {
  const db = c.get('db')
  const place = placeOf(c)
  const { cursor, limit } = c.req.valid('query')
  const result =
    place.level === 'organization'
      ? await db.listEnvVarsByOrganization(place.organizationId, { cursor, limit }, c.get('userId'))
      : place.level === 'project'
        ? await db.listEnvVarsByProject(place.organizationId, place.projectId, { cursor, limit })
        : await db.listEnvVarsByWorkspace(
            place.organizationId,
            place.projectId,
            place.workspaceId,
            { cursor, limit },
          )
  return c.json({ data: result.data.map(record), nextCursor: result.nextCursor })
})

/**
 * The level's resolved view: at a project each name once (its own value
 * over the org's) with where it is set and which workspaces the caller can
 * open override it; at a workspace each name once, the closest level
 * winning, with its source and what it replaces.
 */
envVars.get('/resolved', async (c) => {
  const db = c.get('db')
  const place = placeOf(c)
  if (place.level === 'organization') {
    return c.json(
      { error: 'Resolved variables are read at a project or a workspace (&project=, &workspace=)' },
      400,
    )
  }
  if (place.level === 'project') {
    const rows = await db.listResolvedVariablesForProject(
      place.organizationId,
      place.projectId,
      c.get('userId'),
    )
    return c.json({ data: rows.map(record) })
  }
  const rows = await db.listResolvedVariablesForWorkspace(
    place.organizationId,
    place.projectId,
    place.workspaceId,
  )
  return c.json({ data: rows.map(record) })
})

/** Set a variable at the addressed level; a name already set there is `409`. */
envVars.post('/', zValidator('json', createEnvVarSchema), async (c) => {
  const db = c.get('db')
  const body = c.req.valid('json')
  if (body.projectId !== undefined || body.workspaceId !== undefined) {
    return c.json({ error: ADDRESS_IN_QUERY }, 400)
  }
  const place = placeOf(c)
  try {
    // The insert itself checks the place is the organization's and the
    // author can open it.
    const envVar = await db.createEnvVar({
      id: nanoid(),
      place,
      createdBy: c.get('userId'),
      name: body.name,
      value: body.value,
      isSecret: body.isSecret,
    })
    if (!envVar) return c.json({ error: 'Not found' }, 404)
    await recordAudit(c, {
      event: 'variable.create',
      facts: { name: body.name, secret: body.isSecret },
      ...auditPlace(place),
    })
    return c.json(record(envVar), 201)
  } catch (error) {
    if (isUniqueViolation(error)) return c.json(alreadySet(body.name), 409)
    throw error
  }
})

envVars.patch('/:id', zValidator('json', updateEnvVarSchema), async (c) => {
  const db = c.get('db')
  const id = c.req.param('id')
  const body = c.req.valid('json')
  const place = placeOf(c)
  try {
    const updated = await db.updateEnvVar(id, place, body)
    if (!updated) {
      // One check, only on this error path: tell the secret-reveal refusal from
      // a plain miss, so the caller learns what to do instead of chasing a 404.
      if (body.isSecret === false && body.value === undefined) {
        if (await db.isSecretVariableAt(id, place)) {
          return c.json(
            {
              error: 'Provide a new value when making a secret variable non-secret',
              details: [{ path: 'value', message: 'Enter the value to stop hiding it' }],
            },
            422,
          )
        }
      }
      return c.json({ error: 'Not found' }, 404)
    }
    await recordAudit(c, {
      event: 'variable.update',
      facts: { name: updated.name, change: variableChange(body), secret: updated.isSecret },
      ...auditPlace(place),
    })
    return c.json(record(updated))
  } catch (error) {
    if (isUniqueViolation(error) && body.name) return c.json(alreadySet(body.name), 409)
    throw error
  }
})

envVars.delete('/:id', async (c) => {
  const place = placeOf(c)
  const name = await c.get('db').deleteEnvVar(c.req.param('id'), place)
  if (!name) return c.json({ error: 'Not found' }, 404)
  await recordAudit(c, { event: 'variable.delete', facts: { name }, ...auditPlace(place) })
  return c.json({ ok: true })
})

/** What an edit changed, in words — never the value. */
function variableChange(body: z.infer<typeof updateEnvVarSchema>): string | undefined {
  const parts = [
    body.name !== undefined ? 'Renamed' : null,
    body.value !== undefined ? 'Value changed' : null,
    body.isSecret === true ? 'Now secret' : body.isSecret === false ? 'No longer secret' : null,
  ].filter((part): part is string => part !== null)
  return parts.length > 0 ? parts.join(', ') : undefined
}
