import { describe, expect, it, vi } from 'vitest'
import { buildIdeCommands, type IdeCommandActions, type IdeCommandContext } from '../ide/commands'

function actions(): IdeCommandActions {
  return {
    save: vi.fn(),
    saveAll: vi.fn(),
    discardChanges: vi.fn(),
    newFile: vi.fn(),
    renameFile: vi.fn(),
    deleteFile: vi.fn(),
    quickOpen: vi.fn(),
    switchToCanvas: vi.fn(),
    closeActiveFile: vi.fn(),
    closeAllFiles: vi.fn(),
    copyActivePath: vi.fn(),
    toggleExplorer: vi.fn(),
    toggleDock: vi.fn(),
    showProblems: vi.fn(),
    showOutput: vi.fn(),
    showRun: vi.fn(),
  }
}

function context(overrides: Partial<IdeCommandContext> = {}): IdeCommandContext {
  return {
    hasActiveFile: true,
    activeIsStoredFile: true,
    activeDirty: true,
    dirtyCount: 1,
    openCount: 2,
    canEdit: true,
    explorerOpen: true,
    dockOpen: false,
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

  it('disables tab commands with nothing open', () => {
    const none = enabledById(context({ hasActiveFile: false, openCount: 0 }))
    expect(none['file.close']).toBe(false)
    expect(none['file.closeAll']).toBe(false)
    expect(none['navigate.quickOpen']).toBe(true)
  })

  it('labels toggles and Save All with the state they will produce', () => {
    const open = buildIdeCommands(context({ explorerOpen: true, dockOpen: true, dirtyCount: 3 }))
    expect(open.find((c) => c.id === 'view.explorer')?.label).toBe('Hide Explorer')
    expect(open.find((c) => c.id === 'view.dock')?.label).toBe('Hide Panel')
    expect(open.find((c) => c.id === 'file.saveAll')?.label).toBe('Save All (3)')
    const closed = buildIdeCommands(context({ explorerOpen: false, dockOpen: false }))
    expect(closed.find((c) => c.id === 'view.explorer')?.label).toBe('Show Explorer')
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
