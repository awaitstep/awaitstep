import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from 'cmdk'
import { shortcutPresses } from '../../lib/shortcuts/hints'
import { APP_SHORTCUTS } from '../../lib/shortcuts/registry'
import { isMacPlatform } from '../../lib/platform'
import { cn } from '../../lib/utils'
import { useShortcutsStore } from '../../stores/shortcuts-store'
import {
  SPOTLIGHT_INPUT_CLASS,
  SPOTLIGHT_ROW_CLASS,
  SpotlightDialog,
  SpotlightResults,
  SpotlightSearchRow,
} from '../ui/spotlight'
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
    <SpotlightDialog open={open} onOpenChange={handleOpenChange} title="Command palette">
      <Command loop className="flex flex-col">
        <SpotlightSearchRow>
          <CommandInput
            autoFocus
            placeholder="Go to a page or run a command"
            className={SPOTLIGHT_INPUT_CLASS}
          />
        </SpotlightSearchRow>
        <CommandList>
          <SpotlightResults>
            <CommandEmpty className="px-3 py-10 text-center text-sm text-muted-foreground">
              Nothing matches
            </CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.heading} heading={group.heading} className={HEADING_CLASS}>
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
          </SpotlightResults>
        </CommandList>
      </Command>
    </SpotlightDialog>
  )
}

/** cmdk draws its own group heading: the Spotlight heading's look (`SPOTLIGHT_HEADING_CLASS`), written out for Tailwind. */
const HEADING_CLASS =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground/80'

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
        SPOTLIGHT_ROW_CLASS,
        'cursor-pointer outline-none',
        'data-[selected=true]:bg-muted/70 data-[selected=true]:text-foreground',
      )}
    >
      <span>{item.label}</span>
      {item.shortcut && <KeyCaps presses={shortcutPresses(APP_SHORTCUTS[item.shortcut], isMac)} />}
    </CommandItem>
  )
}
