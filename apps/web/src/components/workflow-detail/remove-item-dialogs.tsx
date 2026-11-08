import { useState } from 'react'
import { EyeOff, Trash2 } from 'lucide-react'
import type { LiveDeployment } from '@awaitstep/ir'
import type { WorkflowSummary } from '../../lib/api-client'
import { plural } from '../../lib/plural'
import { timeAgo } from '../../lib/time'
import type { useWorkflowActions } from '../dashboard/use-workflow-actions'
import { Button } from '../ui/button'
import { RadioCardGroup } from '../ui/choice-card'
import { ModalDialog } from '../ui/modal-dialog'
import { Tile } from '../ui/tile'
import { FailureLine } from './failure-line'
import type { WorkflowOverview } from './use-workflow-overview'

type Actions = ReturnType<typeof useWorkflowActions>

interface TakeDownDialogProps {
  workflow: WorkflowSummary
  /** What is live on each account, newest first. */
  live: LiveDeployment[]
  takedown: Actions['takedown']
  onClose: () => void
}

/**
 * Take down (board `WorkflowActions`): the worker stops on one account; the
 * item stays. Live on more than one, it asks which.
 */
export function TakeDownDialog({ workflow, live, takedown, onClose }: TakeDownDialogProps) {
  const [picked, setPicked] = useState(live[0]?.id ?? '')
  const target = live.find((l) => l.id === picked)
  const choosing = live.length > 1
  const options = live.map((l) => ({
    value: l.id,
    title: l.name,
    description:
      l.version !== null ? `v${l.version} · ${timeAgo(l.deployedAt)}` : timeAgo(l.deployedAt),
  }))

  function handleConfirm() {
    if (target) takedown.mutate(target.id, { onSuccess: onClose })
  }

  function handleOpenChange(open: boolean) {
    if (!open && !takedown.isPending) onClose()
  }

  let title = `Take down ${workflow.name}?`
  if (!choosing && target?.version != null) title = `Take down v${target.version}?`

  return (
    <ModalDialog
      open
      onOpenChange={handleOpenChange}
      size="sm"
      leading={
        <Tile tone="warn" size="lg">
          <EyeOff />
        </Tile>
      }
      title={title}
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={takedown.isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-status-warning text-background hover:bg-status-warning/90"
            onClick={handleConfirm}
            loading={takedown.isPending}
            disabled={!target}
          >
            Take down
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {choosing && (
          <RadioCardGroup
            legend="Take it down from"
            value={picked}
            onChange={setPicked}
            options={options}
          />
        )}
        <p className="text-sm text-muted-foreground">
          The worker stops answering{target ? ` on ${target.name}` : ''}. Runs already going finish.
          You can deploy it again any time.
        </p>
        <FailureLine error={takedown.error} general="Couldn’t take it down" />
      </div>
    </ModalDialog>
  )
}

interface DeleteItemDialogProps {
  workflow: WorkflowSummary
  overview: WorkflowOverview
  /** All its runs, when known. */
  runCount?: number
  remove: Actions['remove']
  onClose: () => void
}

/** "Its 12 versions and 128 runs go with it", from what is loaded; vaguer while it isn't. */
export function deleteLine(
  kind: WorkflowSummary['kind'],
  versions: { count: number; more: boolean },
  runCount: number | undefined,
): string {
  const versionPart =
    versions.more || versions.count === 0
      ? 'Its versions'
      : `Its ${plural(versions.count, 'version')}`
  let goes: string
  if (kind === 'script') {
    const one = !versions.more && versions.count === 1
    goes = `${versionPart} ${one ? 'goes' : 'go'} with it.`
  } else if (runCount === undefined) goes = `${versionPart} and runs go with it.`
  else goes = `${versionPart} and ${plural(runCount, 'run')} go with it.`
  return `${goes} Take it down first if you want the worker gone from Cloudflare.`
}

/** Delete (board `WorkflowActions`): what goes with it, and that the worker stays. */
export function DeleteItemDialog({
  workflow,
  overview,
  runCount,
  remove,
  onClose,
}: DeleteItemDialogProps) {
  const word = workflow.kind === 'script' ? 'function' : 'workflow'

  function handleConfirm() {
    remove.mutate()
  }

  function handleOpenChange(open: boolean) {
    if (!open && !remove.isPending) onClose()
  }

  return (
    <ModalDialog
      open
      onOpenChange={handleOpenChange}
      size="sm"
      leading={
        <Tile tone="fail" size="lg">
          <Trash2 />
        </Tile>
      }
      title={`Delete ${workflow.name}?`}
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            loading={remove.isPending || remove.isSuccess}
          >
            Delete {word}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {deleteLine(workflow.kind, { count: overview.versionCount, more: false }, runCount)}
        </p>
        <FailureLine error={remove.error} general={`Couldn’t delete the ${word}`} />
      </div>
    </ModalDialog>
  )
}
