import { useId, type ReactElement, type ReactNode } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { hasContent } from './has-content'
import { Label } from './label'

/** Joins the ids that describe a control, or `undefined` when there are none. */
export function joinIds(...ids: (string | false | undefined)[]): string | undefined {
  const joined = ids.filter(Boolean).join(' ')
  return joined || undefined
}

interface FormFieldProps {
  label: ReactNode
  /** Shown under the control and read out as its description. */
  hint?: ReactNode
  /** Shown under the hint in red; marks the control invalid. */
  error?: ReactNode
  /** Adds a muted "Optional" after the label. */
  optional?: boolean
  required?: boolean
  /** The control's id; generated when left out. */
  id?: string
  /** One control: `Input`, `InputGroup`, `Textarea` or `Select`. */
  children: ReactElement
}

/**
 * A label above one control, with an optional hint and error under it. The
 * control gets the id, description and validity attributes, so it needs no
 * wiring of its own.
 */
export function FormField({
  label,
  hint,
  error,
  optional,
  required,
  id,
  children,
}: FormFieldProps) {
  const generatedId = useId()
  const controlId = id ?? generatedId
  const hintId = `${controlId}-hint`
  const errorId = `${controlId}-error`
  const hasHint = hasContent(hint)
  const hasError = hasContent(error)

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={controlId} className="text-xs text-foreground/80">
        {label}
        {optional && <span className="ml-1.5 font-normal text-muted-foreground">Optional</span>}
      </Label>
      <Slot
        id={controlId}
        aria-describedby={joinIds(hasHint && hintId, hasError && errorId)}
        aria-invalid={hasError || undefined}
        aria-required={required || undefined}
      >
        {children}
      </Slot>
      {hasHint && (
        <p id={hintId} className="text-2xs text-muted-foreground">
          {hint}
        </p>
      )}
      {hasError && (
        <p id={errorId} className="text-2xs text-status-error">
          {error}
        </p>
      )}
    </div>
  )
}

interface FieldGroupProps {
  legend: ReactNode
  hint?: ReactNode
  children: ReactNode
}

/** A titled group of related controls: swatches, radio cards, checkboxes. */
export function FieldGroup({ legend, hint, children }: FieldGroupProps) {
  const hintId = useId()
  const hasHint = hasContent(hint)
  return (
    <fieldset
      aria-describedby={hasHint ? hintId : undefined}
      className="m-0 flex min-w-0 flex-col gap-2.5 border-0 p-0"
    >
      <legend className="mb-2.5 p-0 text-xs font-medium text-foreground/80">{legend}</legend>
      {hasHint && (
        <p id={hintId} className="-mt-2.5 text-2xs text-muted-foreground">
          {hint}
        </p>
      )}
      {children}
    </fieldset>
  )
}
