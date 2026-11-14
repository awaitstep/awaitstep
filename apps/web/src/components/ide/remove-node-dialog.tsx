import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CircleDashed,
  FileX,
  PenLine,
  Repeat2,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import type { NodeReader } from '@awaitstep/codegen'
import { actionToast } from '../../lib/action-toast'
import { removePreview, type RemovePreview } from '../../lib/ide/remove-preview'
import type { RemoveNodeOutcome } from '../../lib/ide/step-remove'
import { useIdeStore } from '../../stores/ide-store'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { useStepSyncOptional } from './step-sync-context'

interface RemoveNodeDialogProps {
  onRemove: (nodeId: string) => Promise<RemoveNodeOutcome>
  busy: boolean
}

/**
 * Asks before Code removes a node, showing what changes in one short row
 * of chips per effect (steps that will error or read another node, emptied
 * arms, names that move, unsaved changes lost); a chip's details show on
 * hover. A node Code can't remove never opens it: `requestNodeRemoval`
 * toasts the reason instead.
 * The row menu, the inspector and the command palette all open it through
 * the session store's dialog slot.
 */
export function RemoveNodeDialog({ onRemove, busy }: RemoveNodeDialogProps) {
  const open = useIdeStore((s) => s.dialog === 'removeNode')
  const nodeId = useIdeStore((s) => (s.dialog === 'removeNode' ? s.dialogTarget : null))
  const drafts = useIdeStore((s) => s.drafts)
  const closeDialog = useIdeStore((s) => s.closeDialog)
  // Outside the workspace's graph (a test of the other dialogs) there is nothing to remove.
  const sync = useStepSyncOptional()
  // What the dialog said when Remove was pressed. The save refetches the graph
  // before it resolves, and the dialog must not flash "not in this version"
  // for the node it is removing.
  const [frozen, setFrozen] = useState<{ nodeId: string; preview: RemovePreview } | null>(null)

  const live = useMemo<RemovePreview>(() => {
    if (nodeId === null || sync === null) return { status: 'missing' }
    const graph = {
      nodes: [...sync.nodes.values()],
      edges: [...sync.edges],
      entryNodeId: sync.entryNodeId ?? '',
    }
    return removePreview(graph, nodeId, drafts)
  }, [nodeId, sync, drafts])
  const preview = frozen !== null && frozen.nodeId === nodeId ? frozen.preview : live

  function handleOpenChange(next: boolean) {
    if (next) return
    closeDialog()
  }

  async function handleConfirm() {
    if (nodeId === null || preview.status !== 'ok') return
    setFrozen({ nodeId, preview })
    const outcome = await onRemove(nodeId)
    // Nothing was removed: the node is still there, and opening Remove on it
    // again must show the graph as it is then, not this attempt's preview.
    if (outcome.status !== 'removed') setFrozen(null)
    if (outcome.status === 'refused' || outcome.status === 'failed') {
      // The save's reason (a validation refusal, say) goes in a toast, as a
      // canvas save's does; the dialog has nothing left to ask.
      const title = `Couldn’t remove ${preview.name}`
      actionToast.error(
        title,
        outcome.reason === title ? undefined : { description: outcome.reason },
      )
    }
    // A graph conflict's workspace notice says why. Close only this dialog:
    // it may have been dismissed, and another opened, meanwhile.
    const { dialog, dialogTarget } = useIdeStore.getState()
    if (dialog === 'removeNode' && dialogTarget === nodeId) closeDialog()
  }

  const name = preview.status === 'missing' ? 'node' : preview.name

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={`Remove ${name}?`}
      description={<RemoveDescription preview={preview} />}
      icon={Trash2}
      confirmLabel="Remove"
      loading={busy || preview.status !== 'ok'}
      onConfirm={handleConfirm}
    />
  )
}

function RemoveDescription({ preview }: { preview: RemovePreview }) {
  if (preview.status === 'missing') return <span>This node is not in this version any more.</span>
  if (preview.status === 'blocked') return <span>{preview.reason}</span>
  const { readers, rebound, emptiedArms, renamed, draftPath } = preview
  return (
    <span className="flex flex-col gap-3">
      <span>The steps around it are joined.</span>
      {readers.length > 0 && (
        <Impact icon={AlertTriangle} tone="text-status-warning" label="Will error">
          {readerChips(readers)}
        </Impact>
      )}
      {rebound !== null && (
        <Impact icon={Repeat2} tone="text-status-info" label={`Will read ${rebound.toName}`}>
          {readerChips(rebound.readers)}
        </Impact>
      )}
      {emptiedArms.length > 0 && (
        <Impact icon={CircleDashed} tone="text-muted-foreground" label="Empty arm">
          {emptiedArms.map((arm) => (
            <Chip key={`${arm.containerId}:${arm.label}`}>
              {arm.containerName} · {arm.label}
            </Chip>
          ))}
        </Impact>
      )}
      {renamed.length > 0 && (
        <Impact icon={PenLine} tone="text-muted-foreground" label="Renamed">
          {renamed.map((entry) => (
            <Chip
              key={entry.nodeId}
              mono
              title={
                entry.draftPath === null
                  ? `${entry.name}: references to ${entry.from} break`
                  : `${entry.name}: unsaved changes in ${entry.draftPath} will show a conflict`
              }
            >
              {entry.from} → {entry.to}
              {entry.draftPath !== null && <span className="text-status-warning"> •</span>}
            </Chip>
          ))}
        </Impact>
      )}
      {draftPath !== null && (
        <Impact icon={FileX} tone="text-status-error" label="Unsaved changes lost">
          <Chip mono>{draftPath}</Chip>
        </Impact>
      )}
    </span>
  )
}

/** One effect of the removal: an icon, a short label, and the nodes it touches. */
function Impact({
  icon: Icon,
  tone,
  label,
  children,
}: {
  icon: LucideIcon
  tone: string
  label: string
  children: React.ReactNode
}) {
  return (
    <span className="flex items-start gap-2">
      <Icon className={`mt-0.5 size-3.5 shrink-0 ${tone}`} aria-hidden="true" />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span role="list" aria-label={label} className="flex flex-wrap gap-1">
          {children}
        </span>
      </span>
    </span>
  )
}

/** A reader's node, once per node; what it reads shows on hover. */
function readerChips(readers: readonly NodeReader[]): React.ReactNode {
  const byNode = new Map<string, { name: string; reads: string[] }>()
  for (const reader of readers) {
    const entry = byNode.get(reader.nodeId) ?? { name: reader.nodeName, reads: [] }
    entry.reads.push(`${reader.field}: ${reader.text}`)
    byNode.set(reader.nodeId, entry)
  }
  return capped(
    [...byNode].map(([nodeId, entry]) => (
      <Chip key={nodeId} title={entry.reads.join('\n')}>
        {entry.name}
      </Chip>
    )),
  )
}

/** Chips listed by name; a node read from thousands of places would otherwise list thousands. */
const SHOWN_CHIPS = 20

function capped(chips: React.ReactNode[]): React.ReactNode {
  if (chips.length <= SHOWN_CHIPS) return chips
  return (
    <>
      {chips.slice(0, SHOWN_CHIPS)}
      <Chip>+{chips.length - SHOWN_CHIPS}</Chip>
    </>
  )
}

function Chip({
  children,
  title,
  mono = false,
}: {
  children: React.ReactNode
  title?: string
  mono?: boolean
}) {
  return (
    <span
      role="listitem"
      title={title}
      className={`max-w-full truncate rounded bg-muted px-1.5 py-0.5 text-2xs text-foreground ${mono ? 'font-mono' : ''}`}
    >
      {children}
    </span>
  )
}
