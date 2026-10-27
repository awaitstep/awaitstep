import { useState } from 'react'
import { UserPlus, X } from 'lucide-react'
import { useAddWorkspaceMember } from '../../data/dashboard/members'
import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import type { Person } from '../../types/dashboard/session'
import type { WorkspaceRole } from '../../types/dashboard/workspaces'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Banner } from '../ui/banner'
import { FieldGroup, FormField } from '../ui/form-field'
import { ModalDialog } from '../ui/modal-dialog'
import { Select } from '../ui/select'
import { Tile } from '../ui/tile'
import { PersonPicker } from '../project-settings/person-picker'
import { WORKSPACE_ROLE_OPTIONS } from './workspace-roles'

interface AddMemberDialogProps {
  slugs: WorkspaceSlugs
  org: { slug: string; name: string }
  workspaceName: string
  /** People who can already open the workspace. */
  exclude: Set<string>
  onClose: () => void
}

/**
 * Add member (D-P4-2): someone already in the org gets a role in this
 * workspace. Inviting people to the org is org Members' job.
 */
export function AddMemberDialog({
  slugs,
  org,
  workspaceName,
  exclude,
  onClose,
}: AddMemberDialogProps) {
  const add = useAddWorkspaceMember(slugs)
  const [person, setPerson] = useState<Person | null>(null)
  const [role, setRole] = useState<WorkspaceRole>('editor')

  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  function handlePick(picked: Person) {
    setPerson(picked)
    add.reset()
  }

  function handleClear() {
    setPerson(null)
  }

  function handleRole(value: string) {
    setRole(value as WorkspaceRole)
  }

  function handleAdd() {
    if (!person) return
    add.mutate({ userId: person.id, role }, { onSuccess: onClose })
  }

  const canAdd = person !== null && !add.isPending

  return (
    <ModalDialog
      open
      onOpenChange={handleOpenChange}
      size="sm"
      leading={
        <Tile tone="ok" size="lg">
          <UserPlus />
        </Tile>
      }
      title={`Add someone to ${workspaceName}`}
      description={`People are invited to ${org.name} first, from org Settings → Members.`}
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleAdd} disabled={!canAdd}>
            Add member
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {add.error && <Banner tone="warn">{add.error.message}</Banner>}
        <FieldGroup legend="Person">
          <span className="flex flex-wrap items-center gap-2">
            {person ? (
              <Badge variant="success" className="gap-1.5 py-1 pr-1">
                {person.name}
                <button
                  type="button"
                  aria-label={`Remove ${person.name}`}
                  onClick={handleClear}
                  className="rounded-full p-0.5 hover:bg-status-success/20"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </Badge>
            ) : (
              <PersonPicker org={org} exclude={exclude} onPick={handlePick} />
            )}
          </span>
        </FieldGroup>
        <FormField label="Role">
          <Select value={role} onValueChange={handleRole} options={WORKSPACE_ROLE_OPTIONS} />
        </FormField>
      </div>
    </ModalDialog>
  )
}
