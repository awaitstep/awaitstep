import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { handlerMenuItems, rootConfigMenuItems, type NewMenuItem } from '../../lib/ide/project'
import { CLOUDFLARE_BINDINGS_PATH } from '../../lib/ide/bindings-template'
import { useProviderCapabilities } from '../../hooks/use-provider-capabilities'
import { DropdownMenuItem, DropdownMenuSeparator } from '../ui/dropdown-menu'

export interface NewMenuItemsProps {
  /** Why nothing can be added right now (the file limit), or null. */
  limitReason: string | null
  existing: readonly string[]
  onNewFile: () => void
  onNewFolder: () => void
  onNewItem: (item: NewMenuItem) => void
  onCreateBindings: () => void
}

/** What can be added to the project: the New… menu, and the Project row's right-click menu. */
export function NewMenuItems({
  limitReason,
  existing,
  onNewFile,
  onNewFolder,
  onNewItem,
  onCreateBindings,
}: NewMenuItemsProps) {
  const disabled = limitReason !== null
  const capabilities = useProviderCapabilities()
  const handlerKinds = [...new Set(capabilities.flatMap((c) => c.handlerKinds))]
  const handlers = handlerMenuItems(existing, handlerKinds.length > 0 ? handlerKinds : ['fetch'])
  const configs = rootConfigMenuItems(existing)
  return (
    <>
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
        Bindings
      </DropdownMenuPrimitive.Label>
      <DropdownMenuItem
        disabled={disabled && !existing.includes(CLOUDFLARE_BINDINGS_PATH)}
        onSelect={onCreateBindings}
        className="text-xs"
      >
        {existing.includes(CLOUDFLARE_BINDINGS_PATH)
          ? 'Open Cloudflare bindings…'
          : 'Cloudflare bindings…'}
        <Why
          reason={
            disabled && !existing.includes(CLOUDFLARE_BINDINGS_PATH) ? 'File limit reached' : null
          }
        />
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
    </>
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
