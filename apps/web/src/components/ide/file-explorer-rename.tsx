import { useRef, useState } from 'react'
import { basename } from '../../lib/ide/file-tree'
import { newFileError, normalizeNewPath } from '../../lib/ide/project'
import { cn } from '../../lib/utils'
import { FileIcon } from './file-icon'
import type { GeneratedFile } from '@awaitstep/codegen'

/** How long typing must pause before the refusal is shown and announced. */
const ANNOUNCE_DELAY_MS = 400

export interface RenameRowProps {
  path: string
  role: GeneratedFile['role']
  /** Every project path, the file's own included. */
  existing: readonly string[]
  depth: number
  /** Resolves to whether it was renamed; the row stays open when it was not. */
  onSubmit: (to: string) => Promise<boolean>
  onCancel: () => void
}

/**
 * The file's path, edited where its row is. It dismisses like the new-file
 * row: Esc, or leaving the field while the name is unchanged, empty or refused.
 */
export function RenameRow({ path, role, existing, depth, onSubmit, onCancel }: RenameRowProps) {
  const [value, setValue] = useState(path)
  const [announced, setAnnounced] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)

  const others = existing.filter((p) => p !== path)
  const empty = value.trim() === ''
  const unchanged = !empty && normalizeNewPath(value) === path
  const error = empty || unchanged ? null : newFileError(value, others)

  function announceLater(next: string | null) {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setAnnounced(next), ANNOUNCE_DELAY_MS)
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value
    setValue(next)
    const nextError =
      next.trim() && normalizeNewPath(next) !== path ? newFileError(next, others) : null
    if (nextError === null) {
      clearTimeout(timer.current)
      setAnnounced(null)
    } else announceLater(nextError)
  }

  // The name without its folder or extension is what people retype.
  function handleFocus(event: React.FocusEvent<HTMLInputElement>) {
    const name = basename(path)
    const start = path.length - name.length
    const dot = name.lastIndexOf('.')
    event.currentTarget.setSelectionRange(start, dot > 0 ? start + dot : path.length)
  }

  async function submit() {
    if (empty || unchanged) {
      clearTimeout(timer.current)
      onCancel()
      return
    }
    if (error !== null) {
      clearTimeout(timer.current)
      setAnnounced(error)
      return
    }
    if (busy) return
    setBusy(true)
    const renamed = await onSubmit(normalizeNewPath(value))
    // On success the row unmounts; on a refusal it stays for another try.
    if (!renamed) {
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
      clearTimeout(timer.current)
      onCancel()
    }
  }

  function handleBlur() {
    if (!busy && (empty || unchanged || error !== null)) {
      clearTimeout(timer.current)
      onCancel()
    }
  }

  return (
    <div className="py-0.5 pr-2" style={{ paddingLeft: `${8 + depth * 12}px` }}>
      <div className="flex items-center gap-1">
        <FileIcon role={role} />
        <input
          ref={inputRef}
          autoFocus
          data-ide-text-input=""
          value={value}
          disabled={busy}
          spellCheck={false}
          autoComplete="off"
          aria-label={`New path for ${basename(path)}`}
          aria-invalid={error !== null}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className={cn(
            'h-6 min-w-0 flex-1 rounded border bg-background px-1.5 font-mono text-xs text-foreground outline-none',
            error ? 'border-status-error' : 'border-primary',
          )}
        />
      </div>
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
