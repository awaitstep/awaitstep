import type { IdeShortcutId } from './shortcuts'

export type IdeCommandGroup = 'file' | 'navigate' | 'view'

export interface IdeCommand {
  id: string
  label: string
  group: IdeCommandGroup
  shortcut?: IdeShortcutId
  enabled: boolean
  run: () => void
}

export interface IdeCommandActions {
  save: () => void
  quickOpen: () => void
  switchToCanvas: () => void
  closeActiveFile: () => void
  closeAllFiles: () => void
  copyActivePath: () => void
  toggleExplorer: () => void
  toggleDock: () => void
  showProblems: () => void
  showOutput: () => void
  showRun: () => void
}

export interface IdeCommandContext {
  hasActiveFile: boolean
  openCount: number
  explorerOpen: boolean
  dockOpen: boolean
  canSave: boolean
  actions: IdeCommandActions
}

/**
 * The command palette's catalogue. Disabled entries stay listed (so the
 * palette teaches what exists) but cannot run; labels reflect toggles' next
 * state so "Hide Explorer" never reads as a no-op.
 */
export function buildIdeCommands(ctx: IdeCommandContext): IdeCommand[] {
  const { actions } = ctx
  return [
    {
      id: 'file.save',
      label: 'Save',
      group: 'file',
      shortcut: 'save',
      enabled: ctx.canSave,
      run: actions.save,
    },
    {
      id: 'file.close',
      label: 'Close Active File',
      group: 'file',
      shortcut: 'closeTab',
      enabled: ctx.hasActiveFile,
      run: actions.closeActiveFile,
    },
    {
      id: 'file.closeAll',
      label: 'Close All Files',
      group: 'file',
      enabled: ctx.openCount > 0,
      run: actions.closeAllFiles,
    },
    {
      id: 'file.copyPath',
      label: 'Copy File Path',
      group: 'file',
      enabled: ctx.hasActiveFile,
      run: actions.copyActivePath,
    },
    {
      id: 'navigate.quickOpen',
      label: 'Go to File…',
      group: 'navigate',
      shortcut: 'quickOpen',
      enabled: true,
      run: actions.quickOpen,
    },
    {
      id: 'navigate.canvas',
      label: 'Switch to Canvas',
      group: 'navigate',
      enabled: true,
      run: actions.switchToCanvas,
    },
    {
      id: 'view.explorer',
      label: ctx.explorerOpen ? 'Hide Explorer' : 'Show Explorer',
      group: 'view',
      shortcut: 'toggleExplorer',
      enabled: true,
      run: actions.toggleExplorer,
    },
    {
      id: 'view.dock',
      label: ctx.dockOpen ? 'Hide Panel' : 'Show Panel',
      group: 'view',
      shortcut: 'toggleDock',
      enabled: true,
      run: actions.toggleDock,
    },
    {
      id: 'view.problems',
      label: 'Show Problems',
      group: 'view',
      enabled: true,
      run: actions.showProblems,
    },
    {
      id: 'view.output',
      label: 'Show Output',
      group: 'view',
      enabled: true,
      run: actions.showOutput,
    },
    { id: 'view.run', label: 'Show Run', group: 'view', enabled: true, run: actions.showRun },
  ]
}

export const COMMAND_GROUP_LABELS: Readonly<Record<IdeCommandGroup, string>> = {
  file: 'File',
  navigate: 'Navigate',
  view: 'View',
}
