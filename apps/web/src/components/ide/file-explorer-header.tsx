import type { ReactNode } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import type { NewMenuItem } from '../../lib/ide/project'
import { IDE_SHORTCUTS, formatShortcut } from '../../lib/ide/shortcuts'
import { isMacPlatform } from '../../lib/platform'
import { NewMenuItems } from './new-menu-items'
import { CLOUDFLARE_BINDINGS_PATH } from '../../lib/ide/bindings-template'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../ui/dropdown-menu'

interface ExplorerHeaderProps {
  /** The side bar's view switch, in place of the plain title. */
  tabs?: ReactNode
  canEdit: boolean
  /** Why nothing can be added right now (the file limit), or null. */
  limitReason: string | null
  existing: readonly string[]
  onNewFile: () => void
  onNewFolder: () => void
  onNewItem: (item: NewMenuItem) => void
  onCreateBindings: () => void
}

const buttonClass =
  'flex h-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'

export function ExplorerHeader({
  tabs,
  canEdit,
  limitReason,
  existing,
  onNewFile,
  onNewFolder,
  onNewItem,
  onCreateBindings,
}: ExplorerHeaderProps) {
  const hint = formatShortcut(IDE_SHORTCUTS.newFile, isMacPlatform())
  const disabled = limitReason !== null
  const menuDisabled = disabled && !existing.includes(CLOUDFLARE_BINDINGS_PATH)

  function handleMenuCloseAutoFocus(event: Event) {
    event.preventDefault()
  }

  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
      {tabs ?? (
        <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          Explorer
        </span>
      )}
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
              <button
                type="button"
                aria-label="New…"
                title="New…"
                disabled={menuDisabled}
                className={`${buttonClass} w-5`}
              >
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
              <NewMenuItems
                limitReason={limitReason}
                existing={existing}
                onNewFile={onNewFile}
                onNewFolder={onNewFolder}
                onNewItem={onNewItem}
                onCreateBindings={onCreateBindings}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
}
