import { useState, type ReactElement } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Command } from 'cmdk'
import { Check, Search, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { scopeTileColourClass } from '../ui/workspace-colour'
import type { ScopeTile } from './context-panel'

export interface ScopeItem {
  id: string
  name: string
  /** One line under the name, e.g. "3 workspaces · opens in Sales". */
  detail?: string
  tile: ScopeTile
}

export interface ScopeGroup {
  label: string
  items: ScopeItem[]
}

export interface ScopeAction {
  id: string
  label: string
  icon: LucideIcon
  /** `primary` is the green "New …" action. */
  tone?: 'primary'
}

interface ScopeSwitcherProps {
  /** The button that opens it; must forward its ref and props (PanelScopeButton does). */
  trigger: ReactElement
  /** Names the popover and its list, e.g. "Switch project". */
  label: string
  /** Shows the search row. Without it, typing still narrows the list. */
  searchPlaceholder?: string
  groups: ScopeGroup[]
  currentId?: string
  /** Labels the tick on the current row, e.g. "Current project". */
  currentLabel: string
  onSelect: (id: string) => void
  actions?: ScopeAction[]
  onAction?: (id: string) => void
  side?: 'bottom' | 'right'
  align?: 'start' | 'center' | 'end'
  emptyText?: (query: string) => string
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

function defaultEmptyText(query: string): string {
  return `Nothing matches “${query}”`
}

// cmdk scores fuzzy matches; a switcher should only show names that contain
// what was typed, so "pt" doesn't surface "Project 101".
function filterByName(_value: string, search: string, keywords?: string[]): number {
  const name = keywords?.[0] ?? ''
  return name.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0
}

/**
 * Popover that switches the org, project or workspace: optional search, grouped
 * rows with the current one ticked, and footer actions. Rows are listbox
 * options (arrow keys + Enter), so they report back by id instead of linking.
 */
export function ScopeSwitcher({
  trigger,
  open,
  defaultOpen = false,
  onOpenChange,
  side = 'bottom',
  align = 'start',
  ...listProps
}: ScopeSwitcherProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const isOpen = open ?? uncontrolledOpen

  function setOpen(next: boolean) {
    setUncontrolledOpen(next)
    onOpenChange?.(next)
  }

  function handleClose() {
    setOpen(false)
  }

  return (
    <Popover.Root open={isOpen} onOpenChange={setOpen} modal>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={16}
          aria-label={listProps.label}
          className="z-50 flex max-h-[min(480px,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg"
        >
          <SwitcherList {...listProps} onDone={handleClose} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

type SwitcherListProps = Omit<
  ScopeSwitcherProps,
  'trigger' | 'open' | 'defaultOpen' | 'onOpenChange' | 'side' | 'align'
> & { onDone: () => void }

// Mounted only while open, so the query starts empty every time.
function SwitcherList({
  label,
  searchPlaceholder,
  groups,
  currentId,
  currentLabel,
  onSelect,
  actions = [],
  onAction,
  emptyText = defaultEmptyText,
  onDone,
}: SwitcherListProps) {
  const [query, setQuery] = useState('')

  function choose(id: string) {
    onDone()
    onSelect(id)
  }

  function runAction(id: string) {
    onDone()
    onAction?.(id)
  }

  return (
    <Command
      label={label}
      filter={filterByName}
      defaultValue={currentId}
      loop
      className="flex min-h-0 flex-1 flex-col"
    >
      <div
        className={cn(
          'flex h-11 shrink-0 items-center gap-2 border-b border-border px-3.5 text-muted-foreground',
          !searchPlaceholder && 'sr-only',
        )}
      >
        <Search className="size-3.5 shrink-0" aria-hidden="true" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder={searchPlaceholder}
          className="h-full min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
      <Command.List className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
        <Command.Empty className="px-2 py-6 text-center text-xs text-muted-foreground">
          {emptyText(query.trim())}
        </Command.Empty>
        {groups.map((group) => (
          <Command.Group
            key={group.label}
            heading={group.label}
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
          >
            {group.items.map((item) => (
              <SwitcherRow
                key={item.id}
                item={item}
                current={item.id === currentId}
                currentLabel={currentLabel}
                onChoose={choose}
              />
            ))}
          </Command.Group>
        ))}
      </Command.List>
      {actions.length > 0 && (
        <div className="flex shrink-0 flex-col border-t border-border p-1.5">
          {actions.map((action) => (
            <SwitcherAction key={action.id} action={action} onRun={runAction} />
          ))}
        </div>
      )}
    </Command>
  )
}

interface SwitcherRowProps {
  item: ScopeItem
  current: boolean
  currentLabel: string
  onChoose: (id: string) => void
}

function SwitcherRow({ item, current, currentLabel, onChoose }: SwitcherRowProps) {
  function handleSelect() {
    onChoose(item.id)
  }

  return (
    <Command.Item
      value={item.id}
      keywords={[item.name]}
      onSelect={handleSelect}
      aria-current={current ? 'true' : undefined}
      className="flex cursor-pointer items-center gap-3 rounded-lg p-2 data-[selected=true]:bg-accent"
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-[30px] shrink-0 items-center justify-center rounded-lg text-2xs font-semibold',
          scopeTileColourClass(item.tile.colour),
        )}
      >
        {item.tile.initial}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-medium text-foreground">{item.name}</span>
        {item.detail && (
          <span className="truncate text-2xs text-muted-foreground">{item.detail}</span>
        )}
      </span>
      {current && (
        <Check className="size-4 shrink-0 text-primary" role="img" aria-label={currentLabel} />
      )}
    </Command.Item>
  )
}

interface SwitcherActionProps {
  action: ScopeAction
  onRun: (id: string) => void
}

function SwitcherAction({ action, onRun }: SwitcherActionProps) {
  const Icon = action.icon

  function handleClick() {
    onRun(action.id)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-xs transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
        action.tone === 'primary' ? 'text-primary' : 'text-foreground/80',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {action.label}
    </button>
  )
}
