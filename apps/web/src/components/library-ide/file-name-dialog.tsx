import { useId, useState, type SubmitEvent } from 'react'
import { Button } from '../ui/button'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { ModalDialog } from '../ui/modal-dialog'

interface FileNameDialogProps {
  title: string
  /** The folder the name is relative to, shown as the field's hint. */
  folder: string
  initial?: string
  submitLabel: string
  /** Why the typed name can't be used, or null. */
  validate: (name: string) => string | null
  /** Resolves to whether it worked; the dialog closes when it did. */
  onSubmit: (name: string) => Promise<boolean>
  onClose: () => void
}

/** A file's name inside an item folder: New file and Rename file. */
export function FileNameDialog({
  title,
  folder,
  initial = '',
  submitLabel,
  validate,
  onSubmit,
  onClose,
}: FileNameDialogProps) {
  const formId = useId()
  const [name, setName] = useState(initial)
  const [busy, setBusy] = useState(false)
  const trimmed = name.trim()
  const error = trimmed ? validate(trimmed) : null

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    if (busy || !trimmed || error) return
    setBusy(true)
    const done = await onSubmit(trimmed)
    setBusy(false)
    if (done) onClose()
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    setName(event.target.value)
  }

  function handleOpenChange(open: boolean) {
    if (!open && !busy) onClose()
  }

  return (
    <ModalDialog
      open
      onOpenChange={handleOpenChange}
      size="sm"
      title={title}
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy} disabled={!trimmed || !!error}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit}>
        <FormField label="Name" hint={`In ${folder}/`} error={error}>
          <Input value={name} onChange={handleChange} autoFocus placeholder="helpers.ts" />
        </FormField>
      </form>
    </ModalDialog>
  )
}
