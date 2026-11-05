import { EyeOff, Trash2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import type { WorkflowSummary } from '../../lib/api-client'
import { plural } from '../../lib/plural'
import type { useWorkflowActions } from '../dashboard/use-workflow-actions'
import { Button } from '../ui/button'
import { ModalDialog } from '../ui/modal-dialog'
import { Tile } from '../ui/tile'
import { FailureLine } from './failure-line'
import type { WorkflowOverview } from './use-workflow-overview'
import { useQueries } from '../../contexts/api-client-context'

type Actions = ReturnType<typeof useWorkflowActions>

interface TakeDownDialogProps {
  workflow: WorkflowSummary
  version: number | undefined
  takedown: Actions['takedown']
  onClose: () => void
}

/** Take down (board `WorkflowActions`): the worker stops; the item stays. */
export function TakeDownDialog({ workflow, version, takedown, onClose }: TakeDownDialogProps) {
  const queries = useQueries()
  const targets = useQuery(queries.connections.forDeploy(workflow.id))
  const account = targets.data?.deployedWith[0]?.name

  function handleConfirm() {
    takedown.mutate(undefined, { onSuccess: onClose })
  }

  function handleOpenChange(open: boolean) {
    if (!open && !takedown.isPending) onClose()
  }

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
      title={version === undefined ? `Take down ${workflow.name}?` : `Take down v${version}?`}
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
          >
            Take down
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          The worker stops answering{account ? ` on ${account}` : ''}. Runs already going finish.
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
          {deleteLine(
            workflow.kind,
            { count: overview.versions.length, more: overview.versionsHasMore },
            runCount,
          )}
        </p>
        <FailureLine error={remove.error} general={`Couldn’t delete the ${word}`} />
      </div>
    </ModalDialog>
  )
}
