import { useId, useState, type SubmitEvent } from 'react'
import { Building2, ShieldCheck } from 'lucide-react'
import { slugify } from '@awaitstep/ir'
import { useCreateOrg } from '../../data/dashboard/session'
import { isReservedSlug, orgPath } from '../../lib/dashboard-paths'
import { Button } from '../ui/button'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { ModalDialog } from '../ui/modal-dialog'
import { Tile } from '../ui/tile'
import { useGoTo } from '../navigation/router-shell-link'

interface CreateOrgDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * "Create an organization" (D-DB-4; no board, NewProject's anatomy): a name
 * and the URL it makes. Lands on the new org's home, empty until its first
 * project.
 */
export function CreateOrgDialog({ open, onOpenChange }: CreateOrgDialogProps) {
  const formId = useId()
  const createOrg = useCreateOrg()
  const goTo = useGoTo()
  const [name, setName] = useState('')
  const slug = slugify(name, '')
  const redirecting = createOrg.isPending || createOrg.isSuccess
  const reserved = slug !== '' && isReservedSlug('org', slug)

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    if (reserved || redirecting) return
    createOrg.mutate(name, { onSuccess: (org) => goTo(orgPath(org.slug)) })
  }

  function handleNameChange(next: string) {
    setName(next)
    createOrg.reset()
  }

  function handleCancel() {
    onOpenChange(false)
  }

  const error = reserved
    ? `“${slug}” is a page of AwaitStep. Pick another name.`
    : createOrg.error?.message

  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      leading={
        <Tile tone="ok" size="lg">
          <Building2 />
        </Tile>
      }
      title="Create an organization"
      description="For a new company or a side project."
      actions={
        <>
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={redirecting} disabled={!slug || reserved}>
            Create organization
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4.5">
        <FormField
          label="Organization name"
          hint={`URL: awaitstep.dev/${slug || '…'}`}
          error={error}
          required
        >
          <Input
            value={name}
            onChange={(event) => handleNameChange(event.target.value)}
            autoFocus
          />
        </FormField>
        <p className="flex items-center gap-2.5 text-sm text-foreground/90">
          <ShieldCheck className="size-4 shrink-0 text-status-info" aria-hidden="true" />
          You’ll be its owner. Invite others after.
        </p>
      </form>
    </ModalDialog>
  )
}
