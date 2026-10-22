import { Hono } from 'hono'
import { parseOptionalJson } from '../lib/validation.js'
import { prepareWorkflow, isPrepareError } from '../lib/workflow-prepare.js'
import {
  buildCandidateOverlay,
  checkBodySchema,
  isCandidateRefusal,
  judgedState,
  type JudgedState,
} from '../lib/source-check.js'
import { contentHash } from '@awaitstep/codegen'
import type { AppEnv } from '../types.js'

export const source = new Hono<AppEnv>()

/**
 * Read the deployable source for a version: a freshly generated read-only
 * view of what would deploy. Nothing is persisted — the canvas owns
 * `worker.ts` and `nodes/*`, and the IR is the only source of truth.
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
    entry: prepared.bundle.entry,
    files: prepared.bundle.files.map((f) =>
      projectPaths.has(f.path) ? { ...f, hash: contentHash(f.source) } : f,
    ),
    manifest: prepared.bundle.manifest ?? null,
    // Issues a strict prepare would have refused on. The workspace still
    // opens: the generated code is shown as it is, and these say why it may
    // not be what the user expects.
    diagnostics: prepared.diagnostics,
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
 * A problem with the workflow is an answer, not a malfunction: a cycle, a
 * file that will not parse, a missing secret all return `200 { ok: false }`.
 * Non-200 means the check could not run at all.
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
  // the prepare waiting on this one to issue its own.
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
      checked: prepared.checked ?? [],
      diagnostics: prepared.diagnostics ?? [],
    })
  }

  // Nothing of the source itself: an agent polling this after every write
  // reads a verdict, and `GET /source` is still where the code lives.
  return c.json({
    ok: prepared.diagnostics.length === 0,
    versionId: prepared.versionId,
    checked: prepared.checked,
    diagnostics: prepared.diagnostics,
  })
})
