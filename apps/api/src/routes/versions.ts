import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import { paginationQuerySchema } from '../lib/pagination.js'
import { validateArtifact, migrateArtifact } from '@awaitstep/ir'
import {
  foldProjectFiles,
  legacyRuntimeSeeds,
  stripProjectOwnedRuntime,
} from '../lib/runtime-fold.js'
import { snapshotFilesOf, toWorkflowFileRows } from '../lib/project-files.js'
import type { AppEnv } from '../types.js'

// `ir` is validated by migrateArtifact + validateArtifact in the handler —
// a second zod parse here would strip keys before migration runs and double
// the schema work on every autosave.
const createVersionSchema = z.object({
  ir: z.unknown(),
})

const lockVersionSchema = z.object({
  locked: z.boolean(),
})

/**
 * Unchanged-IR check for save dedup. Fast path is string equality; the
 * canonical comparison migrates the stored document first so the lazy
 * irVersion stamp (and key-order differences) never register as a change —
 * without it, every legacy workflow's first no-op save would spawn a
 * content-identical version row and a false "undeployed changes" state.
 */
function irUnchanged(storedIr: string, newIr: string): boolean {
  if (storedIr === newIr) return true
  try {
    return canonicalJson(migrateArtifact(JSON.parse(storedIr))) === canonicalJson(JSON.parse(newIr))
  } catch {
    return false
  }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value))
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

export const versions = new Hono<AppEnv>()

versions.get('/:workflowId/versions', zValidator('query', paginationQuerySchema), async (c) => {
  const db = c.get('db')
  const { cursor, limit } = c.req.valid('query')
  const result = await db.listVersionsByWorkflow(c.req.param('workflowId'), { cursor, limit })
  return c.json(result)
})

versions.get('/:workflowId/versions/:versionId', async (c) => {
  const db = c.get('db')
  const version = await db.getWorkflowVersionById(c.req.param('versionId'))
  if (!version || version.workflowId !== c.req.param('workflowId')) {
    return c.json({ error: 'Not found' }, 404)
  }
  return c.json(version)
})

versions.post('/:workflowId/versions', zValidator('json', createVersionSchema), async (c) => {
  const db = c.get('db')
  const workflowId = c.req.param('workflowId')
  const body = c.req.valid('json')

  // New saves are stamped to the current IR version; stored v1 rows migrate
  // lazily on their next save rather than being rewritten in place.
  const migratedIr = migrateArtifact(body.ir)
  const validation = validateArtifact(migratedIr)
  if (!validation.ok) {
    return c.json({ error: 'Invalid IR', details: validation.errors }, 400)
  }

  const [existingResult, workflow, activeDeployment, storedFiles] = await Promise.all([
    db.listVersionsByWorkflow(workflowId, { limit: 1 }),
    db.getWorkflowById(workflowId),
    db.getActiveDeployment(workflowId),
    db.listWorkflowFiles(workflowId),
  ])
  const latest = existingResult.data[0] // most recent version
  if (!workflow) return c.json({ error: 'Workflow not found' }, 404)

  // The project-file table is the truth. An IR that arrives carrying files
  // before the table has any (an import) seeds it once, and inline trigger
  // code / dependencies become handlers.ts / package.json when the project
  // has none yet, so later saves, deploys and the code workspace all see
  // the same set.
  const importedFiles = validation.value.runtime?.files ?? []
  const seeds = storedFiles.length === 0 ? [...importedFiles] : []
  seeds.push(
    ...legacyRuntimeSeeds(
      validation.value.runtime,
      [...storedFiles, ...seeds].map((f) => f.path),
    ),
  )
  const projectFiles =
    seeds.length > 0
      ? [...storedFiles, ...(await db.upsertWorkflowFiles(toWorkflowFileRows(workflowId, seeds)))]
      : storedFiles

  // Persist the schema-parsed value (unknown top-level keys stripped, as the
  // previous zValidator parse did) with the project files snapshotted in and
  // the settings those files own removed, so the version is self-contained
  // and never carries a stale duplicate of handlers.ts or package.json.
  const irString = JSON.stringify(
    stripProjectOwnedRuntime(
      foldProjectFiles(validation.value, projectFiles, { useSnapshot: false }),
      projectFiles,
    ),
  )

  if (latest) {
    // If latest version has NOT been deployed, overwrite it in place
    if (latest.id !== activeDeployment?.versionId) {
      // Check if IR actually changed
      if (irUnchanged(latest.ir, irString)) {
        return c.json(latest, 200)
      }
      // A canvas save is an implicit revert to visual mode: without this
      // reset, an overwritten ejected row would keep its stale source and
      // deploy the old code while the canvas shows the new IR.
      await db.updateVersion(latest.id, {
        ir: irString,
        ...(latest.sourceMode !== 'generated' && {
          sourceMode: 'generated' as const,
          source: null,
          manifest: null,
          baseGeneratedHash: null,
        }),
      })
      const updated = await db.getWorkflowVersionById(latest.id)
      return c.json(updated, 200)
    }

    // If latest version HAS been deployed and IR hasn't changed, return it
    if (irUnchanged(latest.ir, irString)) {
      return c.json(latest, 200)
    }
  }

  // Create new version: either first version, or IR changed from a deployed
  // version. The adapter assigns MAX(version)+1 atomically in SQL.
  const version = await db.createVersion({
    id: nanoid(),
    workflowId,
    ir: irString,
  })

  await db.updateWorkflow(workflowId, { currentVersionId: version.id })

  return c.json(version, 201)
})

versions.patch(
  '/:workflowId/versions/:versionId',
  zValidator('json', lockVersionSchema),
  async (c) => {
    const db = c.get('db')
    const workflowId = c.req.param('workflowId')
    const versionId = c.req.param('versionId')
    const { locked } = c.req.valid('json')

    const version = await db.getWorkflowVersionById(versionId)
    if (!version || version.workflowId !== workflowId) {
      return c.json({ error: 'Not found' }, 404)
    }

    await db.updateVersion(versionId, { locked: locked ? 1 : 0 })
    const updated = await db.getWorkflowVersionById(versionId)
    return c.json(updated)
  },
)

versions.post('/:workflowId/versions/:versionId/revert', async (c) => {
  const db = c.get('db')
  const workflowId = c.req.param('workflowId')
  const versionId = c.req.param('versionId')

  const targetVersion = await db.getWorkflowVersionById(versionId)
  if (!targetVersion || targetVersion.workflowId !== workflowId) {
    return c.json({ error: 'Not found' }, 404)
  }

  // Revert intentionally yields a generated-mode version (createVersion's
  // default): the target's IR is reproduced, but any hand-edited source on
  // an ejected target stays on that old row — re-eject to edit code again.
  // The project-file table follows the snapshot, so the current version
  // deploys the reverted files rather than whatever was live.
  const [newVersion] = await Promise.all([
    db.createVersion({
      id: nanoid(),
      workflowId,
      ir: targetVersion.ir,
    }),
    db.replaceWorkflowFiles(
      workflowId,
      toWorkflowFileRows(workflowId, snapshotFilesOf(targetVersion.ir)),
    ),
  ])

  await db.updateWorkflow(workflowId, { currentVersionId: newVersion.id })

  return c.json(newVersion, 201)
})

versions.delete('/:workflowId/versions/:versionId', async (c) => {
  const db = c.get('db')
  const workflowId = c.req.param('workflowId')
  const versionId = c.req.param('versionId')

  const version = await db.getWorkflowVersionById(versionId)
  if (!version || version.workflowId !== workflowId) {
    return c.json({ error: 'Not found' }, 404)
  }

  if (version.locked === 1) {
    return c.json({ error: 'Version is locked — unlock it before deleting' }, 400)
  }

  const workflow = await db.getWorkflowById(workflowId)
  if (workflow?.currentVersionId === versionId) {
    return c.json({ error: 'Cannot delete the active version' }, 400)
  }

  // Also block if this version is the currently deployed one
  const activeDeployment = await db.getActiveDeployment(workflowId)
  if (activeDeployment?.versionId === versionId) {
    return c.json({ error: 'Cannot delete a deployed version' }, 400)
  }

  await db.deleteVersion(versionId)
  return c.json({ ok: true })
})
