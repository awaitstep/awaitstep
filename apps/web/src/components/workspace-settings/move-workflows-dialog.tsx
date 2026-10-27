import { useState } from 'react'
import { ArrowRightLeft, Info } from 'lucide-react'
import { useMoveWorkflows, useWorkspaceItems } from '../../data/dashboard/items'
import { useWorkspaces } from '../../data/dashboard/workspaces'
import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import type { WorkspaceItem } from '../../types/dashboard/items'
import { Banner } from '../ui/banner'
import { Button } from '../ui/button'
import { CheckboxCard } from '../ui/choice-card'
import { FieldGroup, FormField } from '../ui/form-field'
import { ModalDialog } from '../ui/modal-dialog'
import { Select } from '../ui/select'
import { Tile } from '../ui/tile'
import { ITEM_KIND_LABEL } from '../items/item-kind'
import { moveCount } from './move-count'

interface MoveWorkflowsDialogProps {
  slugs: WorkspaceSlugs
  workspaceName: string
  projectName: string
  onClose: () => void
}

/** "Workflow · deployed v2", "Workflow · shared, called by IT". */
function itemDetail(item: WorkspaceItem): string {
  const kind = ITEM_KIND_LABEL[item.kind]
  if (item.usedBy.length > 0) {
    return `${kind} · shared, called by ${item.usedBy.map((w) => w.name).join(', ')}`
  }
  if (item.sharing) return `${kind} · shared`
  return item.status === 'deployed' ? `${kind} · deployed v${item.version}` : `${kind} · draft`
}

/** "Move workflows out of Sales" (`MoveWorkflows`): pick a workspace in the project and what goes. */
export function MoveWorkflowsDialog({
  slugs,
  workspaceName,
  projectName,
  onClose,
}: MoveWorkflowsDialogProps) {
  const workspaces = useWorkspaces(slugs.org, slugs.project)
  const workflows = useWorkspaceItems(slugs, 'workflow')
  const functions = useWorkspaceItems(slugs, 'script')
  const move = useMoveWorkflows(slugs)
  const targets = (workspaces.data ?? []).filter((w) => w.slug !== slugs.workspace)
  const items = [...(workflows.data ?? []), ...(functions.data ?? [])]
  const [picked, setPicked] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const to = picked ?? targets[0]?.slug ?? null

  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  function handleTarget(slug: string) {
    setPicked(slug)
    move.reset()
  }

  function handleToggle(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
    move.reset()
  }

  function handleMove() {
    if (!to) return
    move.mutate({ itemIds: [...selected], to }, { onSuccess: onClose })
  }

  const count = selected.size
  const moveLabel = `Move ${moveCount(items.filter((i) => selected.has(i.id)))}`
  const nowhere = workspaces.data !== undefined && targets.length === 0
  const canMove = count > 0 && to !== null && !move.isPending
  const target = to ?? ''

  return (
    <ModalDialog
      open
      onOpenChange={handleOpenChange}
      size="md"
      leading={
        <Tile tone="info" size="lg">
          <ArrowRightLeft />
        </Tile>
      }
      title={`Move workflows out of ${workspaceName}`}
      description="Pick what to move and where."
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleMove} disabled={!canMove}>
            {moveLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {nowhere ? (
          <p className="text-sm text-foreground/90">
            {workspaceName} is the only workspace in {projectName}. Create another one to move
            workflows into.
          </p>
        ) : (
          <FormField
            label="Move to"
            hint={`Only workspaces in ${projectName}. Moving to another project is done from the workflow.`}
            error={move.error?.message}
          >
            <Select
              value={target}
              onValueChange={handleTarget}
              options={targets.map((w) => ({ value: w.slug, label: w.name }))}
            />
          </FormField>
        )}
        <FieldGroup legend={`From ${workspaceName} · ${count} of ${items.length} selected`}>
          <span className="flex flex-col gap-2">
            {items.map((item) => (
              <CheckboxCard
                key={item.id}
                checked={selected.has(item.id)}
                onChange={(on) => handleToggle(item.id, on)}
                title={item.name}
                description={itemDetail(item)}
              />
            ))}
          </span>
        </FieldGroup>
        <Banner tone="info" icon={Info}>
          Run history and deployments move with them. Their workers keep running; {workspaceName}{' '}
          people lose access unless they’re also in the workspace you pick.
        </Banner>
      </div>
    </ModalDialog>
  )
}
