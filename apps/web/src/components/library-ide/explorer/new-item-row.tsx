import { useRef, useState } from 'react'
import type { LibraryKind } from '../../../lib/library-api'
import { cn } from '../../../lib/utils'
import { LibraryKindTile } from '../../library/parts/library-kind-tile'

const NAME_MAX = 100

const PLACEHOLDER: Record<LibraryKind, string> = {
  module: 'Module name, e.g. Lead scoring',
  node: 'Node name, e.g. Post to Slack',
}

export interface NewItemRowProps {
  kind: LibraryKind
  /** Creates it; resolves to the reason it was refused, or null once it exists. */
  onSubmit: (name: string) => Promise<string | null>
  onCancel: () => void
}

/**
 * A new module or custom node, named where it will appear: under `/modules`
 * or `/nodes`. Enter creates it and opens it; Esc, or leaving an empty
 * field, drops the row. A refusal (a taken name) stays under the field.
 */
export function NewItemRow({ kind, onSubmit, onCancel }: NewItemRowProps) {
  const [value, setValue] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const name = value.trim()

  async function submit() {
    if (busy) return
    if (!name) {
      onCancel()
      return
    }
    setBusy(true)
    const reason = await onSubmit(name)
    // On success the row unmounts; on a refusal it stays for another try.
    if (reason !== null) {
      setBusy(false)
      setRefusal(reason)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    setValue(event.target.value)
    setRefusal(null)
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

  function handleBlur() {
    if (!busy && !name) onCancel()
  }

  return (
    <div className="py-0.5 pr-2" style={{ paddingLeft: '20px' }}>
      <div className="flex items-center gap-1.5">
        <LibraryKindTile kind={kind} className="size-4 rounded text-2xs leading-none" />
        <input
          ref={inputRef}
          autoFocus
          data-ide-text-input=""
          value={value}
          disabled={busy}
          maxLength={NAME_MAX}
          spellCheck={false}
          autoComplete="off"
          aria-label={kind === 'module' ? 'New module name' : 'New node name'}
          aria-invalid={refusal !== null}
          placeholder={PLACEHOLDER[kind]}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className={cn(
            'h-6 min-w-0 flex-1 rounded border bg-background px-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground',
            refusal ? 'border-status-error' : 'border-primary',
          )}
        />
      </div>
      <div role="status" aria-live="polite" className="empty:hidden">
        {refusal && (
          <p className="mt-1 rounded border border-status-error/30 bg-status-error/10 px-2 py-1 text-2xs leading-snug text-status-error">
            {refusal}
          </p>
        )}
      </div>
    </div>
  )
}
