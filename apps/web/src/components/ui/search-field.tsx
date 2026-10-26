import { useId, type ChangeEvent } from 'react'
import { Search } from 'lucide-react'

interface SearchFieldProps {
  /** Read by screen readers; the placeholder is not a label. */
  label: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  /**
   * A keyboard hint shown at the right, e.g. "⌘K", with its `aria-keyshortcuts`
   * value, e.g. "Meta+K". Display only: whoever owns the shortcut binds it.
   */
  shortcut?: { hint: string; keys: string }
}

/** Search box with a leading magnifier and an optional shortcut hint. */
export function SearchField({ label, placeholder, value, onChange, shortcut }: SearchFieldProps) {
  const id = useId()

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value)
  }

  return (
    <div className="flex h-9 min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
      <Search className="size-3.5 shrink-0" aria-hidden="true" />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        aria-keyshortcuts={shortcut?.keys}
        className="h-full min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
      />
      {shortcut && (
        <kbd
          aria-hidden="true"
          className="shrink-0 rounded border border-border px-1.5 text-2xs font-sans"
        >
          {shortcut.hint}
        </kbd>
      )}
    </div>
  )
}
