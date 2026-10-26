import { useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Check, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import {
  filterOptions,
  isCovered,
  scopeOptions,
  togglePick,
  type PickerProject,
  type ScopeOption,
} from './scope-picks'

interface ScopeMultiPickerProps {
  /** Names the input and its list, e.g. "Where they can work". */
  label: string
  projects: PickerProject[]
  /** Picked option ids (`p:<id>`, `ws:<projectId>:<id>`). */
  value: string[]
  onChange: (next: string[]) => void
  /** "Search projects and workspaces". */
  placeholder: string
  /** Replaces the placeholder once something is picked: "Add a project or workspace". */
  addPlaceholder?: string
  emptyText?: (query: string) => string
  /** Starts with the list open, as the boards draw it. */
  defaultOpen?: boolean
}

function defaultEmptyText(query: string): string {
  return `Nothing matches “${query}”`
}

/**
 * Picks several projects and workspaces: chips for the picks, and a search box
 * whose list stays open while picking. Picking a project covers its
 * workspaces. A multi-select listbox: options carry `aria-selected` for picked,
 * and the highlighted row is the input's `aria-activedescendant`.
 */
export function ScopeMultiPicker({
  label,
  projects,
  value,
  onChange,
  placeholder,
  addPlaceholder = placeholder,
  emptyText = defaultEmptyText,
  defaultOpen = false,
}: ScopeMultiPickerProps) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(defaultOpen)
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)

  const options = scopeOptions(projects)
  const shown = filterOptions(options, query)
  const active = shown.find((option) => option.id === activeId) ?? shown[0]
  const picked = options.filter((option) => value.includes(option.id))

  function optionDomId(option: ScopeOption): string {
    return `${listId}-${option.id.replace(/[^\w-]/g, '-')}`
  }

  function toggle(option: ScopeOption) {
    setActiveId(option.id)
    if (isCovered(option, value)) return
    onChange(togglePick(value, option))
  }

  function moveActive(step: 1 | -1) {
    if (shown.length === 0) return
    const index = active ? shown.indexOf(active) : -1
    const next = shown[(index + step + shown.length) % shown.length]
    setActiveId(next?.id ?? null)
  }

  function remove(option: ScopeOption) {
    onChange(value.filter((id) => id !== option.id))
    inputRef.current?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) setOpen(true)
      else moveActive(event.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (event.key === 'Enter' && open && active) {
      event.preventDefault()
      toggle(active)
      return
    }
    if (event.key === 'Backspace' && query === '' && picked.length > 0) {
      onChange(value.filter((id) => id !== picked[picked.length - 1]!.id))
    }
  }

  function handleQueryChange(next: string) {
    setQuery(next)
    setActiveId(null)
    setOpen(true)
  }

  function handleBoxClick() {
    inputRef.current?.focus()
    setOpen(true)
  }

  function handleFocus() {
    setOpen(true)
  }

  function handleBlur() {
    setOpen(false)
  }

  // Clicks on the chip box belong to the picker, not "outside" it.
  function handleInteractOutside(event: Event) {
    if (anchorRef.current?.contains(event.target as Node)) event.preventDefault()
  }

  // Focus stays in the input while the list is open, so typing keeps working.
  function keepFocus(event: Event) {
    event.preventDefault()
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div
          ref={anchorRef}
          onClick={handleBoxClick}
          className={cn(
            'flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 transition-colors',
            open ? 'border-primary ring-2 ring-primary/20' : 'border-input',
          )}
        >
          {picked.map((option) => (
            <PickChip key={option.id} option={option} onRemove={remove} />
          ))}
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={open && active ? optionDomId(active) : undefined}
            autoComplete="off"
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={picked.length > 0 ? addPlaceholder : placeholder}
            className="h-7 min-w-[140px] flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={16}
          onOpenAutoFocus={keepFocus}
          onCloseAutoFocus={keepFocus}
          onInteractOutside={handleInteractOutside}
          className="z-50 w-[var(--radix-popover-trigger-width)] rounded-xl border border-border bg-card p-1.5 shadow-lg"
        >
          {shown.length === 0 ? (
            <p className="px-2.5 py-2.5 text-xs text-muted-foreground">{emptyText(query.trim())}</p>
          ) : (
            <ul
              id={listId}
              role="listbox"
              aria-label={label}
              aria-multiselectable="true"
              className="max-h-[min(260px,var(--radix-popover-content-available-height))] overflow-y-auto"
            >
              {shown.map((option) => (
                <PickerOption
                  key={option.id}
                  domId={optionDomId(option)}
                  option={option}
                  picked={value.includes(option.id)}
                  covered={isCovered(option, value)}
                  active={option === active}
                  onToggle={toggle}
                />
              ))}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

interface PickChipProps {
  option: ScopeOption
  onRemove: (option: ScopeOption) => void
}

function PickChip({ option, onRemove }: PickChipProps) {
  function handleClick(event: MouseEvent) {
    event.stopPropagation()
    onRemove(option)
  }

  return (
    <span className="flex items-center gap-1 rounded-full bg-muted py-0.5 pl-2.5 pr-1 text-xs text-foreground">
      {option.chip}
      <button
        type="button"
        aria-label={`Remove ${option.chip}`}
        onClick={handleClick}
        className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </span>
  )
}

interface PickerOptionProps {
  domId: string
  option: ScopeOption
  picked: boolean
  covered: boolean
  active: boolean
  onToggle: (option: ScopeOption) => void
}

function PickerOption({ domId, option, picked, covered, active, onToggle }: PickerOptionProps) {
  const ticked = picked || covered

  // The input keeps focus; a click must not move it to the list.
  function handleMouseDown(event: MouseEvent) {
    event.preventDefault()
  }

  function handleClick() {
    onToggle(option)
  }

  return (
    <li
      id={domId}
      role="option"
      aria-selected={ticked}
      aria-disabled={covered || undefined}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      className={cn(
        'flex h-9 items-center gap-2.5 rounded-lg pr-2.5 text-xs',
        option.kind === 'project' ? 'pl-2.5 font-semibold' : 'pl-[34px]',
        covered ? 'cursor-default text-muted-foreground' : 'cursor-pointer text-foreground',
        active && 'bg-accent',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border',
          picked && 'border-primary bg-primary text-primary-foreground',
          covered && 'border-primary/50 bg-primary/50 text-primary-foreground',
          !ticked && 'border-muted-foreground/60',
        )}
      >
        {ticked && <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1 truncate">{option.label}</span>
      <span className="shrink-0 text-2xs font-normal text-muted-foreground">
        {covered ? 'Covered by the project' : option.meta}
      </span>
    </li>
  )
}
