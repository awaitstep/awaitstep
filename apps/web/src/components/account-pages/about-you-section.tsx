import { useId, useRef, useState, type ChangeEvent, type SubmitEvent } from 'react'
import { Check } from 'lucide-react'
import { stripUnsafeText } from '@awaitstep/ir'
import { useUpdateProfile } from '../../data/dashboard/account'
import { errorFieldOf } from '../../data/dashboard/errors'
import { readPhotoAsDataUrl } from '../../lib/read-file'
import type { Account } from '../../types/dashboard/account'
import { PersonAvatar } from '../ui/avatar-stack'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { SettingsCard } from '../ui/form-card'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { SectionHeader } from '../ui/section-header'
import { TopBarContent } from '../navigation/top-bar-slot'
import { ClearableMark } from '../ui/clearable-mark'

const FORM_ID = 'account-profile'

/** About you (`AccountProfile`): photo, name (saved from the top bar), and email. */
export function AboutYouSection({ account }: { account: Account }) {
  const person = account.person
  const saveName = useUpdateProfile()
  const [name, setName] = useState(person.name)
  // As the server keeps it (no controls or direction overrides), so a saved name reads Saved.
  const trimmed = stripUnsafeText(name).trim()
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
    <section className="settings-width flex flex-col gap-3">
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
      <SettingsCard>
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
      </SettingsCard>
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
      savePhoto.mutate({ image: await readPhotoAsDataUrl(file) })
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
      <ClearableMark
        hasImage={Boolean(person.image)}
        onClear={handleRemove}
        clearLabel="Remove photo"
        disabled={busy}
      >
        <PersonAvatar person={person} className="size-16 text-xl" />
      </ClearableMark>
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
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            data-testid="photo-input"
            onChange={handleFile}
          />
        </div>
        <span id={hintId} className="text-2xs text-muted-foreground">
          PNG, JPG, WebP or GIF up to 2 MB, at least 128 × 128 px. Shown when your GitHub or Google
          photo isn’t used.
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

/** The address is the account (B10): it signs in with an email link and receives invites, and never changes. */
function EmailField({ account }: { account: Account }) {
  const email = account.person.email
  const inputId = useId()
  const statusId = useId()
  const hintId = useId()

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">
        Email
      </label>
      <div className="relative flex min-w-[220px]">
        <Input
          id={inputId}
          value={email}
          readOnly
          aria-describedby={account.emailVerified ? `${statusId} ${hintId}` : hintId}
          className="pr-24 text-muted-foreground"
        />
        {account.emailVerified && (
          <Badge
            id={statusId}
            variant="success"
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
          >
            <Check className="size-3" aria-hidden="true" />
            Verified
          </Badge>
        )}
      </div>
      <span id={hintId} className="text-2xs text-muted-foreground">
        Used to sign in with an email link and to receive invites. Google and GitHub connect to this
        address only.
      </span>
    </div>
  )
}
