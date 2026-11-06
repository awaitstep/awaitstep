import { useState } from 'react'
import {
  ArrowRightLeft,
  Copy,
  Download,
  EyeOff,
  Lock,
  MoreHorizontal,
  Share2,
  Trash2,
  Unlock,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useSetShared } from '../../data/dashboard/items'
import type { WorkflowSummary } from '../../lib/api-client'
import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import { useWorkflowActions } from '../dashboard/use-workflow-actions'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { MoveItemDialog } from './edit-item-dialogs'
import { DeleteItemDialog, TakeDownDialog } from './remove-item-dialogs'
import { useLockDeployed } from './use-lock-deployed'
import type { WorkflowOverview } from './use-workflow-overview'
import { useEditorAccess } from '../../contexts/editor-scope-context'

type OpenDialog = 'move' | 'takedown' | 'delete' | null

interface ItemActionsMenuProps {
  slugs: WorkspaceSlugs
  workflow: WorkflowSummary
  overview: WorkflowOverview
  /** All its runs, when known: Delete says how many go with it. */
  runCount?: number
}

/**
 * ⋯ on a workflow or function's page (boards `WorkflowActions`, `FunctionDetail`):
 * Duplicate · Move (Stop sharing on a shared function) · Lock · Export IR,
 * then Take down and Delete. The name and description are edited in place in
 * the header. Each write needs the right the API checks for it; a Viewer keeps
 * Export, and the menu says why the rest are off.
 */
export function ItemActionsMenu({ slugs, workflow, overview, runCount }: ItemActionsMenuProps) {
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const actions = useWorkflowActions(workflow)
  const lock = useLockDeployed(workflow.id, overview.activeDeployment?.versionId ?? undefined)
  const share = useSetShared(slugs)
  const isFunction = workflow.kind === 'script'
  const hasVersion = !!workflow.currentVersionId
  const deployed = overview.hasActiveDeployment
  const locked = overview.deployBlocked
  const word = isFunction ? 'function' : 'workflow'
  const { canEdit, canDeploy, canShare, canMove, reason } = useEditorAccess()

  function close() {
    setDialog(null)
  }

  function handleMove() {
    setDialog('move')
  }

  function handleTakeDown() {
    actions.takedown.reset()
    setDialog('takedown')
  }

  function handleDelete() {
    actions.remove.reset()
    setDialog('delete')
  }

  function handleDuplicate() {
    actions.duplicate.mutate()
  }

  function handleExport() {
    actions.exportIr.mutate()
  }

  function handleToggleLock() {
    lock.mutate(!locked)
  }

  function handleStopSharing() {
    share.mutate(
      { itemId: workflow.id, shared: false },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workflow', workflow.id] }) },
    )
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="More actions"
          >
            <MoreHorizontal aria-hidden="true" className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          aria-label={`${isFunction ? 'Function' : 'Workflow'} actions`}
        >
          {reason && (
            <>
              <p className="max-w-[240px] px-2.5 py-1.5 text-xs text-muted-foreground">{reason}</p>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem
            onSelect={handleDuplicate}
            disabled={!canEdit || actions.duplicate.isPending || !hasVersion}
          >
            <Copy size={14} /> Duplicate
          </DropdownMenuItem>
          {isFunction && workflow.sharedBy ? (
            <DropdownMenuItem onSelect={handleStopSharing} disabled={!canShare || share.isPending}>
              <Share2 size={14} /> Stop sharing
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={handleMove} disabled={!canMove}>
              <ArrowRightLeft size={14} /> Move to workspace
              {/* An Editor gets no reason line: say why this one is off. */}
              {canEdit && !canMove && (
                <span className="ml-auto text-xs text-muted-foreground">Admins only</span>
              )}
            </DropdownMenuItem>
          )}
          {/* The deployed version's lock: nothing else can be deployed over it. */}
          <DropdownMenuItem
            onSelect={handleToggleLock}
            disabled={!canEdit || !deployed || lock.isPending}
          >
            {locked ? <Unlock size={14} /> : <Lock size={14} />}
            {locked ? 'Unlock' : 'Lock'}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={handleExport}
            disabled={actions.exportIr.isPending || !hasVersion}
          >
            <Download size={14} /> Export IR
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {deployed && (
            <DropdownMenuItem
              className="text-status-warning focus:text-status-warning"
              onSelect={handleTakeDown}
              disabled={!canDeploy}
            >
              <EyeOff size={14} /> Take down
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={handleDelete}
            disabled={!canEdit}
          >
            <Trash2 size={14} /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog === 'move' && (
        <MoveItemDialog workflow={workflow} slugs={slugs} word={word} onClose={close} />
      )}
      {dialog === 'takedown' && (
        <TakeDownDialog
          workflow={workflow}
          version={overview.deployedVersion?.version}
          takedown={actions.takedown}
          onClose={close}
        />
      )}
      {dialog === 'delete' && (
        <DeleteItemDialog
          workflow={workflow}
          overview={overview}
          runCount={runCount}
          remove={actions.remove}
          onClose={close}
        />
      )}
    </>
  )
}
