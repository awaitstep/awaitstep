import { useId, type ChangeEvent, type KeyboardEvent, type Ref } from 'react'
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
  /** The input, for whoever binds the shortcut to focus it. */
  ref?: Ref<HTMLInputElement>
}

/**
 * Search box with a leading magnifier and an optional shortcut hint, the one
 * size every page uses (board `LayoutRules`, "The search field"): 36 px high,
 * as wide as its row allows up to 320 px, shrinking to 240 px before the row
 * wraps, full width on a phone. It sets its own width, so callers place it
 * without a wrapper, first in the toolbar row.
 */
export function SearchField({
  label,
  placeholder,
  value,
  onChange,
  shortcut,
  ref,
}: SearchFieldProps) {
  const id = useId()

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value)
  }

  // Escape empties the field, the same in every browser.
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && value) {
      event.preventDefault()
      onChange('')
    }
  }

  return (
    <div className="flex h-9 w-full min-w-[min(200px,100%)] sm:max-w-full lg:max-w-[320px] items-center gap-2 rounded-[9px] border border-border bg-card px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring max-sm:max-w-none">
      <Search className="size-3.5 shrink-0" aria-hidden="true" />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        type="search"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
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
