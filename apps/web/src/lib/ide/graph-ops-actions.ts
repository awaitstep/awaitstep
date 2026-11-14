import { applyGraphOps } from '@awaitstep/codegen'
import { stepSourcePath, type ArtifactIR } from '@awaitstep/ir'
import type { IdeSessionState } from '../../stores/ide-store'
import {
  describeDropped,
  discardableOps,
  opsOf,
  waitingOps,
  withoutOps,
  type DroppedPendingOp,
  type PendingGraphOp,
} from './graph-ops'
import type { LoadedVersion } from './node-source'
import { compareTabId } from './tabs'

interface Notify {
  error(message: string, options?: { description?: string }): void
}

/** The session store, read afresh for each change: a zustand snapshot is stale after any `set`. */
type GetStore = () => IdeSessionState

/**
 * The document the waiting edits replay on: the loaded version, plus the
 * edits a save already wrote while the refetch still shows its base.
 */
export function replayBase(version: LoadedVersion, pending: readonly PendingGraphOp[]): ArtifactIR {
  const posted = pending.filter((entry) => entry.postedOn === version.graphHash)
  return posted.length === 0 ? version.doc : applyGraphOps(version.doc, opsOf(posted)).ir
}

/**
 * Takes what dropped Adds put on screen off it again: the step's file (its
 * tab, Compare tab and unsaved code) and its selection.
 */
export function closeDroppedAdds(getStore: GetStore, dropped: readonly PendingGraphOp[]): void {
  for (const { op } of dropped) {
    if (op.kind !== 'insert') continue
    const path = stepSourcePath(op.node.id)
    getStore().clearDraft(path)
    getStore().closeFiles([path, compareTabId(path)])
    if (getStore().reviewPath === path) getStore().setReviewPath(null)
    if (getStore().selectedNodeId === op.node.id) getStore().selectNode(null)
  }
}

/**
 * Discards one waiting edit, and any later edit that only applied because of
 * it (a step placed after a step being un-added). Returns those later ones,
 * so the caller can say they went too. A discarded removal brings its
 * step's stashed code back; a removal that goes with a discarded Add does
 * not, since its node goes too. An edit in a post in flight is not touched.
 */
export function discardGraphOp(
  getStore: GetStore,
  version: LoadedVersion,
  id: string,
): PendingGraphOp[] {
  const all = getStore().graphOps
  const target = discardableOps(all).find((entry) => entry.id === id)
  if (!target) return []
  const { kept, cascaded } = withoutOps(replayBase(version, all), waitingOps(all), new Set([id]))
  const keptIds = new Set(kept.map((entry) => entry.id))
  getStore().replaceGraphOps(
    all.filter((entry) => entry.postedOn !== undefined || keptIds.has(entry.id)),
  )
  closeDroppedAdds(getStore, [target, ...cascaded])
  if (target.op.kind === 'remove' && target.stashedDraft) {
    const { path, draft } = target.stashedDraft
    const drafts = getStore().drafts
    if (!drafts[path]) getStore().replaceDrafts({ ...drafts, [path]: draft })
  }
  return cascaded
}

/** ⌘Z in the Steps view: the last discardable edit goes. Null when there is none. */
export function discardLastGraphOp(
  getStore: GetStore,
  version: LoadedVersion,
): { discarded: PendingGraphOp; cascaded: PendingGraphOp[] } | null {
  const discardable = discardableOps(getStore().graphOps)
  const last = discardable[discardable.length - 1]
  if (!last) return null
  return { discarded: last, cascaded: discardGraphOp(getStore, version, last.id) }
}

/** Every waiting edit goes (the leave dialog's Discard, another account); nothing is put back. */
export function discardAllGraphOps(getStore: GetStore): void {
  const waiting = waitingOps(getStore().graphOps)
  if (waiting.length === 0) return
  getStore().clearGraphOps()
  closeDroppedAdds(getStore, waiting)
}

/**
 * A new version is loaded: edits a save already wrote are dropped once the
 * refetch shows past their base, and waiting edits that no longer apply to
 * it go, named in the graph-conflict notice when there is one (a refused
 * save), else in a toast. The rest stay pending.
 */
export function pruneGraphOps(getStore: GetStore, version: LoadedVersion, notify: Notify) {
  const all = getStore().graphOps
  if (all.length === 0) return
  const current = all.filter(
    (entry) => entry.postedOn === undefined || entry.postedOn === version.graphHash,
  )
  const waiting = waitingOps(current)
  const { dropped } = applyGraphOps(replayBase(version, current), opsOf(waiting))
  if (dropped.length === 0) {
    if (current.length !== all.length) getStore().replaceGraphOps(current)
    return
  }
  const failed = new Set(dropped.map((d) => waiting[d.index]!.id))
  getStore().replaceGraphOps(current.filter((entry) => !failed.has(entry.id)))
  closeDroppedAdds(
    getStore,
    waiting.filter((entry) => failed.has(entry.id)),
  )
  announceDropped(getStore, describeDropped(waiting, dropped), notify)
}

/** Names edits that no longer apply: in the conflict notice when one is up, else a toast. */
export function announceDropped(
  getStore: GetStore,
  dropped: readonly DroppedPendingOp[],
  notify: Notify,
): void {
  if (dropped.length === 0) return
  const conflict = getStore().graphConflict
  if (conflict) {
    getStore().setGraphConflict({
      ...conflict,
      dropped: [...(conflict.dropped ?? []), ...dropped],
    })
    return
  }
  notify.error(
    dropped.length === 1
      ? 'An unsaved change no longer applies'
      : `${dropped.length} unsaved changes no longer apply`,
    { description: droppedSentence(dropped) },
  )
}

/** "Removed “fetch user”: That node is not in this version any more." — one per edit. */
export function droppedSentence(dropped: readonly DroppedPendingOp[]): string {
  return dropped.map((d) => `${d.label}: ${d.reason}`).join(' ')
}
