import { Fragment, type ReactElement } from 'react'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { ExternalLink, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Avatar } from '../ui/avatar'
import { ShellLink } from '../ui/shell-link'

export interface AccountMenuItem {
  key: string
  label: string
  /** A link item. Without it the item runs `onSelect`. */
  href?: string
  /** Opens in a new tab as a plain anchor. */
  external?: boolean
  onSelect?: () => void
  icon?: LucideIcon
  /** A key hint shown at the end, e.g. "?". */
  shortcut?: string
  /** `danger`: Sign out. */
  tone?: 'danger'
  /** Shown instead of a working item: greyed, with the reason beside it. */
  disabledReason?: string
}

interface AccountMenuProps {
  /** The avatar button that opens it; must forward its ref and props. */
  trigger: ReactElement
  user: { name: string; email: string; image?: string | null }
  /** Items in groups, separated by a line. */
  groups: AccountMenuItem[][]
  side?: 'top' | 'right' | 'bottom'
  align?: 'start' | 'end'
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

const itemClass =
  'flex h-9 cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 text-sm outline-none transition-colors data-[highlighted]:bg-accent data-[disabled]:cursor-default'

/**
 * The account avatar's menu: who you are, then groups of links and actions.
 * A Radix menu: arrow keys and typeahead move between items, Escape returns
 * focus to the avatar.
 */
export function AccountMenu({
  trigger,
  user,
  groups,
  side = 'right',
  align = 'end',
  open,
  defaultOpen,
  onOpenChange,
}: AccountMenuProps) {
  return (
    <Menu.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <Menu.Trigger asChild>{trigger}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={16}
          aria-label="Your account"
          className="z-50 flex w-[300px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg"
        >
          <Menu.Label className="flex items-center gap-3 border-b border-border p-3.5">
            <Avatar name={user.name} email={user.email} src={user.image} className="size-9" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold text-foreground">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
          </Menu.Label>
          {groups.map((group, index) => (
            <Fragment key={group.map((item) => item.key).join('|')}>
              {index > 0 && <Menu.Separator className="h-px bg-border" />}
              <Menu.Group className="flex flex-col p-1.5">
                {group.map((item) => (
                  <AccountMenuRow key={item.key} item={item} />
                ))}
              </Menu.Group>
            </Fragment>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

function RowContent({ item }: { item: AccountMenuItem }) {
  const Icon = item.icon
  return (
    <>
      {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.disabledReason && (
        <span className="text-2xs text-muted-foreground">{item.disabledReason}</span>
      )}
      {item.shortcut && !item.disabledReason && (
        <kbd className="rounded border border-border px-1.5 text-2xs font-normal text-muted-foreground">
          {item.shortcut}
        </kbd>
      )}
      {item.external && <ExternalLink className="size-3 shrink-0 opacity-50" aria-hidden="true" />}
    </>
  )
}

function AccountMenuRow({ item }: { item: AccountMenuItem }) {
  const disabled = Boolean(item.disabledReason)
  const className = cn(
    itemClass,
    disabled
      ? 'text-muted-foreground/70'
      : item.tone === 'danger'
        ? 'text-status-error'
        : 'text-foreground/80 data-[highlighted]:text-foreground',
  )

  if (item.href && !disabled) {
    return (
      <Menu.Item asChild className={className}>
        {item.external ? (
          <a href={item.href} target="_blank" rel="noreferrer">
            <RowContent item={item} />
          </a>
        ) : (
          <ShellLink href={item.href}>
            <RowContent item={item} />
          </ShellLink>
        )}
      </Menu.Item>
    )
  }

  return (
    <Menu.Item disabled={disabled} onSelect={item.onSelect} className={className}>
      <RowContent item={item} />
    </Menu.Item>
  )
}
