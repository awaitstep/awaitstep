import { useId, useState, type SubmitEvent } from 'react'
import { Cloud } from 'lucide-react'
import type {
  ProjectConnection,
  ProjectWorkspaceConnection,
} from '../../types/dashboard/project-connections'
import { Button } from '../ui/button'
import { FormField } from '../ui/form-field'
import { ModalDialog } from '../ui/modal-dialog'
import { Select } from '../ui/select'
import { Tile } from '../ui/tile'

/** The Select's value for "follow the project default". */
const PROJECT_DEFAULT = '__default'

interface ChangeWorkspaceDialogProps {
  workspace: ProjectWorkspaceConnection
  connections: ProjectConnection[]
  error?: string
  pending: boolean
  /** Null: back to the project default. */
  onSubmit: (connectionId: string | null) => void
  /** OAuth start for a new account that becomes this workspace's default. */
  oauthHref?: string
  onClose: () => void
}

/** *Change* on a workspace's row: one of the project's accounts, or the project default. */
export function ChangeWorkspaceDialog({
  workspace,
  connections,
  error,
  pending,
  onSubmit,
  oauthHref,
  onClose,
}: ChangeWorkspaceDialogProps) {
  const formId = useId()
  const [value, setValue] = useState(
    workspace.source === 'override' && workspace.connectionId
      ? workspace.connectionId
      : PROJECT_DEFAULT,
  )
  const fallback = connections.find((c) => c.isDefault)
  const options = [
    {
      value: PROJECT_DEFAULT,
      label: fallback ? `Project default (${fallback.name})` : 'Project default (none yet)',
    },
    ...connections.filter((c) => c.available).map((c) => ({ value: c.id, label: c.name })),
  ]

  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    onSubmit(value === PROJECT_DEFAULT ? null : value)
  }

  return (
    <ModalDialog
      open
      onOpenChange={handleOpenChange}
      size="sm"
      leading={
        <Tile tone="warn" size="lg">
          <Cloud />
        </Tile>
      }
      title={`Where ${workspace.name} deploys`}
      description="Deploy in this workspace starts with this account chosen."
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            Save
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit}>
        <FormField label="Deploys to" error={error}>
          <Select value={value} onValueChange={setValue} options={options} className="w-full" />
        </FormField>
        {oauthHref && (
          <div className="mt-4 flex flex-col gap-1.5 border-t border-border pt-4">
            <Button asChild variant="outline" size="sm" className="w-fit">
              <a href={oauthHref}>Connect a new account</a>
            </Button>
            <span className="text-2xs text-muted-foreground">
              A new account connected here becomes this workspace’s default.
            </span>
          </div>
        )}
      </form>
    </ModalDialog>
  )
}
