import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { ENV_VAR_NAME, orgCapabilities, variableLevelOf } from '@awaitstep/ir'
import {
  isUniqueViolation,
  type EnvVar,
  type VariablePlace,
  type VariableReachInput,
} from '@awaitstep/db'
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

/** The most places one request may list. */
const MAX_REACH = 50

// Where a project's variable applies (its workspaces) or an organization's
// (its projects): everywhere, or exactly the listed ids. Widening only.
const reachSchema = z.union([
  z.object({ all: z.literal(true) }).strict(),
  z.object({ ids: z.array(z.string().min(1)).min(1).max(MAX_REACH) }).strict(),
])

// The level is in the query; a body naming one is refused with a pointer
// rather than stripped, so a variable never lands somewhere else quietly.
const createEnvVarSchema = z.object({
  name: nameSchema,
  value: valueSchema,
  isSecret: z.boolean().default(false),
  projectId: z.string().optional(),
  workspaceId: z.string().optional(),
  reach: reachSchema.optional(),
})

const updateEnvVarSchema = z.object({
  name: nameSchema.optional(),
  value: valueSchema.optional(),
  isSecret: z.boolean().optional(),
  reach: reachSchema.optional(),
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

const NO_REACH_AT_WORKSPACE = 'A workspace’s variable applies to that workspace only'

function reachInput(reach: z.infer<typeof reachSchema>): VariableReachInput {
  return 'ids' in reach ? { all: false, ids: reach.ids } : { all: true }
}

/** The ids asked for that the variable does not reach: other level, taken, or not the place's. */
function skippedOf(reach: VariableReachInput, reached: string[]): string[] {
  if (reach.all) return []
  const got = new Set(reached)
  return [...new Set(reach.ids)].filter((id) => !got.has(id))
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
      ? await db.listEnvVarsByOrganization(
          place.organizationId,
          { cursor, limit },
          c.get('userId'),
          {
            seeAll:
              c.get('orgRole') !== null &&
              orgCapabilities(c.get('orgRole')!).manageSettings.allowed,
          },
        )
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
  if (body.reach && place.level === 'workspace') {
    return c.json({ error: NO_REACH_AT_WORKSPACE }, 400)
  }
  const reach = body.reach ? reachInput(body.reach) : null
  try {
    // The insert itself checks the place is the organization's and the
    // author can open it. A list is written with it in one atomic batch: a
    // variable never exists without the places it was created for.
    const created = { id: nanoid(), place, createdBy: c.get('userId'), name: body.name }
    let envVar: EnvVar | null
    let skipped: string[] = []
    if (reach && !reach.all) {
      const written = await db.createEnvVarWithReach(
        { ...created, value: body.value, isSecret: body.isSecret },
        reach.ids,
      )
      if ('failure' in written) {
        if (written.failure === 'taken') {
          return c.json(
            {
              error: 'Every place chosen already has its own value of this variable',
              skipped: [...new Set(reach.ids)],
            },
            409,
          )
        }
        return c.json({ error: 'Not found' }, 404)
      }
      envVar = written.row
      skipped = skippedOf(reach, written.reached)
    } else {
      envVar = await db.createEnvVar({ ...created, value: body.value, isSecret: body.isSecret })
    }
    if (!envVar) return c.json({ error: 'Not found' }, 404)
    await recordAudit(c, {
      event: 'variable.create',
      facts: { name: body.name, secret: body.isSecret, ...reachFacts(reach, skipped) },
      ...auditPlace(place),
    })
    return c.json({ ...record(envVar), skipped }, 201)
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
  if (body.reach && place.level === 'workspace') {
    return c.json({ error: NO_REACH_AT_WORKSPACE }, 400)
  }
  const { reach: askedReach, ...fields } = body
  const reach = askedReach ? reachInput(askedReach) : null
  try {
    let updated: EnvVar | null
    let skipped: string[] = []
    if (reach && !reach.all) {
      // The fields and the added places are one atomic batch: an edit that
      // would narrow the variable writes nothing.
      const written = await db.updateEnvVarWithReach(id, place, fields, reach.ids)
      if ('failure' in written) {
        if (written.failure === 'narrowing') {
          return c.json(
            {
              error: 'This variable already applies everywhere; places can only be added',
              details: [{ path: 'reach', message: 'Applies everywhere already' }],
            },
            422,
          )
        }
        updated = null
      } else {
        updated = written.row
        skipped = skippedOf(reach, written.reached)
      }
    } else {
      updated = await db.updateEnvVar(id, place, reach ? { ...fields, allPlaces: true } : fields)
    }
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
      facts: {
        name: updated.name,
        change: variableChange(body),
        secret: updated.isSecret,
        ...reachFacts(reach, skipped),
      },
      ...auditPlace(place),
    })
    return c.json({ ...record(updated), skipped })
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

/** What a write did to where the variable applies, for the audit trail. */
function reachFacts(reach: VariableReachInput | null, skipped: string[]) {
  if (!reach) return {}
  return reach.all
    ? { reach: 'everywhere' }
    : { reach: `${reach.ids.length - skipped.length} added`, skipped: skipped.length }
}

/** What an edit changed, in words — never the value. */
function variableChange(body: z.infer<typeof updateEnvVarSchema>): string | undefined {
  const parts = [
    body.name !== undefined ? 'Renamed' : null,
    body.value !== undefined ? 'Value changed' : null,
    body.isSecret === true ? 'Now secret' : body.isSecret === false ? 'No longer secret' : null,
    body.reach ? 'Applies to more places' : null,
  ].filter((part): part is string => part !== null)
  return parts.length > 0 ? parts.join(', ') : undefined
}
