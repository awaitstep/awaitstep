import { describe, expect, it, vi } from 'vitest'
import { buildIdeCommands, type IdeCommandActions, type IdeCommandContext } from '../ide/commands'

function actions(): IdeCommandActions {
  return {
    save: vi.fn(),
    saveAll: vi.fn(),
    discardChanges: vi.fn(),
    revertFile: vi.fn(),
    reviewChanges: vi.fn(),
    compareFile: vi.fn(),
    newFile: vi.fn(),
    newStep: vi.fn(),
    renameFile: vi.fn(),
    deleteFile: vi.fn(),
    convertHandlers: vi.fn(),
    quickOpen: vi.fn(),
    findInFiles: vi.fn(),
    nextSearchHit: vi.fn(),
    prevSearchHit: vi.fn(),
    switchToCanvas: vi.fn(),
    closeActiveFile: vi.fn(),
    closeAllFiles: vi.fn(),
    copyActivePath: vi.fn(),
    toggleExplorer: vi.fn(),
    toggleDock: vi.fn(),
    togglePreview: vi.fn(),
    showProblems: vi.fn(),
    showTestSession: vi.fn(),
    showQuickTest: vi.fn(),
    showSteps: vi.fn(),
    run: vi.fn(),
    startSession: vi.fn(),
    stopSession: vi.fn(),
    triggerSession: vi.fn(),
  }
}

function context(overrides: Partial<IdeCommandContext> = {}): IdeCommandContext {
  return {
    hasActiveFile: true,
    activeIsStoredFile: true,
    activeIsHandlersFile: false,
    activeDirty: true,
    activeMovedOnServer: false,
    dirtyCount: 1,
    openCount: 2,
    canEdit: true,
    editBlockedReason: null,
    activeStepId: null,
    activeStepBranches: false,
    explorerOpen: true,
    dockOpen: false,
    previewOpen: true,
    runBlockedReason: null,
    runLabel: 'Start and trigger',
    runEnabled: true,
    canStartSession: true,
    canStopSession: false,
    canTriggerSession: false,
    actions: actions(),
    ...overrides,
  }
}

function enabledById(ctx: IdeCommandContext): Record<string, boolean> {
  return Object.fromEntries(buildIdeCommands(ctx).map((c) => [c.id, c.enabled]))
}

describe('buildIdeCommands', () => {
  it('lists every command once with a unique id', () => {
    const ids = buildIdeCommands(context()).map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('navigate.quickOpen')
  })

  it('offers Review Unsaved Changes only while something is unsaved and editable', () => {
    expect(enabledById(context())['file.review']).toBe(true)
    expect(enabledById(context({ dirtyCount: 0 }))['file.review']).toBe(false)
    expect(enabledById(context({ canEdit: false }))['file.review']).toBe(false)
    const review = buildIdeCommands(context()).find((c) => c.id === 'file.review')
    expect(review?.label).toBe('Review Unsaved Changes')
  })

  it('offers Compare with the server only for a file the server has moved on from', () => {
    expect(enabledById(context())['file.compare']).toBe(false)
    expect(enabledById(context({ activeMovedOnServer: true }))['file.compare']).toBe(true)
    expect(
      enabledById(context({ activeMovedOnServer: true, canEdit: false }))['file.compare'],
    ).toBe(false)
  })

  it('gates saving on an editable workspace and unsaved changes', () => {
    expect(enabledById(context())).toMatchObject({ 'file.save': true, 'file.saveAll': true })
    expect(enabledById(context({ activeDirty: false, dirtyCount: 0 }))).toMatchObject({
      'file.save': false,
      'file.saveAll': false,
      'file.discard': false,
    })
    expect(enabledById(context({ canEdit: false }))).toMatchObject({
      'file.save': false,
      'file.saveAll': false,
      'file.new': false,
      'file.rename': false,
      'file.delete': false,
      'file.discard': true,
    })
  })

  it('offers rename and delete only for an active stored project file (not generated, not virtual)', () => {
    const generated = enabledById(context({ activeIsStoredFile: false }))
    expect(generated['file.rename']).toBe(false)
    expect(generated['file.delete']).toBe(false)
    expect(generated['file.copyPath']).toBe(true)
  })

  it('offers the handler conversion only on the annotation file in an editable workspace', () => {
    expect(enabledById(context())['file.convertHandlers']).toBe(false)
    expect(enabledById(context({ activeIsHandlersFile: true }))['file.convertHandlers']).toBe(true)
    expect(
      enabledById(context({ activeIsHandlersFile: true, canEdit: false }))['file.convertHandlers'],
    ).toBe(false)
  })

  it('disables tab commands with nothing open', () => {
    const none = enabledById(context({ hasActiveFile: false, openCount: 0 }))
    expect(none['file.close']).toBe(false)
    expect(none['file.closeAll']).toBe(false)
    expect(none['navigate.quickOpen']).toBe(true)
  })

  it('labels toggles and Save All with the state they will produce', () => {
    const open = buildIdeCommands(context({ explorerOpen: true, dockOpen: true, dirtyCount: 3 }))
    expect(open.find((c) => c.id === 'view.explorer')?.label).toBe('Hide Side Bar')
    expect(open.find((c) => c.id === 'view.dock')?.label).toBe('Hide Panel')
    expect(open.find((c) => c.id === 'file.saveAll')?.label).toBe('Save All (3)')
    const closed = buildIdeCommands(context({ explorerOpen: false, dockOpen: false }))
    expect(closed.find((c) => c.id === 'view.explorer')?.label).toBe('Show Side Bar')
    expect(closed.find((c) => c.id === 'view.dock')?.label).toBe('Show Panel')
    expect(closed.find((c) => c.id === 'file.saveAll')?.label).toBe('Save All')
  })

  it('routes run() to the matching action', () => {
    const ctx = context()
    const commands = buildIdeCommands(ctx)
    commands.find((c) => c.id === 'view.problems')?.run()
    commands.find((c) => c.id === 'file.new')?.run()
    expect(ctx.actions.showProblems).toHaveBeenCalledTimes(1)
    expect(ctx.actions.newFile).toHaveBeenCalledTimes(1)
    expect(ctx.actions.save).not.toHaveBeenCalled()
  })
})

describe('Show Steps command', () => {
  it('is always offered and runs the Steps action', () => {
    const ctx = context()
    const command = buildIdeCommands(ctx).find((c) => c.id === 'view.steps')
    expect(command).toMatchObject({ label: 'Show Steps', group: 'view', enabled: true })
    command?.run()
    expect(ctx.actions.showSteps).toHaveBeenCalledTimes(1)
  })
})

describe('revert and save commands', () => {
  it('offers Revert File only for a dirty active file', () => {
    expect(enabledById(context())['file.revert']).toBe(true)
    expect(enabledById(context({ activeDirty: false }))['file.revert']).toBe(false)
  })

  it('names the shortcut of each save command', () => {
    const byId = Object.fromEntries(buildIdeCommands(context()).map((c) => [c.id, c]))
    expect(byId['file.save']).toMatchObject({ label: 'Save File', shortcut: 'save' })
    expect(byId['file.saveAll']).toMatchObject({ shortcut: 'saveAll' })
  })
})

describe('run and test session commands', () => {
  const byId = (ctx: IdeCommandContext, id: string) =>
    buildIdeCommands(ctx).find((c) => c.id === id)!

  it('names what Run will do and binds it to the run shortcut', () => {
    const run = byId(context({ runLabel: 'Quick test step' }), 'run.run')
    expect(run).toMatchObject({ label: 'Run: Quick test step', shortcut: 'run', enabled: true })
  })

  it('disables Run while a session is starting', () => {
    expect(byId(context({ runEnabled: false }), 'run.run').enabled).toBe(false)
  })

  it('offers Start with no session, and Stop and Trigger only when they can work', () => {
    const idle = context()
    expect(byId(idle, 'run.start').enabled).toBe(true)
    expect(byId(idle, 'run.stop').enabled).toBe(false)
    expect(byId(idle, 'run.trigger').enabled).toBe(false)

    const starting = context({ canStartSession: false, canStopSession: true })
    expect(byId(starting, 'run.start').enabled).toBe(false)
    expect(byId(starting, 'run.stop').enabled).toBe(true)
    expect(byId(starting, 'run.trigger').enabled).toBe(false)

    const running = context({
      canStartSession: false,
      canStopSession: true,
      canTriggerSession: true,
    })
    expect(byId(running, 'run.trigger').enabled).toBe(true)
  })

  it('replaced Show Output and Show Run with one Show Test Session', () => {
    const labels = buildIdeCommands(context()).map((c) => c.label)
    expect(labels).toContain('Show Test Session')
    expect(labels).not.toContain('Show Output')
    expect(labels).not.toContain('Show Run')
  })

  it('disables Run and the session commands with the reason, once, and keeps the views open when there is no saved version', () => {
    const blocked = buildIdeCommands(
      context({
        runBlockedReason: 'Save a version on the canvas first',
        canStopSession: true,
        canTriggerSession: true,
      }),
    )
    const byId = Object.fromEntries(blocked.map((c) => [c.id, c]))
    for (const id of ['run.run', 'run.start', 'run.trigger']) {
      expect(byId[id]).toMatchObject({
        enabled: false,
        disabledReason: 'Save a version on the canvas first',
      })
    }
    // The reason is shown beside the command, so the label does not repeat it.
    expect(byId['run.run']?.label).toBe('Run')
    // A session left over can still be stopped, and showing a tab is just a
    // view: both tabs say what to do, so neither is disabled.
    expect(byId['run.stop']?.enabled).toBe(true)
    expect(byId['view.testSession']?.enabled).toBe(true)
    expect(byId['view.quickTest']?.enabled).toBe(true)
    expect(byId['view.quickTest']?.disabledReason).toBeUndefined()
  })

  it('gives no reason, and keeps every command as before, when a version exists', () => {
    const commands = buildIdeCommands(context())
    expect(commands.some((c) => c.disabledReason !== undefined)).toBe(false)
    expect(commands.find((c) => c.id === 'run.start')?.enabled).toBe(true)
  })

  it('offers New Step only for an editable workspace with a step file active', () => {
    expect(enabledById(context())['file.newStep']).toBe(false)
    expect(enabledById(context({ activeStepId: 'fetch' }))['file.newStep']).toBe(true)
    expect(enabledById(context({ activeStepId: 'fetch', canEdit: false }))['file.newStep']).toBe(
      false,
    )
  })

  it('says why New Step cannot run on a branching step', () => {
    const command = buildIdeCommands(
      context({ activeStepId: 'gate', activeStepBranches: true }),
    ).find((c) => c.id === 'file.newStep')
    expect(command?.enabled).toBe(false)
    expect(command?.disabledReason).toBe(
      'This step branches. Choose the connection in the Steps view.',
    )
  })

  it('says why New Step cannot run on a read-only version', () => {
    const command = buildIdeCommands(
      context({
        activeStepId: 'fetch',
        canEdit: false,
        editBlockedReason: 'Older versions are read-only.',
      }),
    ).find((c) => c.id === 'file.newStep')
    expect(command?.enabled).toBe(false)
    expect(command?.disabledReason).toBe('Older versions are read-only.')
  })

  it('new step runs against the active step', () => {
    const ctx = context({ activeStepId: 'fetch' })
    const command = buildIdeCommands(ctx).find((c) => c.id === 'file.newStep')!
    command.run()
    expect(ctx.actions.newStep).toHaveBeenCalledWith('fetch')
  })
})
