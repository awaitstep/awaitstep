import type { ClipboardEvent, KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { Badge } from './badge'

interface ChipInputProps {
  /** The values entered so far, each a chip with its own remove button. */
  values: string[]
  /** What's typed but not yet a chip. */
  draft: string
  onDraftChange: (draft: string) => void
  /** Turn text (typed or pasted) into chips. */
  onCommit: (text: string) => void
  onRemove: (value: string) => void
  placeholder?: string
  /** Ids and `aria-*` from `FormField`, passed on to the text input. */
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  'aria-required'?: boolean
}

/**
 * A text field that turns entries into chips: Enter or a comma commits,
 * pasting a list commits each, Backspace on an empty field drops the last.
 * Wrap it in `FormField`; the label and messages land on the input.
 */
export function ChipInput({
  values,
  draft,
  onDraftChange,
  onCommit,
  onRemove,
  placeholder,
  ...controlProps
}: ChipInputProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      onCommit(draft)
    } else if (event.key === 'Backspace' && draft === '' && values.length > 0) {
      onRemove(values[values.length - 1]!)
    }
  }

  // A pasted list commits with what's already typed; a plain fragment just
  // pastes into the field ("sam@" + "acme.test").
  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData('text')
    if (!/[\s,;]/.test(text.trim())) return
    event.preventDefault()
    onCommit(`${draft}${text}`)
  }

  function handleBlur() {
    onCommit(draft)
  }

  return (
    <span className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-input px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring">
      {values.map((value) => (
        <Badge key={value} className="gap-1 py-1 pr-1 font-normal">
          {value}
          <button
            type="button"
            aria-label={`Remove ${value}`}
            onClick={() => onRemove(value)}
            className="rounded-full p-0.5 hover:bg-foreground/10"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </Badge>
      ))}
      <input
        {...controlProps}
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="min-w-[160px] flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
    </span>
  )
}
