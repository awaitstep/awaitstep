import { useMemo } from 'react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from 'cmdk'
import { useShallow } from 'zustand/react/shallow'
import {
  COMMAND_GROUP_LABELS,
  buildIdeCommands,
  type IdeCommand,
  type IdeCommandActions,
  type IdeCommandGroup,
} from '../../lib/ide/commands'
import { IDE_SHORTCUTS, formatShortcut } from '../../lib/ide/shortcuts'
import { isMacPlatform } from '../../lib/platform'
import { useIdeLayoutStore } from '../../stores/ide-layout-store'
import { useIdeStore } from '../../stores/ide-store'
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog'
import { cn } from '../../lib/utils'

interface CommandPaletteProps {
  actions: IdeCommandActions
  canEdit: boolean
  activeIsStoredFile: boolean
  activeIsHandlersFile: boolean
  activeDirty: boolean
  dirtyCount: number
  runLabel: string
  runEnabled: boolean
  canStartSession: boolean
  canStopSession: boolean
  canTriggerSession: boolean
}

const GROUP_ORDER: IdeCommandGroup[] = ['file', 'navigate', 'view', 'run']

export function CommandPalette({
  actions,
  canEdit,
  activeIsStoredFile,
  activeIsHandlersFile,
  activeDirty,
  dirtyCount,
  runLabel,
  runEnabled,
  canStartSession,
  canStopSession,
  canTriggerSession,
}: CommandPaletteProps) {
  const { open, closeDialog, hasActiveFile, openCount } = useIdeStore(
    useShallow((s) => ({
      open: s.dialog === 'palette',
      closeDialog: s.closeDialog,
      hasActiveFile: s.activePath !== null,
      openCount: s.openPaths.length,
    })),
  )
  const { explorerOpen, dockOpen, previewOpen } = useIdeLayoutStore(
    useShallow((s) => ({
      explorerOpen: s.explorerOpen,
      dockOpen: s.dockOpen,
      previewOpen: s.previewOpen,
    })),
  )
  const isMac = isMacPlatform()

  const groups = useMemo(() => {
    const commands = buildIdeCommands({
      hasActiveFile,
      activeIsStoredFile,
      activeIsHandlersFile,
      activeDirty,
      dirtyCount,
      openCount,
      canEdit,
      explorerOpen,
      dockOpen,
      previewOpen,
      runLabel,
      runEnabled,
      canStartSession,
      canStopSession,
      canTriggerSession,
      actions,
    })
    return GROUP_ORDER.map((group) => ({
      group,
      commands: commands.filter((c) => c.group === group),
    }))
  }, [
    hasActiveFile,
    activeIsStoredFile,
    activeIsHandlersFile,
    activeDirty,
    dirtyCount,
    openCount,
    canEdit,
    explorerOpen,
    dockOpen,
    previewOpen,
    runLabel,
    runEnabled,
    canStartSession,
    canStopSession,
    canTriggerSession,
    actions,
  ])

  function handleOpenChange(next: boolean) {
    if (!next) closeDialog()
  }

  // Close first: commands that open another dialog (Go to File…) must not be
  // undone by this dialog's own close.
  function handleSelect(command: IdeCommand) {
    closeDialog()
    command.run()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="top-[20%] w-[560px] -translate-y-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command loop className="flex flex-col">
          <CommandInput
            autoFocus
            placeholder="Type a command…"
            className="h-11 w-full border-b border-border bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground"
          />
          <CommandList className="max-h-[360px] overflow-y-auto p-1.5">
            <CommandEmpty className="px-3 py-6 text-center text-xs text-muted-foreground">
              No matching commands
            </CommandEmpty>
            {groups.map(({ group, commands }) => (
              <CommandGroup
                key={group}
                heading={COMMAND_GROUP_LABELS[group]}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {commands.map((command) => (
                  <PaletteItem
                    key={command.id}
                    command={command}
                    shortcut={
                      command.shortcut
                        ? formatShortcut(IDE_SHORTCUTS[command.shortcut], isMac)
                        : undefined
                    }
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

function PaletteItem({
  command,
  shortcut,
  onSelect,
}: {
  command: IdeCommand
  shortcut: string | undefined
  onSelect: (command: IdeCommand) => void
}) {
  function handleSelect() {
    onSelect(command)
  }

  return (
    <CommandItem
      value={`${command.id} ${command.label}`}
      disabled={!command.enabled}
      onSelect={handleSelect}
      className={cn(
        'flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs text-foreground/80 outline-none',
        'data-[selected=true]:bg-muted/70 data-[selected=true]:text-foreground',
        'data-[disabled=true]:cursor-default data-[disabled=true]:opacity-40',
      )}
    >
      <span>{command.label}</span>
      {shortcut && (
        <kbd className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {shortcut}
        </kbd>
      )}
    </CommandItem>
  )
}
