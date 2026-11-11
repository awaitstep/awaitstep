import { useId, useState, type ChangeEvent, type SubmitEvent } from 'react'
import { ChevronLeft } from 'lucide-react'
import { errorFieldOf } from '../../data/dashboard/errors'
import {
  useAddProjectConnections,
  useAvailableConnections,
  useCreateProjectConnection,
} from '../../data/dashboard/project-connections'
import type { ProjectSlugs } from '../../lib/dashboard-paths'
import { Button } from '../ui/button'
import { ModalDialog } from '../ui/modal-dialog'
import { SegmentedChoice } from '../ui/segmented-choice'
import { Bone } from '../ui/skeletons'
import { AvailableList } from './parts/available-list'
import { availableNote } from './project-connections-copy'
import { ProviderPicker } from '../connections/new-account/provider-picker'
import { NEW_ACCOUNT_PROVIDERS, type NewAccountDetails } from '../connections/new-account/providers'

export type AddTab = 'org' | 'new'

/** Errors shown under their own field; any other is shown under the form. */
const FIELD_ERRORS = new Set(['name', 'accountId', 'token'])

interface AddConnectionDialogProps {
  slugs: ProjectSlugs
  orgName: string
  projectName: string
  tab: AddTab
  onTabChange: (tab: AddTab) => void
  onClose: () => void
}

/**
 * "Add a connection to {project}" (`AttachConnection`, 23b): an account the
 * organization already has, or a new one — its provider first, then that
 * provider's own connect step (`new-account/`).
 */
export function AddConnectionDialog({
  slugs,
  orgName,
  projectName,
  tab,
  onTabChange,
  onClose,
}: AddConnectionDialogProps) {
  const formId = useId()
  const available = useAvailableConnections(slugs.org, slugs.project, tab === 'org')
  const add = useAddProjectConnections(slugs.org, slugs.project)
  const create = useCreateProjectConnection(slugs.org, slugs.project)
  const [picked, setPicked] = useState<string[]>([])
  const [providerId, setProviderId] = useState<string | null>(null)
  const [makeDefault, setMakeDefault] = useState(true)
  const provider = NEW_ACCOUNT_PROVIDERS.find((p) => p.id === providerId)

  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  function handleToggle(id: string) {
    add.reset()
    setPicked((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]))
  }

  function handlePickProvider(id: string) {
    create.reset()
    setProviderId(id)
  }

  function handleBackToProviders() {
    create.reset()
    setProviderId(null)
  }

  function handleMakeDefault(event: ChangeEvent<HTMLInputElement>) {
    setMakeDefault(event.target.checked)
  }

  function handleAddFromOrg(event: SubmitEvent) {
    event.preventDefault()
    add.mutate(picked, { onSuccess: onClose })
  }

  function handleConnect(details: NewAccountDetails) {
    create.mutate({ ...details, makeDefault }, { onSuccess: onClose })
  }

  function handleEdit() {
    create.reset()
  }

  const tabs = [
    { value: 'org' as const, label: `In ${orgName}` },
    { value: 'new' as const, label: 'Connect a new account' },
  ]
  const field = errorFieldOf(create.error)
  const errorOn = (name: string) => (field === name ? create.error?.message : undefined)
  const formError =
    tab === 'org'
      ? add.error?.message
      : create.error && !FIELD_ERRORS.has(field ?? '')
        ? create.error.message
        : undefined
  const pending = add.isPending || create.isPending
  // A new account has nothing to submit until its provider is picked.
  const canSubmit = tab === 'org' || provider !== undefined
  const submitDisabled = pending || (tab === 'org' && picked.length === 0)
  let cta = ''
  if (tab === 'org') cta = picked.length === 1 ? 'Add 1 account' : `Add ${picked.length} accounts`
  else if (provider) cta = provider.submitLabel(create.isPending)

  let orgBody
  if (available.isError) {
    orgBody = <p className="text-xs text-status-error">{available.error.message}</p>
  } else if (!available.data) {
    orgBody = (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Bone className="h-14 w-full rounded-xl" />
        <Bone className="h-14 w-full rounded-xl" />
      </div>
    )
  } else {
    orgBody = <AvailableList accounts={available.data} picked={picked} onToggle={handleToggle} />
  }

  let newBody
  if (!provider) {
    newBody = <ProviderPicker providers={NEW_ACCOUNT_PROVIDERS} onPick={handlePickProvider} />
  } else {
    const { Connect } = provider
    newBody = (
      <>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto self-start p-0 text-xs"
          onClick={handleBackToProviders}
        >
          <ChevronLeft aria-hidden="true" />
          Other providers
        </Button>
        <Connect
          formId={formId}
          place={slugs}
          pending={create.isPending}
          errorOn={errorOn}
          onSubmit={handleConnect}
          onEdit={handleEdit}
        />
        <p className="rounded-xl border border-dashed border-border px-3.5 py-2.5 text-xs text-muted-foreground">
          Only {projectName} can see it or deploy with it. An account for the whole organization is
          connected on {orgName}’s Connections page.
        </p>
        <label className="flex items-center gap-2 text-xs text-foreground/90">
          <input
            type="checkbox"
            checked={makeDefault}
            onChange={handleMakeDefault}
            className="size-4 accent-primary"
          />
          Make it {projectName}’s default
        </label>
      </>
    )
  }

  return (
    <ModalDialog
      open
      onOpenChange={handleOpenChange}
      size="md"
      title={`Add a connection to ${projectName}`}
      description="Its workflows deploy to the accounts you add here."
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {canSubmit && (
            <Button type="submit" form={formId} disabled={submitDisabled}>
              {cta}
            </Button>
          )}
        </>
      }
    >
      <SegmentedChoice label="How to add" options={tabs} value={tab} onChange={onTabChange} />

      {tab === 'org' ? (
        <form id={formId} onSubmit={handleAddFromOrg} className="flex flex-col gap-2">
          {available.data && (
            <span className="text-xs text-muted-foreground">
              {availableNote(available.data, orgName)}
            </span>
          )}
          {orgBody}
        </form>
      ) : (
        <div className="flex flex-col gap-[18px]">{newBody}</div>
      )}
      {formError && (
        <p role="alert" className="text-xs text-status-error">
          {formError}
        </p>
      )}
    </ModalDialog>
  )
}
