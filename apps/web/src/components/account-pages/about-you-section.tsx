import { useId, useRef, useState, type ChangeEvent, type SubmitEvent } from 'react'
import { Check } from 'lucide-react'
import { useRequestEmailChange, useUpdateProfile } from '../../data/dashboard/account'
import { errorFieldOf } from '../../data/dashboard/errors'
import { readImageAsDataUrl } from '../../lib/read-file'
import type { Account } from '../../types/dashboard/account'
import { PersonAvatar } from '../ui/avatar-stack'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { SectionHeader } from '../ui/section-header'
import { TopBarContent } from '../navigation/top-bar-slot'

const FORM_ID = 'account-profile'

/** About you (`AccountProfile`): photo, name (saved from the top bar), and email. */
export function AboutYouSection({ account }: { account: Account }) {
  const person = account.person
  const saveName = useUpdateProfile()
  const [name, setName] = useState(person.name)
  const trimmed = name.trim()
  const changed = trimmed !== person.name
  const canSave = changed && trimmed !== ''

  function handleName(event: ChangeEvent<HTMLInputElement>) {
    saveName.reset()
    setName(event.target.value)
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    if (canSave) saveName.mutate({ name: trimmed })
  }

  // Only a problem with the name goes under it; a failed save (service down) goes below.
  const nameError =
    trimmed === ''
      ? 'Your name can’t be empty'
      : errorFieldOf(saveName.error) === 'name'
        ? saveName.error?.message
        : undefined
  const saveError = saveName.error && !nameError ? saveName.error.message : undefined

  return (
    <section className="flex flex-col gap-5">
      <TopBarContent>
        <Button
          type="submit"
          form={FORM_ID}
          size="sm"
          variant={changed ? 'default' : 'outline'}
          disabled={!canSave || saveName.isPending}
        >
          {changed ? 'Save changes' : 'Saved'}
        </Button>
      </TopBarContent>
      <SectionHeader title="About you" />
      <PhotoRow account={account} />
      <form id={FORM_ID} onSubmit={handleSubmit}>
        <FormField label="Full name" error={nameError}>
          <Input value={name} onChange={handleName} autoComplete="name" />
        </FormField>
      </form>
      {saveError && (
        <p role="alert" className="text-2xs text-status-error">
          {saveError}
        </p>
      )}
      <EmailField account={account} />
    </section>
  )
}

function PhotoRow({ account }: { account: Account }) {
  const person = account.person
  const savePhoto = useUpdateProfile()
  const fileRef = useRef<HTMLInputElement>(null)
  const hintId = useId()
  const [reading, setReading] = useState(false)
  // Why the picked file wasn't sent (too large, unreadable).
  const [pickError, setPickError] = useState<string | null>(null)

  function handleUpload() {
    fileRef.current?.click()
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    savePhoto.reset()
    setPickError(null)
    setReading(true)
    try {
      savePhoto.mutate({ image: await readImageAsDataUrl(file) })
    } catch (failure) {
      setPickError(failure instanceof Error ? failure.message : 'We couldn’t read that file')
    } finally {
      setReading(false)
    }
  }

  function handleRemove() {
    setPickError(null)
    savePhoto.mutate({ image: null })
  }

  const busy = reading || savePhoto.isPending
  const error = pickError ?? savePhoto.error?.message

  return (
    <div className="flex flex-wrap items-center gap-4">
      <PersonAvatar person={person} className="size-16 text-xl" />
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleUpload}
            disabled={busy}
            aria-describedby={hintId}
          >
            Upload photo
          </Button>
          {person.image && (
            <Button type="button" variant="ghost" size="sm" onClick={handleRemove} disabled={busy}>
              Remove photo
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            data-testid="photo-input"
            onChange={handleFile}
          />
        </div>
        <span id={hintId} className="text-2xs text-muted-foreground">
          PNG or JPG, at least 128 × 128 px. Shown when your GitHub or Google photo isn’t used.
        </span>
        {error && (
          <span role="alert" className="text-2xs text-status-error">
            {error}
          </span>
        )}
      </div>
    </div>
  )
}

function EmailField({ account }: { account: Account }) {
  const email = account.person.email
  const change = useRequestEmailChange()
  const [open, setOpen] = useState(false)
  const [next, setNext] = useState('')
  const inputId = useId()
  const statusId = useId()
  const hintId = useId()

  function handleOpen() {
    change.reset()
    setOpen(true)
  }

  function handleCancel() {
    setOpen(false)
    setNext('')
  }

  function handleNext(event: ChangeEvent<HTMLInputElement>) {
    change.reset()
    setNext(event.target.value)
  }

  function handleSend(event: SubmitEvent) {
    event.preventDefault()
    change.mutate(next, { onSuccess: handleCancel })
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">
        Email
      </label>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex min-w-[220px] flex-1">
          <Input
            id={inputId}
            value={email}
            readOnly
            aria-describedby={`${statusId} ${hintId}`}
            className="pr-24 text-muted-foreground"
          />
          <Badge
            id={statusId}
            variant="success"
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
          >
            <Check className="size-3" aria-hidden="true" />
            Verified
          </Badge>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={handleOpen}>
          Change email
        </Button>
      </div>
      <span id={hintId} className="text-2xs text-muted-foreground">
        Used to sign in with an email link and to receive invites. A change takes effect once you
        confirm it from the new address.
      </span>
      {open && (
        <form
          onSubmit={handleSend}
          className="flex flex-wrap items-end gap-2.5 rounded-xl border border-border p-3.5"
        >
          <div className="min-w-[220px] flex-1">
            <FormField label="New email" error={change.error?.message}>
              <Input
                type="email"
                placeholder="you@company.com"
                value={next}
                onChange={handleNext}
                autoFocus
              />
            </FormField>
          </div>
          <Button type="submit" size="sm" disabled={change.isPending || next.trim() === ''}>
            Send confirmation
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
        </form>
      )}
      {account.pendingEmail && (
        <p role="status" className="text-sm text-status-success">
          Confirmation sent. Your email stays {email} until you click the link.
        </p>
      )}
    </div>
  )
}
