import { useRef, useState } from 'react'
import { dirname } from '../../lib/ide/file-tree'
import { newFileError, resolveNewPath } from '../../lib/ide/project'
import { cn } from '../../lib/utils'

/** How long typing must pause before the refusal is shown and announced. */
const ANNOUNCE_DELAY_MS = 400

export interface CreateRowProps {
  mode: 'file' | 'folder'
  /** The folder the row opened in; a typed `/` path overrides it. */
  target: string
  initial?: string
  existing: readonly string[]
  /** Set when nothing can be created (the file limit); shown as the refusal. */
  blockedReason?: string | null
  depth: number
  /** Resolves to whether the file was created; the row stays open when it was not. */
  onSubmit: (path: string) => Promise<boolean>
  onCancel: () => void
}

function crumbLabel(folder: string): string {
  return folder ? `In ${folder}/` : 'In the project root'
}

export function CreateRow({
  mode,
  target,
  initial = '',
  existing,
  blockedReason = null,
  depth,
  onSubmit,
  onCancel,
}: CreateRowProps) {
  const [value, setValue] = useState(initial)
  const [announced, setAnnounced] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)

  const resolved = resolveNewPath(target, value, mode === 'folder')
  const empty = value.trim() === ''
  const error = blockedReason ?? (empty ? null : newFileError(resolved, existing))
  const invalid = empty || error !== null
  const folder = resolved ? dirname(resolved) : target

  function announceLater(next: string | null) {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setAnnounced(next), ANNOUNCE_DELAY_MS)
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value
    setValue(next)
    const nextPath = resolveNewPath(target, next, mode === 'folder')
    const nextError = blockedReason ?? (next.trim() ? newFileError(nextPath, existing) : null)
    if (nextError === null) {
      clearTimeout(timer.current)
      setAnnounced(null)
    } else announceLater(nextError)
  }

  async function submit() {
    if (invalid) {
      clearTimeout(timer.current)
      setAnnounced(error)
      return
    }
    if (busy) return
    setBusy(true)
    const created = await onSubmit(resolved)
    // On success the row unmounts; on a refusal it stays for another try.
    if (!created) {
      setBusy(false)
      // The field was disabled while the write ran, which dropped its focus.
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
      clearTimeout(timer.current)
      onCancel()
    }
  }

  // Leaving the field drops a row with nothing worth keeping: empty, untouched,
  // or a name that is refused anyway. A valid name stays so it is not lost.
  function handleBlur() {
    if (!busy && (empty || value === initial || error !== null)) {
      clearTimeout(timer.current)
      onCancel()
    }
  }

  return (
    <div className="py-1 pr-2" style={{ paddingLeft: `${8 + depth * 12}px` }}>
      <div className="px-1 pb-0.5 font-mono text-2xs text-muted-foreground">
        {crumbLabel(folder)}
      </div>
      <input
        ref={inputRef}
        autoFocus
        data-ide-text-input=""
        value={value}
        disabled={busy}
        spellCheck={false}
        autoComplete="off"
        aria-label={
          mode === 'folder' ? 'Path of the first file in the new folder' : 'New file path'
        }
        aria-invalid={error !== null}
        placeholder={mode === 'folder' ? 'folder/first-file.ts' : 'name.ts or folder/name.ts'}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className={cn(
          'h-6 w-full rounded border bg-background px-1.5 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground',
          error ? 'border-status-error' : 'border-primary',
        )}
      />
      <div role="status" aria-live="polite" className="empty:hidden">
        {announced && (
          <p className="mt-1 rounded border border-status-error/30 bg-status-error/10 px-2 py-1 text-2xs leading-snug text-status-error">
            {announced}
          </p>
        )}
      </div>
    </div>
  )
}
