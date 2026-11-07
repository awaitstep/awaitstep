import { nanoid } from 'nanoid'
import {
  PROJECT_HANDLERS_PATH,
  hasHandlerModules,
  migrateArtifact,
  projectHandlerModules,
  type ArtifactIR,
} from '@awaitstep/ir'
import {
  isUniqueViolation,
  type DatabaseAdapter,
  type UpsertWorkflowFileData,
  type WorkflowFile,
  type WorkflowVersion,
} from '@awaitstep/db'
import { foldProjectFiles, stripProjectOwnedRuntime } from './runtime-fold.js'
import { normalizeStepModules } from '@awaitstep/codegen'
import { canonicalJson, graphHash } from './graph-hash.js'

/** The 409 a save answers when the graph moved since the caller loaded it. */
export const VERSION_CHANGED = 'This workflow changed since it was loaded'

export type VersionSaveResult =
  /** 200: saved over the current version, or nothing to save; 201: a new version. */
  | { status: 200 | 201; version: WorkflowVersion; graphHash: string }
  /** Nothing written: the caller's base is not the latest graph, or the write lost twice. */
  | { status: 409; currentVersionId: string | null; currentGraphHash: string | null }

export type CommitResult = VersionSaveResult | { status: 404 | 422; error: string }

export interface PersistVersionInput {
  workflowId: string
  /** The validated document to store, before the project files are folded in. */
  ir: ArtifactIR
  userId: string
  /** The `graphHash` the caller loaded. The save is refused when the latest version's differs. */
  baseGraphHash?: string
  /**
   * Project files this save adds to the table — an import's files, the
   * handlers.ts / package.json a legacy runtime block implies. Written only
   * after the version is, and never over a path stored meanwhile, so a
   * refused save leaves the table as it was and a writer who got to a path
   * first keeps it.
   */
  seeds?: UpsertWorkflowFileData[]
  /**
   * The HTTP entry seeded for a document with no project of its own. Kept
   * only while that is still so when the write happens: a save that lost
   * its race to another first save, or to a legacy handlers.ts, writes none.
   */
  freshSeeds?: UpsertWorkflowFileData[]
}

/** What a save is judged against, read together so no write can slip between them. */
export interface SaveReads {
  latest: WorkflowVersion | null
  /**
   * The latest version has gone out on some account — live there now or since
   * taken down — so it is kept and a save starts the next version. A version
   * that never went out is saved over in place.
   */
  everDeployed: boolean
  files: WorkflowFile[]
}

export function readForSave(db: DatabaseAdapter, workflowId: string): Promise<SaveReads> {
  return Promise.all([
    db.getLatestVersionForSave(workflowId),
    db.listWorkflowFiles(workflowId),
  ]).then(([latest, files]) => ({
    latest: latest?.version ?? null,
    everDeployed: latest?.everDeployed ?? false,
    files,
  }))
}

/**
 * Unchanged-IR check for save dedup. Fast path is string equality; the
 * canonical comparison migrates the stored document first so the lazy
 * irVersion stamp (and key-order differences) never register as a change —
 * without it, every legacy workflow's first no-op save would spawn a
 * content-identical version row and a false "undeployed changes" state.
 */
export function irUnchanged(storedIr: string, newIr: string): boolean {
  if (storedIr === newIr) return true
  try {
    // A version saved before steps were modules holds bodies; the posted
    // document arrives normalised. Compared in one shape, so re-posting the
    // same old document is the no-op it always was.
    return (
      canonicalJson(inModuleForm(migrateArtifact(JSON.parse(storedIr)))) ===
      canonicalJson(inModuleForm(JSON.parse(newIr)))
    )
  } catch {
    return false
  }
}

/** A document with its step code in module form; anything that is not a document is left as it is. */
function inModuleForm(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !Array.isArray((value as ArtifactIR).nodes)) {
    return value
  }
  return normalizeStepModules(value as ArtifactIR)
}

/**
 * The text a version stores: the document with the live project files
 * snapshotted in and the settings those files own removed, so it is
 * self-contained and never carries a stale duplicate of handlers.ts or
 * package.json.
 */
function storedIrText(ir: ArtifactIR, files: readonly UpsertWorkflowFileData[]): string {
  return JSON.stringify(
    stripProjectOwnedRuntime(foldProjectFiles(ir, files, { useSnapshot: false }), files),
  )
}

function conflictWith(latest: WorkflowVersion | null): VersionSaveResult {
  return {
    status: 409,
    currentVersionId: latest?.id ?? null,
    currentGraphHash: latest ? graphHash(latest.ir) : null,
  }
}

/**
 * One attempt at the save, against what was just read. Null means the write
 * lost a race — another save landed on the row, or a newer version appeared
 * between the read and the write — and the caller reads again.
 *
 * Order: fold → unchanged → precondition → write → seeds. Unchanged comes
 * before the precondition so a save retried after a lost response, carrying
 * the base it had, answers 200 with its own result instead of a 409; the
 * seeds come last so a refused or lost write leaves the file table as it
 * was.
 */
async function trySave(
  db: DatabaseAdapter,
  reads: SaveReads,
  input: Omit<PersistVersionInput, 'files'>,
): Promise<VersionSaveResult | null> {
  const { latest, everDeployed } = reads
  const storedPaths = new Set(reads.files.map((file) => file.path))
  // The seeds were decided against the caller's read; this attempt's rows
  // may be newer (a lost race re-reads). A path stored meanwhile keeps its
  // content, and a handlers.ts seed is dropped once handler modules exist —
  // the two models never coexist, and a conversion may have landed between.
  const modular = hasHandlerModules(projectHandlerModules(reads.files))
  const stillFresh = latest === null && reads.files.length === 0
  const seeds = [...(input.seeds ?? []), ...(stillFresh ? (input.freshSeeds ?? []) : [])].filter(
    (seed) => !storedPaths.has(seed.path) && !(modular && seed.path === PROJECT_HANDLERS_PATH),
  )
  const files = [...reads.files, ...seeds]
  const irString = storedIrText(input.ir, files)

  const baseMatches =
    input.baseGraphHash === undefined ||
    (latest ? graphHash(latest.ir) : null) === input.baseGraphHash

  // The version holds the seeds' content from here on; the table follows
  // once the write is in, and a path stored meanwhile is left as it is.
  const seeded = async <T>(result: T): Promise<T> => {
    if (seeds.length > 0) await db.createWorkflowFilesIfAbsent(seeds)
    return result
  }

  if (latest && irUnchanged(latest.ir, irString)) {
    // The version already holds these files; the table only catches up.
    const unchanged = { status: 200 as const, version: latest, graphHash: graphHash(latest.ir) }
    return baseMatches ? seeded(unchanged) : unchanged
  }
  if (!baseMatches) return conflictWith(latest)

  // A latest version that never went out on any account is saved over in
  // place: it reads as saved by this person, now. The row's text and "still
  // newest" ride in the UPDATE.
  if (latest && !everDeployed) {
    const saved = await db.updateLatestVersionIfIrMatches(latest, latest.ir, {
      ir: irString,
      createdBy: input.userId,
      createdAt: new Date().toISOString(),
    })
    if (!saved) return null
    return seeded({ status: 200, version: saved, graphHash: graphHash(saved.ir) })
  }

  // First version, or the latest went out on some account: a new row at the next number.
  // The explicit number makes a concurrent creator the unique index's loser.
  let version: WorkflowVersion
  try {
    version = await db.createVersion({
      id: nanoid(),
      workflowId: input.workflowId,
      ir: irString,
      createdBy: input.userId,
      version: (latest?.version ?? 0) + 1,
    })
  } catch (err) {
    if (isUniqueViolation(err)) return null
    throw err
  }
  await db.advanceCurrentVersion(input.workflowId, version)
  return seeded({ status: 201, version, graphHash: graphHash(version.ir) })
}

/** One re-read after a lost race: a files-only commit may have landed, which does not move the graph. */
const ATTEMPTS = 2

/**
 * Stores `ir` as the workflow's current version: over the latest in place
 * while it never went out on any account, else as the next version. With `baseGraphHash`
 * the write only goes through while the latest version's graph is the one
 * the caller loaded — so Code and the canvas, each saving its own view of
 * the same document, cannot silently overwrite each other. A lost race
 * re-reads once; nothing is ever written on a 409.
 *
 * `reads` is what the caller already read for this save (`readForSave`),
 * so the route's own reads and the save's are one round of statements.
 */
export async function persistVersion(
  db: DatabaseAdapter,
  input: PersistVersionInput,
  reads?: SaveReads,
): Promise<VersionSaveResult> {
  let current = reads
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const result = await trySave(db, current ?? (await readForSave(db, input.workflowId)), input)
    if (result) return result
    current = undefined
  }
  return conflictWith(await db.getLatestVersion(input.workflowId))
}

/** The stored document, migrated, as the folds read it; null for a row that is not a JSON object. */
export function storedDocument(irText: string): ArtifactIR | null {
  try {
    const doc = migrateArtifact(JSON.parse(irText))
    if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return null
    return doc as ArtifactIR
  } catch {
    return null
  }
}

/**
 * Snapshots the live project files into the current version, under the same
 * overwrite-or-create rule as a save and with the same no-op when nothing
 * changed. No client precondition: the graph is whatever the latest version
 * holds. Code calls this once per batch of file writes so a files-only edit
 * is versioned too.
 */
export async function commitProjectFiles(
  db: DatabaseAdapter,
  input: { workflowId: string; userId: string },
): Promise<CommitResult> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const reads = await readForSave(db, input.workflowId)
    if (!reads.latest) return { status: 404, error: 'No version to commit into' }
    const ir = storedDocument(reads.latest.ir)
    if (!ir) {
      return {
        status: 422,
        error: 'The current version is not a document files can be committed into',
      }
    }
    const result = await trySave(db, reads, { ...input, ir })
    if (result) return result
  }
  return conflictWith(await db.getLatestVersion(input.workflowId))
}
