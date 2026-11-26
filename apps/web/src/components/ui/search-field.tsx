import { useId, type ChangeEvent, type KeyboardEvent, type Ref } from 'react'
import { Search } from 'lucide-react'
import { PAGE_SEARCH_ATTRIBUTE } from '../../lib/shortcuts/page-search'
import { Kbd } from './kbd'

interface SearchFieldProps {
  /** Read by screen readers; the placeholder is not a label. */
  label: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  /**
   * The page's own search, which `/` focuses (see `focusPageSearch`): it
   * shows the key at the right.
   */
  pageSearch?: boolean
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
  pageSearch,
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
    <div className="flex h-9 w-full sm:h-10 min-w-[min(200px,100%)] sm:max-w-full lg:max-w-[320px] items-center gap-2 rounded-[9px] border border-input bg-card px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring max-sm:max-w-none">
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
        aria-keyshortcuts={pageSearch ? '/' : undefined}
        {...(pageSearch && { [PAGE_SEARCH_ATTRIBUTE]: '' })}
        className="h-full min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
      />
      {pageSearch && <Kbd aria-hidden="true">/</Kbd>}
    </div>
  )
}
