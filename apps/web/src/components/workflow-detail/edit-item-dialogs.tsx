import { useId, useState, type SubmitEvent } from 'react'
import { ArrowRightLeft, Pencil } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMoveWorkflows } from '../../data/dashboard/items'
import { useWorkspaces } from '../../data/dashboard/workspaces'
import { type WorkflowSummary } from '../../lib/api-client'
import { itemPagePath, type WorkspaceSlugs } from '../../lib/dashboard-paths'
import { useGoTo } from '../navigation/router-shell-link'
import { Button } from '../ui/button'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { ModalDialog } from '../ui/modal-dialog'
import { Select } from '../ui/select'
import { Textarea } from '../ui/textarea'
import { Tile } from '../ui/tile'
import { FailureLine } from './failure-line'
import { useApi } from '../../contexts/api-client-context'

interface RenameItemDialogProps {
  workflow: WorkflowSummary
  word: string
  onClose: () => void
}

/** Rename: its name and description. */
export function RenameItemDialog({ workflow, word, onClose }: RenameItemDialogProps) {
  const api = useApi()
  const formId = useId()
  const queryClient = useQueryClient()
  const [name, setName] = useState(workflow.name)
  const [description, setDescription] = useState(workflow.description ?? '')
  const save = useMutation({
    meta: { toast: { success: 'Saved', error: `Couldn’t rename the ${word}` } },
    mutationFn: () =>
      api.updateWorkflow(workflow.id, { name: name.trim(), description: description.trim() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workflow', workflow.id] })
      void queryClient.invalidateQueries({ queryKey: ['workflows'] })
      void queryClient.invalidateQueries({ queryKey: ['dash'] })
      onClose()
    },
  })
  const unchanged =
    name.trim() === workflow.name && description.trim() === (workflow.description ?? '')

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    if (!name.trim() || unchanged || save.isPending) return
    save.mutate()
  }

  function handleOpenChange(open: boolean) {
    if (!open && !save.isPending) onClose()
  }

  return (
    <ModalDialog
      open
      onOpenChange={handleOpenChange}
      size="md"
      leading={
        <Tile tone="ok" size="lg">
          <Pencil />
        </Tile>
      }
      title={`Rename ${workflow.name}`}
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            loading={save.isPending}
            disabled={!name.trim() || unchanged}
          >
            Save
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit}>
        <fieldset
          disabled={save.isPending}
          className="m-0 flex min-w-0 flex-col gap-4.5 border-0 p-0"
        >
          <FormField label="Name" required>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={255}
              autoFocus
            />
          </FormField>
          <FormField label="Description" optional>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={1000}
            />
          </FormField>
          <FailureLine error={save.error} general={`Couldn’t rename the ${word}`} />
        </fieldset>
      </form>
    </ModalDialog>
  )
}

interface MoveItemDialogProps {
  workflow: WorkflowSummary
  slugs: WorkspaceSlugs
  word: string
  onClose: () => void
}

/** Move to workspace: another workspace in the project; its runs go with it. */
export function MoveItemDialog({ workflow, slugs, word, onClose }: MoveItemDialogProps) {
  const goTo = useGoTo()
  const queryClient = useQueryClient()
  const workspaces = useWorkspaces(slugs.org, slugs.project)
  const move = useMoveWorkflows(slugs)
  const targets = (workspaces.data ?? []).filter((w) => w.slug !== slugs.workspace)
  const [picked, setPicked] = useState<string | null>(null)
  const to = picked ?? targets[0]?.slug ?? null

  function handleMove() {
    if (!to) return
    move.mutate(
      { itemIds: [workflow.id], to },
      { onSuccess: (result) => void opened(result.moved, to) },
    )
  }

  async function opened(moved: number, to: string) {
    // Nothing moved (it went elsewhere meanwhile): it doesn't live at the new address.
    if (moved === 0) {
      onClose()
      return
    }
    // Its old address is gone: replaced, so Back doesn't land on it. The page there
    // waits for the fresh read below rather than judging the cached one, which still
    // names the old workspace.
    goTo(itemPagePath({ ...slugs, workspace: to }, workflow, 'overview'), { replace: true })
    await queryClient.invalidateQueries({ queryKey: ['workflow', workflow.id] })
  }

  function handleOpenChange(open: boolean) {
    if (!open && !move.isPending) onClose()
  }

  function handlePick(slug: string) {
    setPicked(slug)
    move.reset()
  }

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
      title={`Move ${workflow.name}`}
      description={`Its runs and deployments go with it.`}
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={move.isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleMove}
            loading={move.isPending || move.isSuccess}
            disabled={!to}
          >
            Move {word}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {workspaces.data && targets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            There’s no other workspace in this project to move it to.
          </p>
        ) : (
          <FormField label="Workspace">
            <Select
              aria-label="Workspace"
              value={to ?? ''}
              onValueChange={handlePick}
              options={targets.map((w) => ({ value: w.slug, label: w.name }))}
              disabled={!workspaces.data || move.isPending}
            />
          </FormField>
        )}
        <FailureLine error={move.error} general={`Couldn’t move the ${word}`} />
      </div>
    </ModalDialog>
  )
}
