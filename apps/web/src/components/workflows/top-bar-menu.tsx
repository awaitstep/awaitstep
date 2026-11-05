import { useId, useRef, useState, type RefObject } from 'react'
import { MoreHorizontal, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { collapsedAt, type Collapsed } from './top-bar-layout'
import { focusMoreActions } from './top-bar-focus'

export interface TopBarMenuItem {
  id: string
  label: string
  icon: LucideIcon
  /** Shown at the right edge, already formatted for the platform. */
  shortcut?: string
  onSelect: () => void
  /**
   * Unavailable. The row stays reachable by arrow keys and says why in its
   * `hint`: a disabled row is skipped by the keyboard and its tooltip never
   * shows, which left the reason unreadable for most people.
   */
  disabled?: boolean
  /** Small text under the label: why it is disabled, or what to know before choosing it. */
  hint?: string
  /**
   * The action moves focus itself (a dialog opens and takes it). Without
   * this the menu hands focus back to ⋯ as it closes.
   */
  takesFocus?: boolean
  /**
   * Where focus goes once the menu has closed, for an action that opens a
   * panel which does not take focus on its own. Falls back to ⋯ when it
   * finds nothing, so focus never drops to the page.
   */
  focusTarget?: () => HTMLElement | null | undefined
  /** Listed only while the bar has no room for this on itself. */
  whenCollapsed?: 'history' | 'toggles'
}

/** Status the bar moves into ⋯ when it has no room beside the name. */
export interface TopBarStatusEntry {
  id: string
  /** The bar width below which the entry is listed here. */
  collapsedKey: keyof Collapsed
  label: string
  /** Makes the entry an item that opens this address. */
  href?: string
}

interface TopBarMenuProps {
  /** Items in groups; a rule is drawn between non-empty groups. */
  groups: TopBarMenuItem[][]
  status?: TopBarStatusEntry[]
  /** The bar, measured as the menu opens to know what it has moved in here. */
  barRef: RefObject<HTMLElement | null>
  onFollow: (href: string) => void
}

type PendingFocus = 'taken' | (() => HTMLElement | null | undefined)

/** The ⋯ menu: a real menu (arrow keys, Esc returns focus to ⋯). */
export function TopBarMenu({ groups, status = [], barRef, onFollow }: TopBarMenuProps) {
  const pendingFocusRef = useRef<PendingFocus | null>(null)
  const [collapsed, setCollapsed] = useState<Collapsed>(() => collapsedAt(0))

  function handleOpenChange(open: boolean) {
    if (open) setCollapsed(collapsedAt(barRef.current?.clientWidth ?? 0))
  }

  // Radix returns focus to the trigger as the menu closes. An action that
  // opened a dialog or panel has already decided where it goes.
  function handleCloseAutoFocus(event: Event) {
    const pending = pendingFocusRef.current
    pendingFocusRef.current = null
    if (!pending) return
    event.preventDefault()
    if (pending === 'taken') return
    const target = pending()
    if (target) target.focus()
    else focusMoreActions()
  }

  function handleSelectItem(item: TopBarMenuItem) {
    if (item.takesFocus) pendingFocusRef.current = 'taken'
    else if (item.focusTarget) pendingFocusRef.current = item.focusTarget
    item.onSelect()
  }

  const visibleGroups = groups
    .map((group) => group.filter((item) => !item.whenCollapsed || collapsed[item.whenCollapsed]))
    .filter((group) => group.length > 0)
  const visibleStatus = status.filter((entry) => collapsed[entry.collapsedKey])

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="More actions"
          title="More actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[220px] max-w-[320px]"
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        {visibleStatus.length > 0 && (
          <>
            <DropdownMenuGroup aria-label="Status">
              {visibleStatus.map((entry) =>
                entry.href ? (
                  <DropdownMenuItem
                    key={entry.id}
                    onSelect={() => onFollow(entry.href!)}
                    className="text-xs"
                  >
                    {entry.label}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuLabel key={entry.id}>{entry.label}</DropdownMenuLabel>
                ),
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        {visibleGroups.map((group, index) => (
          <DropdownMenuGroup key={group[0]?.id}>
            {index > 0 && <DropdownMenuSeparator />}
            {group.map((item) => (
              <MenuRow key={item.id} item={item} onSelectItem={handleSelectItem} />
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface MenuRowProps {
  item: TopBarMenuItem
  onSelectItem: (item: TopBarMenuItem) => void
}

function MenuRow({ item, onSelectItem }: MenuRowProps) {
  const Icon = item.icon
  const labelId = useId()
  const hintId = useId()

  // Not the `disabled` attribute: that takes the row out of arrow-key
  // navigation and drops pointer events, so neither a keyboard nor a mouse
  // could ever read why it is off.
  function handleSelect(event: Event) {
    if (item.disabled) {
      event.preventDefault()
      return
    }
    onSelectItem(item)
  }

  return (
    <DropdownMenuItem
      aria-disabled={item.disabled || undefined}
      aria-labelledby={labelId}
      aria-describedby={item.hint ? hintId : undefined}
      onSelect={handleSelect}
      className={cn(item.disabled && 'cursor-not-allowed')}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span id={labelId} className={cn(item.disabled && 'text-muted-foreground')}>
          {item.label}
        </span>
        {item.hint && (
          <span id={hintId} className="text-xs text-muted-foreground">
            {item.hint}
          </span>
        )}
      </span>
      {item.shortcut && (
        <span className="ml-4 text-xs tabular-nums text-muted-foreground">{item.shortcut}</span>
      )}
    </DropdownMenuItem>
  )
}
