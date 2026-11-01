import { useRef, useState, type ChangeEvent, type SubmitEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { errorFieldOf } from '../../data/dashboard/errors'
import { useDeleteOrg, useUpdateOrg } from '../../data/dashboard/org-settings'
import { dashboardPath, orgSettingsPath } from '../../lib/dashboard-paths'
import { readImageAsDataUrl } from '../../lib/read-file'
import type { OrgScope } from '../../types/dashboard/scope'
import { BlockedAction } from '../ui/blocked-action'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { DangerRow, DangerZone } from '../ui/danger-zone'
import { FieldGroup, FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { InputGroup } from '../ui/input-group'
import { FormCard } from '../ui/form-card'
import { ClearableMark } from '../ui/clearable-mark'
import { PageBody } from '../shell/page-intro'
import { OrgSettingsIntro } from './org-settings-intro'
import { OrgMark } from '../shell/org-mark'
import { useGoTo } from '../navigation/router-shell-link'
import { TopBarContent } from '../navigation/top-bar-slot'
import { useOrgScope } from './use-org-scope'

const FORM_ID = 'org-general'

interface OrgGeneralPageProps {
  org: string
}

/** `/{org}/settings/general` (`OrgGeneral`): logo, name, URL, and deleting the org. */
export function OrgGeneralPage({ org }: OrgGeneralPageProps) {
  const scope = useOrgScope(org)
  if (!scope) return null
  // Starts again from the saved values after a save.
  return (
    <OrgGeneral
      key={`${scope.org.name}|${scope.org.slug}|${scope.org.logo}`}
      slug={org}
      scope={scope}
    />
  )
}

function OrgGeneral({ slug, scope }: { slug: string; scope: OrgScope }) {
  const org = scope.org
  const can = scope.viewerCan
  const update = useUpdateOrg(slug)
  const remove = useDeleteOrg(slug)
  const goTo = useGoTo()
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(org.name)
  const [urlSlug, setUrlSlug] = useState(org.slug)
  const [logo, setLogo] = useState(org.logo)
  const [deleting, setDeleting] = useState(false)
  // Why the picked file wasn't used (too large, unreadable), before anything is saved.
  const [pickError, setPickError] = useState<string | null>(null)
  const readOnly = !can.manageSettings.allowed
  const trimmed = { name: name.trim(), slug: urlSlug.trim() }
  const dirty = trimmed.name !== org.name || trimmed.slug !== org.slug || logo !== org.logo

  function handleUpload() {
    fileRef.current?.click()
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    update.reset()
    setPickError(null)
    try {
      setLogo(await readImageAsDataUrl(file))
    } catch (failure) {
      setPickError(failure instanceof Error ? failure.message : 'We couldn’t read that file')
    }
  }

  function handleUseInitial() {
    update.reset()
    setPickError(null)
    setLogo(null)
  }

  function handleName(value: string) {
    update.reset()
    setName(value)
  }

  function handleSlug(value: string) {
    update.reset()
    setUrlSlug(value)
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    update.mutate(
      {
        name: trimmed.name,
        logo,
        ...(trimmed.slug !== org.slug && { slug: trimmed.slug }),
      },
      {
        onSuccess: (saved) => {
          if (saved.slug !== slug) goTo(orgSettingsPath(saved.slug, 'general'))
        },
      },
    )
  }

  function handleOpenDelete() {
    remove.reset()
    setDeleting(true)
  }

  function handleDeleteOpenChange(open: boolean) {
    if (!open) setDeleting(false)
  }

  function handleDelete() {
    remove.mutate(undefined, { onSuccess: () => goTo(dashboardPath()) })
  }

  // Each error sits under the field it names; the rest under the name.
  const field = errorFieldOf(update.error)
  const error = update.error?.message
  const slugError = field === 'slug' ? error : undefined
  const logoError = pickError ?? (field === 'logo' ? error : undefined)
  const nameError = field === 'slug' || field === 'logo' ? undefined : error
  const deleteReason = can.delete.allowed ? undefined : can.delete.reason
  const deleteDescription =
    remove.error?.message ??
    `This removes ${org.name} and everyone’s membership. It can’t be undone.`

  return (
    <>
      {!readOnly && (
        <TopBarContent>
          <Button type="submit" form={FORM_ID} size="sm" disabled={!dirty || update.isPending}>
            Save changes
          </Button>
        </TopBarContent>
      )}
      <PageBody>
        <OrgSettingsIntro org={org} section="general" />
        <FormCard id={FORM_ID} onSubmit={handleSubmit}>
          <FieldGroup legend="Logo" error={logoError}>
            <span className="flex flex-wrap items-center gap-3">
              <ClearableMark
                // Absent can be null or undefined: only a real image has a ×.
                hasImage={Boolean(logo)}
                onClear={handleUseInitial}
                clearLabel="Remove logo"
                disabled={readOnly}
              >
                <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary text-lg font-semibold text-primary-foreground">
                  <OrgMark initial={org.initial} logo={logo} />
                </span>
              </ClearableMark>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleUpload}
                disabled={readOnly}
              >
                Upload
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={handleFile}
              />
            </span>
          </FieldGroup>
          <FormField label="Organization name" error={nameError}>
            <Input value={name} onChange={(e) => handleName(e.target.value)} disabled={readOnly} />
          </FormField>
          <FormField
            label="URL"
            hint="Changing it breaks existing links to this organization’s projects."
            error={slugError}
          >
            <InputGroup prefix="awaitstep.dev/">
              <Input
                value={urlSlug}
                onChange={(e) => handleSlug(e.target.value)}
                disabled={readOnly}
              />
            </InputGroup>
          </FormField>
        </FormCard>
        <DangerZone>
          <DangerRow
            icon={<Trash2 aria-hidden="true" />}
            tone="danger"
            title={`Delete ${org.name}`}
            description="Only owners can delete an organization. Delete or move every project first, after turning off any deletion locks. Deployed workers keep running on Cloudflare."
            action={
              <BlockedAction reason={deleteReason}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-destructive/40 text-status-error"
                  onClick={handleOpenDelete}
                >
                  Delete organization
                </Button>
              </BlockedAction>
            }
          />
        </DangerZone>
      </PageBody>
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={handleDeleteOpenChange}
          icon={Trash2}
          title={`Delete ${org.name}?`}
          description={deleteDescription}
          confirmLabel="Delete organization"
          confirmText={org.name}
          onConfirm={handleDelete}
          loading={remove.isPending}
        />
      )}
    </>
  )
}
