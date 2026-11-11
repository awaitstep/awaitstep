import type { Ref } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useIdeSearchStore } from '../../stores/ide-search-store'
import { cn } from '../../lib/utils'

interface SearchBoxProps {
  inputRef: Ref<HTMLInputElement>
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
  invalid: boolean
}

type Toggle = 'caseSensitive' | 'wholeWord' | 'regex'

const TOGGLES: { option: Toggle; glyph: string; label: string }[] = [
  { option: 'caseSensitive', glyph: 'Aa', label: 'Match case' },
  { option: 'wholeWord', glyph: 'ab', label: 'Whole word' },
  { option: 'regex', glyph: '.*', label: 'Regular expression' },
]

/** The query field with its three switches, and the generated-files option below. */
export function SearchBox({ inputRef, onKeyDown, invalid }: SearchBoxProps) {
  const { query, caseSensitive, wholeWord, regex, includeGenerated, setQuery, toggle } =
    useIdeSearchStore(
      useShallow((s) => ({
        query: s.query,
        caseSensitive: s.caseSensitive,
        wholeWord: s.wholeWord,
        regex: s.regex,
        includeGenerated: s.includeGenerated,
        setQuery: s.setQuery,
        toggle: s.toggle,
      })),
    )
  const pressed = { caseSensitive, wholeWord, regex }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value)
  }

  function handleIncludeGenerated() {
    toggle('includeGenerated')
  }

  return (
    <div className="shrink-0 space-y-1.5 border-b border-border p-2">
      <div
        className={cn(
          'flex h-7 items-center rounded border bg-background pr-1 focus-within:border-primary/60',
          invalid ? 'border-destructive/70' : 'border-border',
        )}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          placeholder="Search"
          aria-label="Search project files"
          aria-invalid={invalid}
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground"
        />
        {TOGGLES.map((t) => (
          <ToggleButton key={t.option} {...t} on={pressed[t.option]} />
        ))}
      </div>
      <label className="flex cursor-pointer items-center gap-1.5 text-2xs text-muted-foreground">
        <input
          type="checkbox"
          checked={includeGenerated}
          onChange={handleIncludeGenerated}
          className="h-3 w-3 accent-primary"
        />
        Include generated files
      </label>
    </div>
  )
}

function ToggleButton({
  option,
  glyph,
  label,
  on,
}: {
  option: Toggle
  glyph: string
  label: string
  on: boolean
}) {
  const toggle = useIdeSearchStore((s) => s.toggle)

  function handleClick() {
    toggle(option)
  }

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={handleClick}
      className={cn(
        'flex h-5 min-w-5 items-center justify-center rounded px-1 font-mono text-2xs transition-colors',
        on
          ? 'bg-primary/20 text-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      {glyph}
    </button>
  )
}
