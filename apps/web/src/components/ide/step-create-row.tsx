import { useRef, useState } from 'react'
import { cn } from '../../lib/utils'

export interface StepCreateRowProps {
  /** Where the step will go, e.g. "After Fetch user" or "Into try". */
  hint: string
  /** The create action; resolves to a refusal reason, or null once the step exists. */
  onSubmit: (name: string) => Promise<string | null>
  onCancel: () => void
}

/**
 * The Steps view's inline name row: a step is named here, then created and
 * opened. Enter creates, Esc cancels, and an empty name is refused in place —
 * the same shape as the Explorer's new-file row, without a path to resolve.
 */
export function StepCreateRow({ hint, onSubmit, onCancel }: StepCreateRowProps) {
  const [value, setValue] = useState('')
  const [announced, setAnnounced] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const empty = value.trim() === ''

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value
    setValue(next)
    if (next.trim() !== '') setAnnounced(null)
  }

  async function submit() {
    if (empty) {
      setAnnounced('Enter a step name.')
      return
    }
    if (busy) return
    setBusy(true)
    const reason = await onSubmit(value.trim())
    // On success the row unmounts; on a refusal it stays for another try.
    if (reason !== null) {
      setAnnounced(reason)
      setBusy(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // Keys typed here belong to the field, not to the tree around it.
    event.stopPropagation()
    if (event.key === 'Enter') {
      event.preventDefault()
      void submit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    }
  }

  return (
    <div className="border-b border-border px-3 py-2">
      <div className="px-1 pb-0.5 font-mono text-[10.5px] text-muted-foreground">{hint}</div>
      <input
        ref={inputRef}
        autoFocus
        data-ide-text-input=""
        value={value}
        disabled={busy}
        spellCheck={false}
        autoComplete="off"
        maxLength={256}
        aria-label="Step name"
        aria-invalid={announced !== null}
        placeholder="Step name"
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className={cn(
          'h-6 w-full rounded border bg-background px-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground',
          announced ? 'border-status-error' : 'border-primary',
        )}
      />
      <div role="status" aria-live="polite" className="empty:hidden">
        {announced && (
          <p className="mt-1 rounded border border-status-error/30 bg-status-error/10 px-2 py-1 text-[11.5px] leading-snug text-status-error">
            {announced}
          </p>
        )}
      </div>
    </div>
  )
}
