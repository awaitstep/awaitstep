import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import { paginationQuerySchema } from '../lib/pagination.js'
import {
  projectFilePathError,
  validateArtifact,
  migrateArtifact,
  type ArtifactIR,
} from '@awaitstep/ir'
import { legacyRuntimeSeeds, withoutStaleProjectRuntime } from '../lib/runtime-fold.js'
import { projectWriteRuleErrors } from '../lib/project-write-rules.js'
import { snapshotFilesOf, toWorkflowFileRows } from '../lib/project-files.js'
import { graphHash } from '../lib/graph-hash.js'
import {
  VERSION_CHANGED,
  commitProjectFiles,
  persistVersion,
  readForSave,
  storedDocument,
  type VersionSaveResult,
} from '../lib/version-save.js'
import { recordAudit, type AuditRecord } from '../lib/audit.js'
import type { AppEnv } from '../types.js'

// `ir` is validated by migrateArtifact + validateArtifact in the handler —
// a second zod parse here would strip keys before migration runs and double
// the schema work on every autosave.
const createVersionSchema = z.object({
  ir: z.unknown(),
  /** The `graphHash` the client loaded (`GET /full`, or the last save's answer). */
  baseGraphHash: z.string().min(1).max(64).optional(),
})

const lockVersionSchema = z.object({
  locked: z.boolean(),
})

/** What a stored row that cannot be read vouches for: nothing. */
const NOTHING_STORED: Pick<ArtifactIR, 'runtime'> = {}

/** A save's answer: the version row with its graph hash, or the 409 with the current one. */
function saveResponse(c: Context<AppEnv>, result: VersionSaveResult) {
  if (result.status === 409) {
    const { currentVersionId, currentGraphHash } = result
    return c.json({ error: VERSION_CHANGED, currentVersionId, currentGraphHash }, 409)
  }
  return c.json({ ...result.version, graphHash: result.graphHash }, result.status)
}

/** Where a version event is recorded: the workflow's workspace, under its name. */
function workflowAudit(
  c: Context<AppEnv>,
  workflowId: string,
): Omit<AuditRecord, 'event'> & {
  facts: { name: string }
} {
  const workflow = c.get('workflow')
  return {
    facts: { name: workflow?.name ?? workflowId },
    projectId: workflow?.projectId ?? c.get('projectId'),
    workspaceId: workflow?.workspaceId ?? c.get('workspaceId'),
  }
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

  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Workflow not found' }, 404)
  // Everything the save is judged against, in one round: the files decide
  // the seeds below, the version and deployment decide how it is written.
  const reads = await readForSave(db, workflowId)
  const storedFiles = reads.files

  // A file snapshot or legacy trigger-code / dependencies block is honoured
  // on a first version and, after that, only where the latest stored version
  // carries the same field: a stale copy (a document loaded before Code
  // deleted the files) must not bring them back, and the files are the way
  // to add either. A stored row that cannot be read vouches for nothing.
  const ir = withoutStaleProjectRuntime(
    validation.value,
    reads.latest ? (storedDocument(reads.latest.ir) ?? NOTHING_STORED) : null,
  )

  // The project-file table is the truth. An IR that arrives carrying files
  // before the table has any (an import) seeds it once, and inline trigger
  // code / dependencies become handlers.ts / package.json when the project
  // has none yet, so later saves, deploys and the code workspace all see
  // the same set.
  const importedFiles = ir.runtime?.files ?? []
  const seeds = storedFiles.length === 0 ? [...importedFiles] : []
  seeds.push(
    ...legacyRuntimeSeeds(
      ir.runtime,
      [...storedFiles, ...seeds].map((f) => f.path),
    ),
  )
  // Stored snapshots are grandfathered by `validateProjectFiles`, but a path
  // that is new to this save is a write and meets the same rules as a
  // `PUT /files`: generated paths (`worker.ts`, `nodes/**`, `awaitstep/**`, …)
  // and the step-source folder (`steps/**`) are refused, and so are the
  // handler rules (annotation file beside modules, look-alike names, a
  // second file for one entry) and the manifest contract — or a first save
  // could smuggle past the per-file write rules a project no deploy accepts.
  const storedPaths = new Set(storedFiles.map((file) => file.path))
  const newSeeds = seeds.filter((file) => !storedPaths.has(file.path))
  const pathProblems = newSeeds.flatMap((file) => {
    const error = projectFilePathError(file.path)
    return error ? [{ path: file.path, message: error }] : []
  })
  if (pathProblems.length === 0 && newSeeds.length > 0) {
    const writeErrors = await projectWriteRuleErrors({
      db,
      workflow,
      version: reads.latest,
      existing: storedFiles,
      changes: newSeeds.map(({ path, source }) => ({ path, source })),
    })
    pathProblems.push(...writeErrors.map(({ path, message }) => ({ path, message })))
  }
  if (pathProblems.length > 0) {
    return c.json({ error: 'Invalid project file path', details: pathProblems }, 422)
  }

  // Persist the schema-parsed value (unknown top-level keys stripped, as the
  // previous zValidator parse did); the save folds the project files in and
  // writes the seeds only when it writes the version.
  const result = await persistVersion(
    db,
    {
      workflowId,
      ir,
      userId: c.get('userId'),
      baseGraphHash: body.baseGraphHash,
      seeds: toWorkflowFileRows(workflowId, seeds),
    },
    reads,
  )
  return saveResponse(c, result)
})

/**
 * Snapshots the live project files into the current version — the version a
 * files-only edit in Code lands in. Same overwrite-or-create rule and no-op
 * as a save; no precondition, since the graph is whatever the version holds.
 */
versions.post('/:workflowId/versions/commit', async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Workflow not found' }, 404)
  const result = await commitProjectFiles(c.get('db'), {
    workflowId: workflow.id,
    userId: c.get('userId'),
  })
  if ('error' in result) return c.json({ error: result.error }, result.status)
  return saveResponse(c, result)
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

  // Revert reproduces the target's IR as a new version. The project-file
  // table follows the snapshot, so the current version deploys the reverted
  // files rather than whatever was live.
  const [newVersion] = await Promise.all([
    db.createVersion({
      id: nanoid(),
      workflowId,
      ir: targetVersion.ir,
      createdBy: c.get('userId'),
    }),
    db.replaceWorkflowFiles(
      workflowId,
      toWorkflowFileRows(workflowId, snapshotFilesOf(targetVersion.ir)),
    ),
  ])

  await db.advanceCurrentVersion(workflowId, newVersion)
  const audited = workflowAudit(c, workflowId)
  await recordAudit(c, {
    event: 'version.revert',
    ...audited,
    facts: { ...audited.facts, version: targetVersion.version },
  })

  return c.json({ ...newVersion, graphHash: graphHash(newVersion.ir) }, 201)
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
  const audited = workflowAudit(c, workflowId)
  await recordAudit(c, {
    event: 'version.delete',
    ...audited,
    facts: { ...audited.facts, version: version.version },
  })
  return c.json({ ok: true })
})
