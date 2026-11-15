import { applyGraphOps, type DroppedGraphOp, type GraphOp } from '@awaitstep/codegen'
import { stepSourcePath, type ArtifactIR, type NodeId } from '@awaitstep/ir'
import type { Draft } from './drafts'
import type { LoadedVersion } from './node-source'

/**
 * A graph edit Code holds until Save: the operation replayed on the loaded
 * version, and how the Unsaved changes list words it.
 */
export interface PendingGraphOp {
  /** Stable while it waits: list keys, and which ones a save wrote. */
  id: string
  op: GraphOp
  /** "Added “Fetch user”", worded when it was made, from the names then. */
  label: string
  /**
   * A removed step's unsaved code, taken off the screen with its node (the
   * dialog said it would be lost) and put back if the removal is discarded.
   */
  stashedDraft?: { path: string; draft: Draft }
  /**
   * The base hash of the save that wrote it. It is part of the server's
   * version now and only stays here so the screen keeps showing it while the
   * refetch lags: replayed only on that very base, never counted or listed.
   */
  postedOn?: string
  /**
   * In the version a save is posting right now. It stays listed and on
   * screen, but can't be discarded or un-added until the post settles: the
   * post already carries it.
   */
  saving?: true
}

/** A pending operation that no longer applies, worded for the notice. */
export interface DroppedPendingOp {
  label: string
  reason: string
}

export function opsOf(pending: readonly PendingGraphOp[]): GraphOp[] {
  return pending.map((entry) => entry.op)
}

/** The edits still waiting for a save: the ones listed, counted and discardable. */
export function waitingOps(pending: readonly PendingGraphOp[]): PendingGraphOp[] {
  return pending.filter((entry) => entry.postedOn === undefined)
}

/** The waiting edits that can still be discarded or un-added: not in a post in flight. */
export function discardableOps(pending: readonly PendingGraphOp[]): PendingGraphOp[] {
  return waitingOps(pending).filter((entry) => entry.saving === undefined)
}

/** What replays on `graphHash`: the waiting edits, plus saved ones while the refetch still shows their base. */
export function opsFor(pending: readonly PendingGraphOp[], graphHash: string): PendingGraphOp[] {
  return pending.filter((entry) => entry.postedOn === undefined || entry.postedOn === graphHash)
}

/**
 * The loaded version with the pending operations replayed: the document the
 * Steps list, inspector, map and step files show, and the one a save posts.
 * The base hash stays the loaded one, since that is what the server holds.
 */
export function editedVersion(
  version: LoadedVersion,
  pending: readonly PendingGraphOp[],
): { version: LoadedVersion; dropped: DroppedGraphOp[] } {
  const replayed = opsFor(pending, version.graphHash)
  if (replayed.length === 0) return { version, dropped: [] }
  const { ir, dropped } = applyGraphOps(version.doc, opsOf(replayed))
  return { version: { doc: ir, graphHash: version.graphHash }, dropped }
}

/** The step files of nodes a pending operation adds: new files with nothing saved behind them. */
export function pendingStepPaths(pending: readonly PendingGraphOp[]): string[] {
  return waitingOps(pending).flatMap(({ op }) =>
    op.kind === 'insert' && op.node.type === 'step' ? [stepSourcePath(op.node.id)] : [],
  )
}

/** Nodes a pending operation adds or changes: their Steps rows carry the unsaved dot. */
export function pendingNodeIds(pending: readonly PendingGraphOp[]): Set<NodeId> {
  const ids = new Set<NodeId>()
  const waiting = waitingOps(pending)
  for (const { op } of waiting) {
    if (op.kind === 'insert') ids.add(op.node.id)
    else if (op.kind === 'fields') ids.add(op.nodeId)
  }
  for (const { op } of waiting) if (op.kind === 'remove') ids.delete(op.nodeId)
  return ids
}

/**
 * The waiting operations without `drop`, and any later ones that only
 * applied because of them. `base` is the document they replay on.
 */
export function withoutOps(
  base: ArtifactIR,
  waiting: readonly PendingGraphOp[],
  drop: ReadonlySet<string>,
): { kept: PendingGraphOp[]; cascaded: PendingGraphOp[] } {
  const remaining = waiting.filter((entry) => !drop.has(entry.id))
  const { dropped } = applyGraphOps(base, opsOf(remaining))
  if (dropped.length === 0) return { kept: remaining, cascaded: [] }
  const failed = new Set(dropped.map((d) => d.index))
  return {
    kept: remaining.filter((_, index) => !failed.has(index)),
    cascaded: remaining.filter((_, index) => failed.has(index)),
  }
}

/** The pending operations a replay on `base` reported as dropped, worded for the person. */
export function describeDropped(
  pending: readonly PendingGraphOp[],
  dropped: readonly DroppedGraphOp[],
): DroppedPendingOp[] {
  return dropped.flatMap(({ index, reason }) => {
    const entry = pending[index]
    return entry ? [{ label: entry.label, reason }] : []
  })
}

function quoted(name: string): string {
  return `“${name}”`
}

/**
 * "Added “late”", or with the arm it went into: "Added “late” to onTimeout
 * of “wait”", "Added “notify” after “wait”".
 */
export function insertLabel(
  name: string,
  where?: { container: string; arm: string | null } | null,
): string {
  if (!where) return `Added ${quoted(name)}`
  if (where.arm === 'then') return `Added ${quoted(name)} after ${quoted(where.container)}`
  const arm = where.arm ?? 'a new arm'
  return `Added ${quoted(name)} to ${arm} of ${quoted(where.container)}`
}

export function removeLabel(name: string): string {
  return `Removed ${quoted(name)}`
}

/** "Changed retries on “charge”"; more than two fields are counted. */
export function fieldsLabel(
  name: string,
  edited: Record<string, unknown>,
  base: Record<string, unknown>,
): string {
  const changed = [...new Set([...Object.keys(base), ...Object.keys(edited)])].filter(
    (key) => JSON.stringify(edited[key]) !== JSON.stringify(base[key]),
  )
  const what =
    changed.length === 0
      ? 'settings'
      : changed.length <= 2
        ? changed.join(' and ')
        : `${changed.length} settings`
  return `Changed ${what} on ${quoted(name)}`
}

let counter = 0

/** An id for a pending operation, unique for the page's life. */
export function newPendingOpId(): string {
  counter += 1
  return `op-${counter}`
}
