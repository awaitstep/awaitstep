import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { parseOptionalJson, zValidator } from '../lib/validation.js'
import { prepareWorkflow, isPrepareError, loadStoredSource } from '../lib/workflow-prepare.js'
import {
  buildCandidateOverlay,
  checkBodySchema,
  isCandidateRefusal,
  judgedState,
  type JudgedState,
} from '../lib/source-check.js'
import { resolveProvider } from '../lib/provider-resolver.js'
import {
  STORED_BUNDLE_ROLES,
  bundleHash,
  bundleCodeFiles,
  bundleEjectFiles,
  contentHash,
  storedBundleErrors,
} from '@awaitstep/codegen'
import type { GeneratedBundle, StepManifest } from '@awaitstep/codegen'
import { collectCompileErrors } from '@awaitstep/codegen/transpile'
import { MAX_PROJECT_FILES, MAX_PROJECT_FILE_BYTES, loadArtifact } from '@awaitstep/ir'
import type { WorkflowSourceMode } from '@awaitstep/db'
import type { AppEnv } from '../types.js'

// The schema bounds the parse; `storedBundleErrors` is the authority on what
// may actually be stored, and the candidate checker calls the same function.
const sourceFileSchema = z.object({
  path: z.string().min(1).max(300),
  source: z.string().max(MAX_PROJECT_FILE_BYTES),
  role: z.enum(STORED_BUNDLE_ROLES),
})

const putSourceSchema = z.object({
  entry: z.string().min(1).max(300),
  files: z.array(sourceFileSchema).min(1).max(MAX_PROJECT_FILES),
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
    // Eject stores the bundle as a version's source: it must compile and the
    // IR must validate, but env *values* are not part of what gets stored.
    mode: 'build',
    eject: true,
  })
  if (isPrepareError(prepared)) {
    // Whatever was found before the failure travels with it — a bundle that
    // would not generate is usually unbuildable *because* of something
    // already collected, and dropping that leaves only the symptom.
    return c.json(
      {
        error: prepared.error,
        details: prepared.details,
        ...(prepared.diagnostics?.length && { diagnostics: prepared.diagnostics }),
      },
      prepared.status as 400,
    )
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
    const stored = loadStoredSource(version)
    if ('error' in stored) {
      return c.json({ error: stored.error }, stored.status as 422)
    }
    return c.json({
      versionId: version.id,
      sourceMode: version.sourceMode,
      entry: stored.bundle.entry,
      files: stored.bundle.files,
      manifest: stored.manifest,
      // The stored bundle is returned as it is. A read of an ejected
      // version does not analyse it — `prepareWorkflow` in read mode now
      // reports drift, but this path never reaches it, so Code mode shows
      // no problems on a version `POST /source/check` would call drifted.
      // Deliberate for now; I6 is what wires drift into the editor.
      diagnostics: [],
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
    mode: 'read',
  })
  if (isPrepareError(prepared)) {
    // Whatever was found before the failure travels with it — a bundle that
    // would not generate is usually unbuildable *because* of something
    // already collected, and dropping that leaves only the symptom.
    return c.json(
      {
        error: prepared.error,
        details: prepared.details,
        ...(prepared.diagnostics?.length && { diagnostics: prepared.diagnostics }),
      },
      prepared.status as 400,
    )
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
    // Issues a strict prepare would have refused on. The workspace still
    // opens: the generated code is shown as it is, and these say why it may
    // not be what the user expects.
    diagnostics: prepared.diagnostics,
    baseGeneratedHash: null,
  })
})

/**
 * Answer one question as cheaply as it can be answered: **would this work?**
 *
 * Everything `GET /source` finds, without the bundle — an agent checking
 * after each write should not pay for the whole workspace to read a verdict.
 * Optional candidate files are overlaid in memory and discarded, so the
 * question can be asked *before* a broken intermediate state is visible to
 * the dev, to a deploy, or to the reaper.
 *
 * A problem with the workflow is an answer, not a malfunction: a cycle,
 * drift, a file that will not parse all return `200 { ok: false }`. Non-200
 * means the check could not run at all.
 */
source.post('/:workflowId/source/check', async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const body = await parseOptionalJson(c, checkBodySchema)
  if ('errors' in body) return c.json({ error: 'Validation failed', details: body.errors }, 422)
  const candidates = body.data.files ?? []

  const versionId = c.req.query('versionId') ?? workflow.currentVersionId
  if (!versionId) return c.json({ error: 'No version to check' }, 400)
  // Nothing about the file rows depends on the version row, and only the
  // current version reads them at all — so both go out at once rather than
  // the prepare waiting on this one to issue its own. The rows go unused on
  // an ejected version, whose files live in its bundle; that is one indexed
  // query against a serialized round trip on every check of a generated
  // workflow, which is the case agents are in.
  const isCurrentVersion = versionId === workflow.currentVersionId
  const [version, stored] = await Promise.all([
    db.getWorkflowVersionById(versionId),
    isCurrentVersion ? db.listWorkflowFiles(workflow.id) : [],
  ])
  if (!version || version.workflowId !== workflow.id) {
    return c.json({ error: 'Version not found' }, 404)
  }

  // The overlay is also where the candidates are judged — by the same rules
  // the matching write path applies, so a check cannot bless what a save
  // would refuse.
  let judged: JudgedState = judgedState(workflow, isCurrentVersion ? stored : undefined)
  if (candidates.length > 0) {
    const built = await buildCandidateOverlay({ db, workflow, version, stored, candidates })
    if (isCandidateRefusal(built)) {
      return c.json(
        { error: built.error, ...(built.details !== undefined && { details: built.details }) },
        built.status,
      )
    }
    judged = built
  }

  const prepared = await prepareWorkflow({
    db,
    organizationId: c.get('organizationId'),
    projectId: c.get('projectId'),
    nodeRegistry: c.get('nodeRegistry'),
    version,
    mode: 'read',
    ...judged,
  })
  if (isPrepareError(prepared)) {
    if (!prepared.finding) {
      return c.json({ error: prepared.error, details: prepared.details }, prepared.status as 400)
    }
    // A fact about the workflow. The caller asked what is wrong with it;
    // this is the answer, so it arrives the same way every other answer does.
    return c.json({
      ok: false,
      versionId,
      sourceMode: (version.sourceMode ?? 'generated') as WorkflowSourceMode,
      checked: prepared.checked ?? [],
      diagnostics: prepared.diagnostics ?? [],
    })
  }

  // Nothing of the source itself: an agent polling this after every write
  // reads a verdict, and `GET /source` is still where the code lives.
  return c.json({
    ok: prepared.diagnostics.length === 0,
    versionId: prepared.versionId,
    sourceMode: prepared.sourceMode,
    checked: prepared.checked,
    diagnostics: prepared.diagnostics,
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

  const loaded = loadArtifact(version.ir)
  if (!loaded.ok) {
    return c.json({ error: 'Stored IR is invalid', details: loaded.errors }, 400)
  }
  const stored = loadStoredSource(version)
  if ('error' in stored) {
    return c.json({ error: stored.error }, stored.status as 422)
  }
  const manifest: StepManifest = stored.manifest

  const bundle: GeneratedBundle = { entry: body.entry, files: body.files }
  // What may be stored — structural safety, the caps, the editable roles —
  // must not depend on the provider's optional validateSource, and must be
  // the same answer `POST /source/check` gives for the same bundle.
  const storeErrors = storedBundleErrors(bundle)
  if (storeErrors.length > 0) {
    return c.json(
      { error: storeErrors[0]!, ...(storeErrors.length > 1 && { details: storeErrors }) },
      422,
    )
  }
  const adapter = resolveProvider()
  if (adapter.validateSource) {
    const driftErrors = adapter.validateSource(loaded.value, bundle, manifest)
    if (driftErrors.length > 0) {
      return c.json({ error: 'Source drift validation failed', details: driftErrors }, 422)
    }
  }

  const compileErrors = await collectCompileErrors(bundleCodeFiles(bundle))
  if (compileErrors.length > 0) {
    const first = compileErrors[0]!
    return c.json(
      { error: `Compile error in ${first.path}: ${first.message}`, details: compileErrors },
      422,
    )
  }

  await db.updateVersion(version.id, { source: JSON.stringify(bundle) })
  return c.json({ ok: true, versionId: version.id, sourceMode: version.sourceMode })
})
