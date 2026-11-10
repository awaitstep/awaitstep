import { useId, useState, type SubmitEvent } from 'react'
import { Cloud } from 'lucide-react'
import { errorFieldOf } from '../../data/dashboard/errors'
import { useOAuthStatus } from '../../data/dashboard/org-settings'
import {
  useAddProjectConnections,
  useAvailableConnections,
  useCreateProjectConnection,
} from '../../data/dashboard/project-connections'
import type { NewProjectConnectionInput } from '../../types/dashboard/project-connections'
import type { ProjectSlugs } from '../../lib/dashboard-paths'
import { Button } from '../ui/button'
import { oauthStartUrl } from '../org-settings/oauth-start'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { ModalDialog } from '../ui/modal-dialog'
import { SegmentedChoice } from '../ui/segmented-choice'
import { Bone } from '../ui/skeletons'
import { Tile } from '../ui/tile'
import { AvailableList } from './parts/available-list'
import { availableNote } from './project-connections-copy'

export type AddTab = 'org' | 'new'

/** Errors shown under their own field; any other is shown under the form. */
const FIELD_ERRORS = new Set(['name', 'accountId', 'token'])

const CLOUDFLARE_TOKENS_URL = 'https://dash.cloudflare.com/profile/api-tokens'

interface AddConnectionDialogProps {
  slugs: ProjectSlugs
  orgName: string
  projectName: string
  tab: AddTab
  onTabChange: (tab: AddTab) => void
  onClose: () => void
}

/** "Add a connection to {project}" (`AttachConnection`, 23b). */
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
  const oauthStatus = useOAuthStatus()
  const oauthEnabled = oauthStatus.data?.enabled === true
  const [picked, setPicked] = useState<string[]>([])
  const [form, setForm] = useState<NewProjectConnectionInput>({
    name: '',
    accountId: '',
    token: '',
    makeDefault: true,
  })

  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  function handleToggle(id: string) {
    add.reset()
    setPicked((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]))
  }

  function handleField(field: 'name' | 'accountId' | 'token', value: string) {
    create.reset()
    setForm((now) => ({ ...now, [field]: value }))
  }

  function handleMakeDefault(event: React.ChangeEvent<HTMLInputElement>) {
    setForm((now) => ({ ...now, makeDefault: event.target.checked }))
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    if (tab === 'org') add.mutate(picked, { onSuccess: onClose })
    else create.mutate(form, { onSuccess: onClose })
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
  const submitDisabled = pending || (tab === 'org' && picked.length === 0)
  const footNote =
    tab === 'org'
      ? 'Adding an account never reveals its token.'
      : 'The token is checked before it is saved.'
  const cta =
    tab === 'org'
      ? picked.length === 1
        ? 'Add 1 account'
        : `Add ${picked.length} accounts`
      : create.isPending
        ? 'Checking token…'
        : 'Check token and connect'

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
      title={`Add a connection to ${projectName}`}
      description="Its workflows deploy to the accounts you add here."
      footerStart={<span className="text-xs text-muted-foreground">{footNote}</span>}
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={submitDisabled}>
            {cta}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
        <SegmentedChoice label="How to add" options={tabs} value={tab} onChange={onTabChange} />
        {tab === 'org' ? (
          <div className="flex flex-col gap-2">
            {available.data && (
              <span className="text-xs text-muted-foreground">
                {availableNote(available.data, orgName)}
              </span>
            )}
            {orgBody}
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            {oauthEnabled && (
              <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-4">
                <Button asChild size="sm" className="w-fit">
                  <a href={oauthStartUrl(slugs.org, { project: slugs.project })}>
                    <Cloud aria-hidden="true" />
                    Connect with Cloudflare
                  </a>
                </Button>
                <span className="text-2xs text-muted-foreground">
                  Recommended: no token to paste. Or use an API token below.
                </span>
              </div>
            )}
            <FormField label="Name" error={errorOn('name')}>
              <Input
                value={form.name}
                onChange={(e) => handleField('name', e.target.value)}
                placeholder="Checkout staging"
              />
            </FormField>
            <FormField label="Account ID" error={errorOn('accountId')}>
              <Input
                value={form.accountId}
                onChange={(e) => handleField('accountId', e.target.value)}
                placeholder="32-character ID from the Cloudflare dashboard"
                className="font-mono"
              />
            </FormField>
            <FormField
              label="API token"
              error={errorOn('token')}
              hint={
                <>
                  Needs Workers Scripts · Edit, Workers KV · Edit and Account Settings · Read.{' '}
                  <a
                    href={CLOUDFLARE_TOKENS_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-status-success hover:underline"
                  >
                    Open Cloudflare API tokens ↗
                  </a>
                </>
              }
            >
              <Input
                type="password"
                value={form.token}
                onChange={(e) => handleField('token', e.target.value)}
                placeholder="Paste the token"
                className="font-mono"
              />
            </FormField>
            <p className="rounded-xl border border-dashed border-border px-3.5 py-2.5 text-xs text-muted-foreground">
              Only {projectName} can see it or deploy with it. An account for the whole organization
              is connected on {orgName}’s Connections page.
            </p>
            <label className="flex items-center gap-2 text-xs text-foreground/90">
              <input
                type="checkbox"
                checked={form.makeDefault}
                onChange={handleMakeDefault}
                className="size-4 accent-primary"
              />
              Make it {projectName}’s default
            </label>
          </div>
        )}
        {formError && (
          <p role="alert" className="text-xs text-status-error">
            {formError}
          </p>
        )}
      </form>
    </ModalDialog>
  )
}
