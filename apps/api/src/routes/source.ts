import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import { prepareWorkflow, isPrepareError, parseStoredSource } from '../lib/workflow-prepare.js'
import { resolveProvider } from '../lib/provider-resolver.js'
import {
  bundleHash,
  bundleCodeFiles,
  bundleEjectFiles,
  contentHash,
  validateBundle,
} from '@awaitstep/codegen'
import type { GeneratedBundle, StepManifest } from '@awaitstep/codegen'
import { transpileToJS } from '@awaitstep/codegen/transpile'
import { loadArtifact } from '@awaitstep/ir'
import type { AppEnv } from '../types.js'

const MAX_SOURCE_FILES = 100
const MAX_FILE_BYTES = 512_000
const MAX_TOTAL_BYTES = 2_000_000

const sourceFileSchema = z.object({
  path: z.string().min(1).max(300),
  source: z.string().max(MAX_FILE_BYTES),
  role: z.enum(['entry', 'module', 'config', 'meta', 'asset']),
})

const putSourceSchema = z
  .object({
    entry: z.string().min(1).max(300),
    files: z.array(sourceFileSchema).min(1).max(MAX_SOURCE_FILES),
  })
  .refine((b) => b.files.some((f) => f.path === b.entry), {
    message: 'entry must reference one of the files',
  })
  .refine((b) => b.files.reduce((sum, f) => sum + f.source.length, 0) <= MAX_TOTAL_BYTES, {
    message: 'Source exceeds the total size limit',
  })

const ejectSchema = z.object({
  versionId: z.string().optional(),
})

export const source = new Hono<AppEnv>()

/**
 * Eject: materialize the current (or given) version's generated bundle as a
 * stored, user-editable source — a new version row with sourceMode
 * 'ejected', region markers in the entry, a step manifest, and the
 * generated-bundle hash as the drift baseline. The IR is retained verbatim.
 */
source.post('/:workflowId/eject', zValidator('json', ejectSchema), async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  if (workflow.kind === 'script') {
    return c.json({ error: 'Eject is not yet supported for functions' }, 400)
  }
  const body = c.req.valid('json')

  const prepared = await prepareWorkflow({
    db,
    workflow,
    organizationId: c.get('organizationId'),
    projectId: c.get('projectId'),
    nodeRegistry: c.get('nodeRegistry'),
    versionId: body.versionId,
    requireEnvVars: false,
    eject: true,
  })
  if (isPrepareError(prepared)) {
    return c.json({ error: prepared.error, details: prepared.details }, prepared.status as 400)
  }

  if (!prepared.bundle.manifest) {
    return c.json({ error: 'Eject produced no step manifest' }, 500)
  }

  // The FOLDED IR is persisted so the ejected version is fully
  // self-contained: its runtime block (trigger code especially) matches the
  // handlers compiled into the stored bundle, and later column changes
  // cannot silently diverge wrangler config from the frozen source. The
  // drift baseline is the hash of exactly what is stored.
  const stored: GeneratedBundle = {
    entry: prepared.bundle.entry,
    files: bundleEjectFiles(prepared.bundle),
  }
  const version = await db.createVersion({
    id: nanoid(),
    workflowId: workflow.id,
    ir: JSON.stringify(prepared.ir),
    sourceMode: 'ejected',
    source: JSON.stringify(stored),
    manifest: JSON.stringify(prepared.bundle.manifest),
    baseGeneratedHash: bundleHash(stored),
  })
  await db.updateWorkflow(workflow.id, { currentVersionId: version.id })

  return c.json(
    {
      versionId: version.id,
      version: version.version,
      sourceMode: 'ejected',
      entry: stored.entry,
      fileCount: stored.files.length,
    },
    201,
  )
})

/**
 * Read the deployable source for a version. Ejected/sdk versions return
 * their stored bundle; generated versions return a freshly generated
 * read-only view (nothing is persisted).
 */
source.get('/:workflowId/source', async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const versionId = c.req.query('versionId') ?? workflow.currentVersionId
  if (!versionId) return c.json({ error: 'No version to read' }, 400)

  const version = await db.getWorkflowVersionById(versionId)
  if (!version || version.workflowId !== workflow.id) {
    return c.json({ error: 'Version not found' }, 404)
  }

  if (version.sourceMode !== 'generated') {
    if (!version.source) {
      return c.json(
        { error: 'Version is in ejected/sdk mode but has no stored source — re-eject to repair' },
        422,
      )
    }
    const stored = parseStoredSource(version.source, version.manifest)
    if ('error' in stored) {
      return c.json({ error: stored.error }, stored.status as 422)
    }
    return c.json({
      versionId: version.id,
      sourceMode: version.sourceMode,
      entry: stored.bundle.entry,
      files: stored.bundle.files,
      manifest: stored.manifest,
      baseGeneratedHash: version.baseGeneratedHash,
    })
  }

  const prepared = await prepareWorkflow({
    db,
    workflow,
    organizationId: c.get('organizationId'),
    projectId: c.get('projectId'),
    nodeRegistry: c.get('nodeRegistry'),
    version,
    requireEnvVars: false,
  })
  if (isPrepareError(prepared)) {
    return c.json({ error: prepared.error, details: prepared.details }, prepared.status as 400)
  }
  // Project-owned files carry their content hash — the same value the file
  // routes serve as ETag — so a client editing from this one response has a
  // precondition that matches the text it read.
  const projectPaths = new Set((prepared.ir.runtime?.files ?? []).map((f) => f.path))
  return c.json({
    versionId,
    sourceMode: 'generated',
    entry: prepared.bundle.entry,
    files: prepared.bundle.files.map((f) =>
      projectPaths.has(f.path) ? { ...f, hash: contentHash(f.source) } : f,
    ),
    manifest: prepared.bundle.manifest ?? null,
    baseGeneratedHash: null,
  })
})

/**
 * Push edited source back onto the current ejected/sdk version: drift
 * validation against the retained IR + manifest, then a transpile smoke
 * test, then the stored bundle is replaced in place. The eject-time drift
 * baseline is kept.
 */
source.put('/:workflowId/source', zValidator('json', putSourceSchema), async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  if (!workflow.currentVersionId) return c.json({ error: 'No version to update' }, 400)
  const body = c.req.valid('json')

  const version = await db.getWorkflowVersionById(workflow.currentVersionId)
  if (!version || version.workflowId !== workflow.id) {
    return c.json({ error: 'Version not found' }, 404)
  }
  if (version.sourceMode === 'generated') {
    return c.json({ error: 'Version is in generated mode — eject before editing source' }, 400)
  }
  if (version.locked === 1) {
    return c.json({ error: 'Version is locked' }, 400)
  }

  if (!version.source) {
    return c.json(
      { error: 'Version is in ejected/sdk mode but has no stored source — re-eject to repair' },
      422,
    )
  }
  const loaded = loadArtifact(version.ir)
  if (!loaded.ok) {
    return c.json({ error: 'Stored IR is invalid', details: loaded.errors }, 400)
  }
  const stored = parseStoredSource(version.source, version.manifest)
  if ('error' in stored) {
    return c.json({ error: stored.error }, stored.status as 422)
  }
  const manifest: StepManifest = stored.manifest

  const bundle: GeneratedBundle = { entry: body.entry, files: body.files }
  // Structural safety (path traversal, reserved toolchain filenames) must
  // not depend on the provider's optional validateSource — enforce it here
  // before anything is stored.
  try {
    validateBundle(bundle)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid bundle structure'
    return c.json({ error: message }, 422)
  }
  const adapter = resolveProvider()
  if (adapter.validateSource) {
    const driftErrors = adapter.validateSource(loaded.value, bundle, manifest)
    if (driftErrors.length > 0) {
      return c.json({ error: 'Source drift validation failed', details: driftErrors }, 422)
    }
  }

  try {
    for (const file of bundleCodeFiles(bundle)) {
      await transpileToJS(file.source)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: `Compile error: ${message}` }, 422)
  }

  await db.updateVersion(version.id, { source: JSON.stringify(bundle) })
  return c.json({ ok: true, versionId: version.id, sourceMode: version.sourceMode })
})
