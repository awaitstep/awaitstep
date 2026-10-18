import { describe, expect, it, vi } from 'vitest'
import { buildIdeCommands, type IdeCommandActions, type IdeCommandContext } from '../ide/commands'

function actions(): IdeCommandActions {
  return {
    save: vi.fn(),
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
    openCount: 2,
    explorerOpen: true,
    dockOpen: false,
    canSave: false,
    actions: actions(),
    ...overrides,
  }
}

describe('buildIdeCommands', () => {
  it('lists every command once with a unique id', () => {
    const ids = buildIdeCommands(context()).map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('navigate.quickOpen')
  })

  it('disables file commands that need an open or saveable file', () => {
    const none = buildIdeCommands(context({ hasActiveFile: false, openCount: 0 }))
    const byId = Object.fromEntries(none.map((c) => [c.id, c.enabled]))
    expect(byId['file.save']).toBe(false)
    expect(byId['file.close']).toBe(false)
    expect(byId['file.closeAll']).toBe(false)
    expect(byId['file.copyPath']).toBe(false)
    expect(byId['navigate.quickOpen']).toBe(true)

    const saveable = buildIdeCommands(context({ canSave: true }))
    expect(saveable.find((c) => c.id === 'file.save')?.enabled).toBe(true)
  })

  it('labels toggles with the state they will produce', () => {
    const open = buildIdeCommands(context({ explorerOpen: true, dockOpen: true }))
    expect(open.find((c) => c.id === 'view.explorer')?.label).toBe('Hide Explorer')
    expect(open.find((c) => c.id === 'view.dock')?.label).toBe('Hide Panel')
    const closed = buildIdeCommands(context({ explorerOpen: false, dockOpen: false }))
    expect(closed.find((c) => c.id === 'view.explorer')?.label).toBe('Show Explorer')
    expect(closed.find((c) => c.id === 'view.dock')?.label).toBe('Show Panel')
  })

  it('routes run() to the matching action', () => {
    const ctx = context()
    const commands = buildIdeCommands(ctx)
    commands.find((c) => c.id === 'view.problems')?.run()
    commands.find((c) => c.id === 'navigate.canvas')?.run()
    expect(ctx.actions.showProblems).toHaveBeenCalledTimes(1)
    expect(ctx.actions.switchToCanvas).toHaveBeenCalledTimes(1)
    expect(ctx.actions.save).not.toHaveBeenCalled()
  })
})
