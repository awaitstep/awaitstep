import { z } from 'zod'
import {
  MAX_PROJECT_FILES,
  MAX_PROJECT_FILE_BYTES,
  projectFileBytes,
  validateProjectFiles,
} from '@awaitstep/ir'
import type { ProjectFile, ValidationError } from '@awaitstep/ir'
import { projectBundleFiles, storedBundleErrors } from '@awaitstep/codegen'
import type { GeneratedBundle, GeneratedFile } from '@awaitstep/codegen'
import type { DatabaseAdapter, Workflow, WorkflowVersion } from '@awaitstep/db'
import { MAX_REQUEST_BYTES } from '../app.js'
import { loadStoredSource, type WorkflowPrepareInput } from './workflow-prepare.js'
import { projectWriteRuleErrors } from './project-write-rules.js'
import { workflowAfterDeletes } from './project-files.js'

/**
 * A file as a check request describes it: `source: null` asks "what if this
 * were deleted?", which is the edit most likely to orphan an import and the
 * one worth asking about before it happens.
 *
 * The character caps only bound the request — the byte caps that storage
 * actually enforces are applied to the merged set, by the same validator
 * the save path uses.
 */
const candidateSchema = z.object({
  path: z.string().min(1).max(300),
  source: z.string().max(MAX_PROJECT_FILE_BYTES).nullable(),
})

export const checkBodySchema = z.object({
  files: z.array(candidateSchema).max(MAX_PROJECT_FILES).optional(),
})

export type CandidateFile = z.infer<typeof candidateSchema>

/**
 * The state a check judges: the workflow, plus whichever store the files
 * live in for this version. Spelled as the prepare's own inputs, so its
 * field names are what this has to match and a rename cannot leave an
 * overlay that is silently ignored.
 */
export type JudgedState = Pick<WorkflowPrepareInput, 'workflow'> &
  Partial<Pick<WorkflowPrepareInput, 'projectFiles' | 'storedSource'>>

export interface CandidateRefusal {
  error: string
  status: 400 | 422
  details?: unknown
}

/** What to judge when there are no candidates: exactly what is stored. */
export function judgedState(
  workflow: Workflow,
  stored: readonly ProjectFile[] | undefined,
): JudgedState {
  return { workflow, ...(stored && { projectFiles: stored }) }
}

/** The stored files with the candidates applied: added, replaced, removed. */
export function overlayProjectFiles(
  stored: readonly ProjectFile[],
  candidates: readonly CandidateFile[],
): ProjectFile[] {
  const merged = new Map(
    stored.map((file) => [file.path, { path: file.path, source: file.source }]),
  )
  for (const candidate of candidates) {
    if (candidate.source === null) merged.delete(candidate.path)
    else merged.set(candidate.path, { path: candidate.path, source: candidate.source })
  }
  return [...merged.values()]
}

/**
 * The same overlay for an ejected/sdk version, whose project files live
 * inside the stored bundle rather than in the table. A replaced file keeps
 * the role it was stored with; a new one is classified exactly as a project
 * file entering a bundle is, so a candidate cannot smuggle in a role it
 * would never have been given — and `storedBundleErrors` then refuses any
 * role a stored bundle cannot hold, as a write would.
 */
export function overlayBundleFiles(
  bundle: GeneratedBundle,
  candidates: readonly CandidateFile[],
): GeneratedBundle {
  const merged = new Map(bundle.files.map((file) => [file.path, file]))
  for (const candidate of candidates) {
    if (candidate.source === null) {
      merged.delete(candidate.path)
      continue
    }
    const current = merged.get(candidate.path)
    const next: GeneratedFile = current
      ? { ...current, source: candidate.source }
      : projectBundleFiles([{ path: candidate.path, source: candidate.source }])[0]!
    // A stored `compiled` is the old text's output; keeping it would hand a
    // consumer code the candidate never contained.
    delete next.compiled
    merged.set(candidate.path, next)
  }
  return { entry: bundle.entry, files: [...merged.values()] }
}

/** A bundle's source as bytes, the unit the request limit is expressed in. */
function bundleBytes(bundle: GeneratedBundle): number {
  return bundle.files.reduce((sum, file) => sum + projectFileBytes(file.source), 0)
}

/** The file a `runtime.files[<i>].…` validation path points at, if any. */
function problemPath(problem: ValidationError, files: readonly ProjectFile[]): string | undefined {
  const index = /^runtime\.files\[(\d+)\]/.exec(problem.path)?.[1]
  return index === undefined ? undefined : files[Number(index)]?.path
}

/**
 * The project-rule problems the candidates are responsible for.
 *
 * A project can already hold a file that breaks a current rule — imported
 * before the rule existed, or seeded by an older client. Refusing every
 * check because of one would make the endpoint useless exactly when it is
 * needed most, and the problem is reported anyway: IR validation runs the
 * same validator, so it arrives as an `ir` diagnostic in a 200.
 *
 * A problem about a file the request *writes* is always the request's own,
 * even when the stored copy has the same flaw — the write path validates
 * that file's content unconditionally, so anything else would let a check
 * bless a save that is refused. Only problems about untouched files, and
 * set-level problems that were already true, are passed over.
 */
export function newProjectFileProblems(
  stored: readonly ProjectFile[],
  merged: readonly ProjectFile[],
  written: Iterable<string>,
): ValidationError[] {
  const owned = new Set(written)
  const before = new Map<string, number>()
  for (const problem of validateProjectFiles(stored)) {
    before.set(problem.message, (before.get(problem.message) ?? 0) + 1)
  }
  return validateProjectFiles(merged).filter((problem) => {
    const path = problemPath(problem, merged)
    if (path !== undefined && owned.has(path)) return true
    // Messages, not indices, for everything else: an index shifts when a
    // file is added or removed, while the message names what it is about.
    const seen = before.get(problem.message) ?? 0
    if (seen === 0) return true
    before.set(problem.message, seen - 1)
    return false
  })
}

/**
 * What the candidates mean for this version, or why they cannot be applied.
 *
 * Each source mode keeps its own rules, because the files live somewhere
 * different in each:
 * - **generated, current** — the project-file table. Judged by
 *   `validateProjectFiles` (the set-level authority the save path uses) and
 *   by the write rules every write path shares.
 * - **ejected/sdk** — inside the stored bundle. Judged by
 *   `storedBundleErrors`, the same authority `PUT /source` applies.
 * - **any older version** — nothing to overlay: the table is not read and
 *   the snapshot is frozen, so a candidate would be silently ignored. Said
 *   plainly instead.
 */
export async function buildCandidateOverlay(input: {
  db: DatabaseAdapter
  workflow: Workflow
  version: WorkflowVersion
  /** The project's stored files, already read by the caller. */
  stored: readonly ProjectFile[]
  candidates: readonly CandidateFile[]
}): Promise<JudgedState | CandidateRefusal> {
  const { db, workflow, version, stored, candidates } = input
  if (version.id !== workflow.currentVersionId) {
    return {
      error:
        'Candidate files can only be checked against the current version — an older version deploys the snapshot it was saved with',
      status: 400,
    }
  }
  if ((version.sourceMode ?? 'generated') !== 'generated') {
    // Only the stored-source path has a lock to respect: `PUT /source`
    // refuses a locked version, while `PUT`/`DELETE /files` never consult
    // it — project files belong to the workflow, not to a version.
    if (version.locked === 1) {
      return { error: 'Version is locked', status: 400 }
    }
    const parsed = loadStoredSource(version)
    if ('error' in parsed) return { error: parsed.error, status: 422 }
    const bundle = overlayBundleFiles(parsed.bundle, candidates)
    const problems = storedBundleErrors(bundle)
    if (problems.length > 0) {
      return {
        error: problems[0]!,
        status: 422,
        ...(problems.length > 1 && { details: problems }),
      }
    }
    // A bundle no write could carry must not come back as healthy: the
    // storage caps allow more than a single request may contain, so
    // `PUT /source` would be refused by the body-size limit long before
    // these rules ran. Said here rather than left for the caller to
    // discover as a 413 — including when the stored bundle is already that
    // large, which is the case eject can produce and no candidate can fix.
    if (bundleBytes(bundle) > MAX_REQUEST_BYTES) {
      return {
        error: `Source is ${bundleBytes(bundle)} bytes; no request may exceed ${MAX_REQUEST_BYTES}, so this cannot be pushed through PUT /source`,
        status: 422,
      }
    }
    // The legacy settings are a project-file concern; nothing writes them
    // on an ejected version, so there is nothing to model here.
    return { workflow, storedSource: { bundle, manifest: parsed.manifest } }
  }

  // Deleting a file that stands in for a legacy setting retires the setting
  // too, so the state being judged is the workflow a real delete would
  // leave — otherwise the check answers for trigger code that would no
  // longer exist. Only a file that is actually there can be deleted: a
  // `DELETE` of a path with no row is a 404 and changes no setting.
  const storedPaths = new Set(stored.map((file) => file.path))
  const judged = workflowAfterDeletes(
    workflow,
    candidates.filter((c) => c.source === null && storedPaths.has(c.path)).map((c) => c.path),
  )

  const projectFiles = overlayProjectFiles(stored, candidates)
  const problems = newProjectFileProblems(
    stored,
    projectFiles,
    candidates.filter((c) => c.source !== null).map((c) => c.path),
  )
  if (problems.length > 0) {
    return { error: 'Candidate files break a project rule', status: 422, details: problems }
  }
  const writeErrors = await projectWriteRuleErrors({
    db,
    workflow: judged,
    version,
    existing: stored,
    changes: candidates,
  })
  if (writeErrors[0]) return { error: writeErrors[0].message, status: 422 }
  return { workflow: judged, projectFiles }
}

export function isCandidateRefusal(
  result: JudgedState | CandidateRefusal,
): result is CandidateRefusal {
  return 'error' in result
}
