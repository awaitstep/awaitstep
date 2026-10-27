import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { errorFieldOf } from '../../data/dashboard/errors'
import { useDeleteOrg, useUpdateOrg } from '../../data/dashboard/org-settings'
import { chooseOrgPath, orgSettingsPath } from '../../lib/dashboard-paths'
import type { OrgScope } from '../../types/dashboard/scope'
import { BlockedAction } from '../ui/blocked-action'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { DangerRow, DangerZone } from '../ui/danger-zone'
import { FieldGroup, FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { InputGroup } from '../ui/input-group'
import { PageBody, PageIntro } from '../shell/page-intro'
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

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
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
    setLogo(await readAsDataUrl(file))
  }

  function handleUseInitial() {
    update.reset()
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

  function handleSubmit(event: FormEvent) {
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
    remove.mutate(undefined, { onSuccess: () => goTo(chooseOrgPath()) })
  }

  // Each error sits under the field it names; the rest under the name.
  const field = errorFieldOf(update.error)
  const error = update.error?.message
  const slugError = field === 'slug' ? error : undefined
  const logoError = field === 'logo' ? error : undefined
  const nameError = field === 'slug' || field === 'logo' ? undefined : error
  const canClearLogo = !readOnly && logo !== null
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
        <PageIntro title="General" description={`${org.name}’s name, address and logo.`} />
        <form
          id={FORM_ID}
          onSubmit={handleSubmit}
          className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6"
        >
          <FieldGroup legend="Logo" error={logoError}>
            <span className="flex flex-wrap items-center gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary text-lg font-semibold text-primary-foreground">
                <OrgMark initial={org.initial} logo={logo} />
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleUpload}
                disabled={readOnly}
              >
                Upload
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleUseInitial}
                disabled={!canClearLogo}
              >
                Use initial
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
            hint="Changing it breaks bookmarked links to every project."
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
        </form>
        <DangerZone>
          <DangerRow
            icon={<Trash2 aria-hidden="true" />}
            tone="danger"
            title={`Delete ${org.name}`}
            description="Owners only. Delete or move its projects first; locked projects block this. Deployed workers keep running on Cloudflare."
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
