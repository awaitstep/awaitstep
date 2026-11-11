import { FileCode2 } from 'lucide-react'
import { IDE_SHORTCUTS, formatShortcut } from '../../lib/ide/shortcuts'
import { isMacPlatform } from '../../lib/platform'

export function EditorPlaceholder() {
  const isMac = isMacPlatform()
  const hints = [
    { label: 'Go to file', keys: formatShortcut(IDE_SHORTCUTS.quickOpen, isMac) },
    { label: 'Command palette', keys: formatShortcut(IDE_SHORTCUTS.commandPalette, isMac) },
    { label: 'Toggle side bar', keys: formatShortcut(IDE_SHORTCUTS.toggleExplorer, isMac) },
    { label: 'Toggle panel', keys: formatShortcut(IDE_SHORTCUTS.toggleDock, isMac) },
  ]

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-editor text-muted-foreground">
      <FileCode2 className="h-10 w-10 text-muted-foreground/30" />
      <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-2 text-xs">
        {hints.map((hint) => (
          <div key={hint.label} className="contents">
            <dt className="text-right text-muted-foreground">{hint.label}</dt>
            <dd>
              <kbd className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-2xs text-muted-foreground">
                {hint.keys}
              </kbd>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
