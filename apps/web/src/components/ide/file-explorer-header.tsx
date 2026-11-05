import { ChevronDown, Plus } from 'lucide-react'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { handlerMenuItems, rootConfigMenuItems, type NewMenuItem } from '../../lib/ide/project'
import { IDE_SHORTCUTS, formatShortcut } from '../../lib/ide/shortcuts'
import { isMacPlatform } from '../../lib/platform'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

interface ExplorerHeaderProps {
  canEdit: boolean
  /** Why nothing can be added right now (the file limit), or null. */
  limitReason: string | null
  existing: readonly string[]
  onNewFile: () => void
  onNewFolder: () => void
  onNewItem: (item: NewMenuItem) => void
}

const buttonClass =
  'flex h-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'

export function ExplorerHeader({
  canEdit,
  limitReason,
  existing,
  onNewFile,
  onNewFolder,
  onNewItem,
}: ExplorerHeaderProps) {
  const hint = formatShortcut(IDE_SHORTCUTS.newFile, isMacPlatform())
  const disabled = limitReason !== null
  const handlers = handlerMenuItems(existing)
  const configs = rootConfigMenuItems(existing)

  function handleMenuCloseAutoFocus(event: Event) {
    event.preventDefault()
  }

  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Explorer
      </span>
      {canEdit && (
        <div className="flex items-center">
          <button
            type="button"
            onClick={onNewFile}
            disabled={disabled}
            title={limitReason ?? `New file (${hint})`}
            aria-label="New file"
            className={`${buttonClass} w-6`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="New…" title="New…" className={`${buttonClass} w-5`}>
                <ChevronDown className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-[200px]"
              // Radix would hand focus back to the chevron after the menu
              // unmounts, blurring the name row it just opened.
              onCloseAutoFocus={handleMenuCloseAutoFocus}
            >
              <DropdownMenuItem disabled={disabled} onSelect={onNewFile} className="text-xs">
                File…
                <Why reason={disabled ? 'File limit reached' : null} />
              </DropdownMenuItem>
              <DropdownMenuItem disabled={disabled} onSelect={onNewFolder} className="text-xs">
                Folder…
                <Why reason={disabled ? 'File limit reached' : null} />
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuPrimitive.Label className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Handlers
              </DropdownMenuPrimitive.Label>
              {handlers.map((item) => (
                <ItemRow key={item.id} item={item} limitReason={limitReason} onSelect={onNewItem} />
              ))}
              <DropdownMenuSeparator />
              {configs.map((item) => (
                <ItemRow key={item.id} item={item} limitReason={limitReason} onSelect={onNewItem} />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
}

function Why({ reason }: { reason: string | null }) {
  if (!reason) return null
  return <span className="ml-auto pl-3 text-[11px] text-muted-foreground">{reason}</span>
}

function ItemRow({
  item,
  limitReason,
  onSelect,
}: {
  item: NewMenuItem
  limitReason: string | null
  onSelect: (item: NewMenuItem) => void
}) {
  const reason = item.disabledReason ?? limitReason
  function handleSelect() {
    onSelect(item)
  }
  return (
    <DropdownMenuItem disabled={reason !== null} onSelect={handleSelect} className="text-xs">
      {item.label}
      {reason && <Why reason={reason} />}
    </DropdownMenuItem>
  )
}
