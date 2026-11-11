import { useId, useState, type ChangeEvent } from 'react'
import { ChevronLeft } from 'lucide-react'
import { errorFieldOf } from '../../data/dashboard/errors'
import { useConnect } from '../../data/dashboard/org-settings'
import { useProjects } from '../../data/dashboard/projects'
import { Button } from '../ui/button'
import { FieldGroup } from '../ui/form-field'
import { ModalDialog } from '../ui/modal-dialog'
import { ScopeMultiPicker } from '../shell/scope-multi-picker'
import { projectPickId } from '../shell/scope-picks'
import { ProviderPicker } from '../connections/new-account/provider-picker'
import { NEW_ACCOUNT_PROVIDERS, type NewAccountDetails } from '../connections/new-account/providers'

/** Errors shown under their own field; any other is shown under the form. */
const FIELD_ERRORS = new Set(['name', 'accountId', 'token'])

interface AddAccountDialogProps {
  org: { slug: string; name: string }
  onClose: () => void
}

/**
 * Add account on the organization's Connections: the provider first, then
 * that provider's connect step — the same one a project's Add a connection
 * uses — and which projects may deploy with it.
 */
export function AddAccountDialog({ org, onClose }: AddAccountDialogProps) {
  const formId = useId()
  const connect = useConnect(org.slug)
  const [providerId, setProviderId] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  const [picks, setPicks] = useState<string[]>([])
  const provider = NEW_ACCOUNT_PROVIDERS.find((p) => p.id === providerId)
  // The project list is only shown once a provider is picked.
  const projects = useProjects(org.slug, { enabled: provider !== undefined })
  const pickerProjects = (projects.data ?? []).map((p) => ({ id: p.id, name: p.name }))

  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  function handlePickProvider(id: string) {
    connect.reset()
    setProviderId(id)
  }

  function handleBackToProviders() {
    connect.reset()
    setProviderId(null)
  }

  function handleEdit() {
    connect.reset()
  }

  function handleAll(event: ChangeEvent<HTMLInputElement>) {
    setAll(event.target.checked)
  }

  function handleConnect(details: NewAccountDetails) {
    const ids = picks.map((id) => id.slice(projectPickId('').length))
    connect.mutate({ ...details, projects: all ? 'all' : ids }, { onSuccess: onClose })
  }

  const field = errorFieldOf(connect.error)
  const errorOn = (name: string) => (field === name ? connect.error?.message : undefined)
  // Cloudflare unreachable, a lockout, a project list the org no longer has: under the form.
  const formError =
    connect.error && !FIELD_ERRORS.has(field ?? '') ? connect.error.message : undefined

  let body
  if (!provider) {
    body = <ProviderPicker providers={NEW_ACCOUNT_PROVIDERS} onPick={handlePickProvider} />
  } else {
    const { Connect } = provider
    body = (
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
          place={{ org: org.slug }}
          pending={connect.isPending}
          errorOn={errorOn}
          onSubmit={handleConnect}
          onEdit={handleEdit}
        />
        <FieldGroup legend="Which projects may deploy with it">
          <label className="flex items-center gap-2 text-xs text-foreground/90">
            <input
              type="checkbox"
              checked={all}
              onChange={handleAll}
              className="size-4 accent-primary"
            />
            All projects, including new ones
          </label>
          {all ? (
            <p className="rounded-xl border border-dashed border-border px-3.5 py-2.5 text-xs text-muted-foreground">
              Every project in {org.name} can deploy with this account, including new ones.
            </p>
          ) : (
            <>
              <ScopeMultiPicker
                label="Projects that may deploy with it"
                projects={pickerProjects}
                value={picks}
                onChange={setPicks}
                placeholder={`Search ${pickerProjects.length} projects`}
                addPlaceholder="Add another project"
              />
              <span className="text-2xs text-muted-foreground">
                {`${picks.length} of ${pickerProjects.length} projects selected`}
              </span>
            </>
          )}
        </FieldGroup>
      </>
    )
  }

  return (
    <ModalDialog
      open
      onOpenChange={handleOpenChange}
      size="md"
      title="Add account"
      description={`Projects in ${org.name} deploy to the accounts you add here.`}
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {provider && (
            <Button type="submit" form={formId} loading={connect.isPending}>
              {provider.submitLabel(connect.isPending)}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-[18px]">{body}</div>
      {formError && (
        <p role="alert" className="text-xs text-status-error">
          {formError}
        </p>
      )}
    </ModalDialog>
  )
}
