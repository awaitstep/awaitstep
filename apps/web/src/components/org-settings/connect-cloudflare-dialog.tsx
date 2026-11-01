import { useId, useState, type SubmitEvent } from 'react'
import { Check, Cloud } from 'lucide-react'
import { errorFieldOf } from '../../data/dashboard/errors'
import { useConnect } from '../../data/dashboard/org-settings'
import { useProjects } from '../../data/dashboard/projects'
import { Button } from '../ui/button'
import { FieldGroup, FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { ModalDialog } from '../ui/modal-dialog'
import { Tile } from '../ui/tile'
import { ScopeMultiPicker } from '../shell/scope-multi-picker'
import { projectPickId } from '../shell/scope-picks'

const TOKEN_PERMISSIONS = [
  'Account · Workers Scripts · Edit',
  'Account · Workers KV Storage · Edit',
  'Account · Account Settings · Read',
]

/** Errors shown under their own field; any other is shown under the form. */
const FIELD_ERRORS = new Set(['name', 'accountId', 'token'])

const CLOUDFLARE_TOKENS_URL = 'https://dash.cloudflare.com/profile/api-tokens'

interface ConnectCloudflareDialogProps {
  org: { slug: string; name: string }
  onClose: () => void
}

/**
 * "Connect a Cloudflare account" (`ConnectCloudflare`). On the API the token
 * is checked with Cloudflare before anything is stored (B9); dummy data checks
 * only the form's own rules (D-P5-5).
 */
export function ConnectCloudflareDialog({ org, onClose }: ConnectCloudflareDialogProps) {
  const formId = useId()
  const connect = useConnect(org.slug)
  const projects = useProjects(org.slug)
  const [name, setName] = useState('')
  const [accountId, setAccountId] = useState('')
  const [token, setToken] = useState('')
  const [all, setAll] = useState(false)
  const [picks, setPicks] = useState<string[]>([])
  const pickerProjects = (projects.data ?? []).map((p) => ({ id: p.id, name: p.name }))

  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  function handleChange(set: (value: string) => void, value: string) {
    set(value)
    connect.reset()
  }

  function handleAll(event: React.ChangeEvent<HTMLInputElement>) {
    setAll(event.target.checked)
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    const ids = picks.map((id) => id.slice(projectPickId('').length))
    connect.mutate({ name, accountId, token, projects: all ? 'all' : ids }, { onSuccess: onClose })
  }

  const field = errorFieldOf(connect.error)
  const errorOn = (name: string) => (field === name ? connect.error?.message : undefined)
  // Cloudflare unreachable, a lockout, a project list the org no longer has: under the form.
  const formError =
    connect.error && !FIELD_ERRORS.has(field ?? '') ? connect.error.message : undefined
  const countText = `${picks.length} of ${pickerProjects.length} projects selected`

  return (
    <ModalDialog
      open
      onOpenChange={handleOpenChange}
      size="md"
      leading={
        <Tile tone="warn" size="lg">
          <Cloud />
        </Tile>
      }
      title="Connect a Cloudflare account"
      description="AwaitStep deploys your workflows to this account."
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={connect.isPending}>
            {connect.isPending ? 'Checking token…' : 'Check token and connect'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-background p-4">
          <span className="text-xs font-semibold text-foreground">
            1. Create an API token in Cloudflare
          </span>
          <span className="text-2xs text-muted-foreground">
            Use the “Edit Cloudflare Workers” template, or give it these permissions:
          </span>
          <ul className="flex flex-col gap-1.5">
            {TOKEN_PERMISSIONS.map((permission) => (
              <li key={permission} className="flex items-center gap-2 text-xs text-foreground/90">
                <Check className="size-3.5 text-status-success" aria-hidden="true" />
                {permission}
              </li>
            ))}
          </ul>
          <a
            href={CLOUDFLARE_TOKENS_URL}
            target="_blank"
            rel="noreferrer"
            className="w-fit text-xs font-medium text-status-success hover:underline"
          >
            Open Cloudflare API tokens ↗
          </a>
        </div>
        <span className="text-xs font-semibold text-foreground">2. Paste it here</span>
        <FormField label="Name" error={errorOn('name')}>
          <Input
            value={name}
            onChange={(e) => handleChange(setName, e.target.value)}
            placeholder="Acme production"
          />
        </FormField>
        <FormField label="Account ID" error={errorOn('accountId')}>
          <Input
            value={accountId}
            onChange={(e) => handleChange(setAccountId, e.target.value)}
            placeholder="32-character ID from the Cloudflare dashboard"
            className="font-mono"
          />
        </FormField>
        <FormField
          label="API token"
          hint="Encrypted when saved. You won’t see it again."
          error={errorOn('token')}
        >
          <Input
            type="password"
            value={token}
            onChange={(e) => handleChange(setToken, e.target.value)}
            placeholder="Paste the token"
            className="font-mono"
          />
        </FormField>
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
              Every project in {org.name} can deploy with this account, including ones created
              later.
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
              <span className="text-2xs text-muted-foreground">{countText}</span>
            </>
          )}
        </FieldGroup>
        {formError && (
          <p role="alert" className="text-xs text-status-error">
            {formError}
          </p>
        )}
      </form>
    </ModalDialog>
  )
}
