import type { IdeShortcutId } from './shortcuts'

export type IdeCommandGroup = 'file' | 'navigate' | 'view' | 'run'

export interface IdeCommand {
  id: string
  label: string
  group: IdeCommandGroup
  shortcut?: IdeShortcutId
  enabled: boolean
  /** Why it is off, when something the person can do would turn it on. */
  disabledReason?: string
  run: () => void
}

export interface IdeCommandActions {
  save: () => void
  saveAll: () => void
  discardChanges: () => void
  /** Drops the active file's unsaved edits. */
  revertFile: () => void
  /** Opens the Unsaved changes tab: every unsaved file against its saved text. */
  reviewChanges: () => void
  /** Opens Compare: the active file against the server's copy. */
  compareFile: () => void
  newFile: () => void
  /** Opens the Steps view's name row after the given step. */
  newStep: (nodeId: string) => void
  renameFile: () => void
  deleteFile: () => void
  /** Splits the annotation file (handlers.ts) into handler modules. */
  convertHandlers: () => void
  quickOpen: () => void
  /** Shows Search with the editor's selection (or word at the caret) as the query. */
  findInFiles: () => void
  /** Opens the next / previous search hit; with none to open, shows Search. */
  nextSearchHit: () => void
  prevSearchHit: () => void
  switchToCanvas: () => void
  closeActiveFile: () => void
  closeAllFiles: () => void
  copyActivePath: () => void
  toggleExplorer: () => void
  toggleDock: () => void
  togglePreview: () => void
  showProblems: () => void
  showTestSession: () => void
  showQuickTest: () => void
  /** Shows the Steps view and puts the keyboard in its list. */
  showSteps: () => void
  /** The one Run (⌥⏎): quick-tests a step file, otherwise runs the test session. */
  run: () => void
  startSession: () => void
  stopSession: () => void
  triggerSession: () => void
}

export interface IdeCommandContext {
  hasActiveFile: boolean
  /**
   * The active file is a stored project file (renamable, deletable). A
   * virtual seed is not: it has nothing on the server to rename or delete.
   */
  activeIsStoredFile: boolean
  /** The active file is the annotation file (stored or virtual), convertible to modules. */
  activeIsHandlersFile: boolean
  activeDirty: boolean
  /** The active file has unsaved text and the server's copy has moved on from where it started. */
  activeMovedOnServer: boolean
  dirtyCount: number
  openCount: number
  /** The workspace accepts edits at all (current generated version). */
  canEdit: boolean
  /** Why it does not, when something the person can do would turn it on. */
  editBlockedReason: string | null
  /** The step whose `steps/<id>.ts` is the active file, or null. */
  activeStepId: string | null
  explorerOpen: boolean
  dockOpen: boolean
  previewOpen: boolean
  /**
   * Why running anything is off (the workflow has no saved version), or null.
   * Run and the session commands are disabled with this reason.
   */
  runBlockedReason: string | null
  /** What Run does for the open file, and whether it can right now. */
  runLabel: string
  runEnabled: boolean
  /** No session, and no start or stop in flight. */
  canStartSession: boolean
  /** Running or coming up, and not already stopping. */
  canStopSession: boolean
  /** Running, with nothing in flight. */
  canTriggerSession: boolean
  actions: IdeCommandActions
}

/**
 * The command palette's catalogue. Disabled entries stay listed (so the
 * palette teaches what exists) but cannot run; labels reflect toggles' next
 * state so "Hide Side Bar" never reads as a no-op.
 */
export function buildIdeCommands(ctx: IdeCommandContext): IdeCommand[] {
  const { actions } = ctx
  const blocked = ctx.runBlockedReason
  const reason = blocked === null ? {} : { disabledReason: blocked }
  const newStepReason = ctx.canEdit ? null : ctx.editBlockedReason
  return [
    {
      id: 'file.save',
      label: 'Save File',
      group: 'file',
      shortcut: 'save',
      enabled: ctx.canEdit && ctx.activeDirty,
      run: actions.save,
    },
    {
      id: 'file.saveAll',
      label: ctx.dirtyCount > 1 ? `Save All (${ctx.dirtyCount})` : 'Save All',
      group: 'file',
      shortcut: 'saveAll',
      enabled: ctx.canEdit && ctx.dirtyCount > 0,
      run: actions.saveAll,
    },
    {
      id: 'file.review',
      label: 'Review Unsaved Changes',
      group: 'file',
      enabled: ctx.canEdit && ctx.dirtyCount > 0,
      run: actions.reviewChanges,
    },
    {
      id: 'file.compare',
      label: 'Compare File with Server',
      group: 'file',
      enabled: ctx.canEdit && ctx.activeMovedOnServer,
      run: actions.compareFile,
    },
    {
      id: 'file.revert',
      label: 'Revert File',
      group: 'file',
      enabled: ctx.activeDirty,
      run: actions.revertFile,
    },
    {
      id: 'file.discard',
      label: 'Discard Unsaved Changes',
      group: 'file',
      enabled: ctx.dirtyCount > 0,
      run: actions.discardChanges,
    },
    {
      id: 'file.new',
      label: 'New File…',
      group: 'file',
      shortcut: 'newFile',
      enabled: ctx.canEdit,
      run: actions.newFile,
    },
    {
      id: 'file.newStep',
      label: 'New Step After Current Step…',
      group: 'file',
      enabled: ctx.canEdit && ctx.activeStepId !== null,
      ...(newStepReason === null ? {} : { disabledReason: newStepReason }),
      run: () => {
        if (ctx.activeStepId !== null) actions.newStep(ctx.activeStepId)
      },
    },
    {
      id: 'file.rename',
      label: 'Rename File…',
      group: 'file',
      enabled: ctx.canEdit && ctx.activeIsStoredFile,
      run: actions.renameFile,
    },
    {
      id: 'file.delete',
      label: 'Delete File',
      group: 'file',
      enabled: ctx.canEdit && ctx.activeIsStoredFile,
      run: actions.deleteFile,
    },
    {
      id: 'file.convertHandlers',
      label: 'Convert handlers.ts to Handler Modules',
      group: 'file',
      enabled: ctx.canEdit && ctx.activeIsHandlersFile,
      run: actions.convertHandlers,
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
      id: 'navigate.findInFiles',
      label: 'Search in Files…',
      group: 'navigate',
      shortcut: 'findInFiles',
      enabled: true,
      run: actions.findInFiles,
    },
    {
      id: 'navigate.nextSearchHit',
      label: 'Go to Next Search Result',
      group: 'navigate',
      shortcut: 'nextSearchHit',
      enabled: true,
      run: actions.nextSearchHit,
    },
    {
      id: 'navigate.prevSearchHit',
      label: 'Go to Previous Search Result',
      group: 'navigate',
      shortcut: 'prevSearchHit',
      enabled: true,
      run: actions.prevSearchHit,
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
      label: ctx.explorerOpen ? 'Hide Side Bar' : 'Show Side Bar',
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
      id: 'view.canvasPreview',
      label: ctx.previewOpen ? 'Hide Canvas Preview' : 'Show Canvas Preview',
      group: 'view',
      shortcut: 'togglePreview',
      enabled: true,
      run: actions.togglePreview,
    },
    {
      id: 'view.steps',
      label: 'Show Steps',
      group: 'view',
      enabled: true,
      run: actions.showSteps,
    },
    {
      id: 'view.problems',
      label: 'Show Problems',
      group: 'view',
      enabled: true,
      run: actions.showProblems,
    },
    {
      id: 'view.testSession',
      label: 'Show Test Session',
      group: 'view',
      enabled: true,
      run: actions.showTestSession,
    },
    {
      id: 'view.quickTest',
      label: 'Quick Test This Step',
      group: 'view',
      // Listed even for a file it cannot run: the panel explains what it
      // needs, which is how someone learns the feature exists at all. With no
      // saved version it is just a view, like Show Test Session — both open a
      // tab that says what to do.
      enabled: true,
      run: actions.showQuickTest,
    },
    {
      id: 'run.run',
      // The reason is shown beside a disabled command, so the label does not
      // repeat it.
      label: blocked === null ? `Run: ${ctx.runLabel}` : 'Run',
      group: 'run',
      shortcut: 'run',
      enabled: blocked === null && ctx.runEnabled,
      ...reason,
      run: actions.run,
    },
    {
      id: 'run.start',
      label: 'Test Session: Start',
      group: 'run',
      enabled: blocked === null && ctx.canStartSession,
      ...reason,
      run: actions.startSession,
    },
    {
      id: 'run.stop',
      label: 'Test Session: Stop',
      group: 'run',
      enabled: ctx.canStopSession,
      run: actions.stopSession,
    },
    {
      id: 'run.trigger',
      label: 'Test Session: Trigger',
      group: 'run',
      enabled: blocked === null && ctx.canTriggerSession,
      ...reason,
      run: actions.triggerSession,
    },
  ]
}

export const COMMAND_GROUP_LABELS: Readonly<Record<IdeCommandGroup, string>> = {
  file: 'File',
  navigate: 'Navigate',
  view: 'View',
  run: 'Run',
}
