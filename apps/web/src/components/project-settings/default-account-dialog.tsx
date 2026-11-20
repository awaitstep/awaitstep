import { useId, useState, type SubmitEvent } from 'react'
import { Cloud } from 'lucide-react'
import {
  useAddProjectConnections,
  useAvailableConnections,
  useProjectConnections,
  useSetDefaultConnection,
} from '../../data/dashboard/project-connections'
import type { ProjectSlugs } from '../../lib/dashboard-paths'
import { Button } from '../ui/button'
import { FormField } from '../ui/form-field'
import { ModalDialog } from '../ui/modal-dialog'
import { Select } from '../ui/select'
import { Bone } from '../ui/skeletons'
import { Tile } from '../ui/tile'
import { defaultAccountChoices } from '../connections/account-choices'
import { useConnectAccountLink } from '../connections/connect-account-link'
import { ConnectNewAccount } from '../connections/connect-new-account'
import { useProjectScope } from './use-project-scope'

interface DefaultAccountDialogProps {
  slugs: ProjectSlugs
  orgName: string
  projectName: string
  /** The current default's id; null with none. */
  currentId: string | null
  onClose: () => void
}

/**
 * Project Settings → *Change* on the Cloudflare account: any account the
 * project may use. An org account it hasn't added is added, then made the default.
 */
export function DefaultAccountDialog({
  slugs,
  orgName,
  projectName,
  currentId,
  onClose,
}: DefaultAccountDialogProps) {
  const formId = useId()
  // Mounted only while open, so both lists are fetched when it opens.
  const listed = useProjectConnections(slugs.org, slugs.project)
  const available = useAvailableConnections(slugs.org, slugs.project, true)
  const add = useAddProjectConnections(slugs.org, slugs.project)
  const setDefault = useSetDefaultConnection(slugs.org, slugs.project)
  const orgManager = useProjectScope(slugs)?.org.viewerCan.manageSettings.allowed === true
  const connectLink = useConnectAccountLink(slugs, orgManager)
  const [value, setValue] = useState(currentId ?? '')

  const choices =
    listed.data && available.data
      ? defaultAccountChoices(listed.data.connections, available.data, orgName)
      : null
  const loadError = listed.error ?? available.error
  const options = (choices ?? []).map((c) => ({
    value: c.id,
    label: c.name,
    description: c.description,
  }))
  const pending = add.isPending || setDefault.isPending
  const error = add.error?.message ?? setDefault.error?.message

  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  function handleChange(next: string) {
    add.reset()
    setDefault.reset()
    setValue(next)
  }

  function makeDefault(id: string) {
    setDefault.mutate(id, { onSuccess: onClose })
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    const choice = choices?.find((c) => c.id === value)
    if (!choice) return
    if (choice.attached) {
      makeDefault(choice.id)
      return
    }
    add.mutate([choice.id], { onSuccess: () => makeDefault(choice.id) })
  }

  let body
  if (loadError) {
    body = <p className="text-xs text-status-error">{loadError.message}</p>
  } else if (!choices) {
    body = <Bone className="h-10 w-full rounded" />
  } else if (choices.length === 0) {
    body = (
      <p className="text-sm text-muted-foreground">No account {projectName} can deploy to yet.</p>
    )
  } else {
    body = (
      <FormField label="Default account" error={error}>
        <Select value={value} onValueChange={handleChange} options={options} className="w-full" />
      </FormField>
    )
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
      title={`${projectName}’s Cloudflare account`}
      description="Its workspaces deploy here unless one is set to another."
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            loading={pending}
            disabled={pending || value === '' || value === (currentId ?? '')}
          >
            Save
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit}>
        {body}
        {connectLink && <ConnectNewAccount link={connectLink} />}
      </form>
    </ModalDialog>
  )
}
