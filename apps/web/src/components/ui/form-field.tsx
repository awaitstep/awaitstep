import { useId, type ReactElement, type ReactNode } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { hasContent } from './has-content'
import { Label } from './label'

/** Joins the ids that describe a control, or `undefined` when there are none. */
export function joinIds(...ids: (string | false | undefined)[]): string | undefined {
  const joined = ids.filter(Boolean).join(' ')
  return joined || undefined
}

type MessageTone = 'hint' | 'error' | 'success'

const MESSAGE_TONE_CLASS: Record<MessageTone, string> = {
  hint: 'text-muted-foreground',
  error: 'text-status-error',
  success: 'text-status-success',
}

function fieldMessage(
  hint: ReactNode,
  error: ReactNode,
  success: ReactNode,
): { tone: MessageTone; text: ReactNode } | undefined {
  if (hasContent(error)) return { tone: 'error', text: error }
  if (hasContent(success)) return { tone: 'success', text: success }
  if (hasContent(hint)) return { tone: 'hint', text: hint }
  return undefined
}

interface FormFieldProps {
  label: ReactNode
  /** Shown under the control and read out as its description. */
  hint?: ReactNode
  /** Takes the hint's place in red and marks the control invalid. */
  error?: ReactNode
  /** Takes the hint's place in green, e.g. "project-101 is free". Ignored while there is an error. */
  success?: ReactNode
  /** Adds a muted "Optional" after the label. */
  optional?: boolean
  required?: boolean
  /** The control's id; generated when left out. */
  id?: string
  /** One control: `Input`, `InputGroup`, `Textarea` or `Select`. */
  children: ReactElement
}

/**
 * A label above one control, with one line under it: the error, else the
 * success message, else the hint. The control gets the id, description and
 * validity attributes, so it needs no wiring of its own.
 */
export function FormField({
  label,
  hint,
  error,
  success,
  optional,
  required,
  id,
  children,
}: FormFieldProps) {
  const generatedId = useId()
  const controlId = id ?? generatedId
  const messageId = `${controlId}-message`
  const hasError = hasContent(error)
  const message = fieldMessage(hint, error, success)

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={controlId} className="text-xs text-foreground/80">
        {label}
        {optional && <span className="ml-1.5 font-normal text-muted-foreground">Optional</span>}
      </Label>
      <Slot
        id={controlId}
        aria-describedby={message ? messageId : undefined}
        aria-invalid={hasError || undefined}
        aria-required={required || undefined}
      >
        {children}
      </Slot>
      {message && (
        <p id={messageId} className={`text-2xs ${MESSAGE_TONE_CLASS[message.tone]}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}

interface FieldGroupProps {
  legend: ReactNode
  hint?: ReactNode
  /** Takes the hint's place in red and marks the group invalid. */
  error?: ReactNode
  children: ReactNode
}

/** A titled group of related controls: swatches, radio cards, checkboxes. */
export function FieldGroup({ legend, hint, error, children }: FieldGroupProps) {
  const messageId = useId()
  const message = fieldMessage(hint, error, undefined)
  return (
    <fieldset
      aria-describedby={message ? messageId : undefined}
      aria-invalid={hasContent(error) || undefined}
      className="m-0 flex min-w-0 flex-col gap-2.5 border-0 p-0"
    >
      <legend className="mb-2.5 p-0 text-xs font-medium text-foreground/80">{legend}</legend>
      {message && (
        <p id={messageId} className={`-mt-2.5 text-2xs ${MESSAGE_TONE_CLASS[message.tone]}`}>
          {message.text}
        </p>
      )}
      {children}
    </fieldset>
  )
}
