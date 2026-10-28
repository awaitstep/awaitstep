import { useId, useState, type SubmitEvent, type ReactNode } from 'react'
import { Button } from '../ui/button'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { ModalDialog } from '../ui/modal-dialog'

interface TextFieldDialogProps {
  title: string
  description: string
  leading: ReactNode
  label: string
  hint?: string
  initial?: string
  submitLabel: string
  /** Shown on the field: the save's error. */
  error?: string
  pending: boolean
  monospace?: boolean
  /** `password` for secrets, e.g. an API token. */
  type?: 'text' | 'password'
  onSubmit: (value: string) => void
  onClose: () => void
}

/** A dialog with one text field: Rename, Replace token. */
export function TextFieldDialog({
  title,
  description,
  leading,
  label,
  hint,
  initial = '',
  submitLabel,
  error,
  pending,
  monospace = false,
  type = 'text',
  onSubmit,
  onClose,
}: TextFieldDialogProps) {
  const formId = useId()
  const [value, setValue] = useState(initial)
  const inputClass = monospace ? 'font-mono' : undefined

  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    onSubmit(value)
  }

  return (
    <ModalDialog
      open
      onOpenChange={handleOpenChange}
      size="sm"
      leading={leading}
      title={title}
      description={description}
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit}>
        <FormField label={label} hint={hint} error={error}>
          <Input
            type={type}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={inputClass}
            autoFocus
          />
        </FormField>
      </form>
    </ModalDialog>
  )
}
