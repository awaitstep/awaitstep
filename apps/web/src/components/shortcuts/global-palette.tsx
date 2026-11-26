import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from 'cmdk'
import { shortcutPresses } from '../../lib/shortcuts/hints'
import { APP_SHORTCUTS } from '../../lib/shortcuts/registry'
import { isMacPlatform } from '../../lib/platform'
import { cn } from '../../lib/utils'
import { useShortcutsStore } from '../../stores/shortcuts-store'
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog'
import type { PaletteGroup, PaletteItem } from './palette-model'
import { KeyCaps } from './shortcuts-sheet'

interface GlobalPaletteProps {
  groups: PaletteGroup[]
  onSelect: (item: PaletteItem) => void
}

/** The ⌘K palette outside the Code view: pages, this page's actions, and the general ones. */
export function GlobalPalette({ groups, onSelect }: GlobalPaletteProps) {
  const open = useShortcutsStore((s) => s.dialog === 'palette')
  const close = useShortcutsStore((s) => s.close)
  const isMac = isMacPlatform()

  function handleOpenChange(next: boolean) {
    if (!next) close()
  }

  // Close first: an item that opens another dialog (the shortcuts sheet)
  // must not be undone by this one's close.
  function handleSelect(item: PaletteItem) {
    close()
    onSelect(item)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="top-[20%] w-[560px] -translate-y-0 overflow-hidden p-0"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command loop className="flex flex-col">
          <CommandInput
            autoFocus
            placeholder="Go to a page or run a command…"
            className="h-11 w-full border-b border-border bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground"
          />
          <CommandList className="max-h-[360px] overflow-y-auto p-1.5">
            <CommandEmpty className="px-3 py-6 text-center text-xs text-muted-foreground">
              Nothing matches
            </CommandEmpty>
            {groups.map((group) => (
              <CommandGroup
                key={group.heading}
                heading={group.heading}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {group.items.map((item) => (
                  <PaletteRow
                    key={item.id}
                    item={item}
                    keywords={[group.heading]}
                    isMac={isMac}
                    onSelect={handleSelect}
                  />
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function PaletteRow({
  item,
  keywords,
  isMac,
  onSelect,
}: {
  item: PaletteItem
  keywords: string[]
  isMac: boolean
  onSelect: (item: PaletteItem) => void
}) {
  function handleSelect() {
    onSelect(item)
  }

  return (
    <CommandItem
      value={item.id}
      keywords={[item.label, ...keywords]}
      onSelect={handleSelect}
      className={cn(
        'flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs text-foreground/80 outline-none',
        'data-[selected=true]:bg-muted/70 data-[selected=true]:text-foreground',
      )}
    >
      <span>{item.label}</span>
      {item.shortcut && <KeyCaps presses={shortcutPresses(APP_SHORTCUTS[item.shortcut], isMac)} />}
    </CommandItem>
  )
}
