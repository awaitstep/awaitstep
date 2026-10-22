import { z } from 'zod'
import {
  MAX_PROJECT_FILES,
  MAX_PROJECT_FILE_BYTES,
  projectFileBytes,
  validateProjectFiles,
} from '@awaitstep/ir'
import type { ProjectFile, ValidationError } from '@awaitstep/ir'
import type { DatabaseAdapter, Workflow, WorkflowVersion } from '@awaitstep/db'
import { type WorkflowPrepareInput } from './workflow-prepare.js'
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
 * The state a check judges: the workflow, plus the files it is judged
 * against. Spelled as the prepare's own inputs, so its field names are what
 * this has to match and a rename cannot leave an overlay that is silently
 * ignored.
 */
export type JudgedState = Pick<WorkflowPrepareInput, 'workflow'> &
  Partial<Pick<WorkflowPrepareInput, 'projectFiles'>>

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
  // A set-level cap — the file count, the total size — can already be
  // exceeded. Being pre-existing excuses a change that leaves it no worse,
  // never one that adds to it: otherwise an over-limit project could be
  // pushed further over, one edit at a time.
  const grew = merged.length > stored.length || setBytes(merged) > setBytes(stored)
  const before = new Map<string, number>()
  for (const problem of validateProjectFiles(stored)) {
    before.set(problem.message, (before.get(problem.message) ?? 0) + 1)
  }
  return validateProjectFiles(merged).filter((problem) => {
    const path = problemPath(problem, merged)
    if (path !== undefined && owned.has(path)) return true
    if (path === undefined && grew) return true
    // Messages, not indices, for everything else: an index shifts when a
    // file is added or removed, while the message names what it is about.
    const seen = before.get(problem.message) ?? 0
    if (seen === 0) return true
    before.set(problem.message, seen - 1)
    return false
  })
}

function setBytes(files: readonly ProjectFile[]): number {
  return files.reduce((sum, file) => sum + projectFileBytes(file.source), 0)
}

/**
 * What the candidates mean for this version, or why they cannot be applied.
 *
 * Candidates overlay the project-file table, and are judged by
 * `validateProjectFiles` (the set-level authority the save path uses) and by
 * the write rules every write path shares — so a check cannot bless what a
 * save would refuse. Against any older version there is nothing to overlay:
 * the table is not read and the snapshot is frozen, so a candidate would be
 * silently ignored. Said plainly instead.
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
