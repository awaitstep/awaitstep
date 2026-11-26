import { describe, expect, it, vi } from 'vitest'
import {
  createShortcutDispatcher,
  SEQUENCE_WINDOW_MS,
  type DispatchContext,
  type DispatchEvent,
} from '../dispatcher'
import { formatShortcut } from '../keys'
import { APP_SHORTCUTS } from '../registry'

function press(key: string, mods: Partial<DispatchEvent> = {}): DispatchEvent {
  return {
    key,
    code: mods.code ?? `Key${key.toUpperCase()}`,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    repeat: false,
    ...mods,
  }
}

const PAGE: DispatchContext = { typing: false, inDialog: false }
const FIELD: DispatchContext = { typing: true, inDialog: false }
const DIALOG: DispatchContext = { typing: false, inDialog: true }

function setup() {
  let clock = 0
  const dispatcher = createShortcutDispatcher({ isMac: true, now: () => clock })
  return {
    dispatcher,
    advance(ms: number) {
      clock += ms
    },
  }
}

describe('shortcut dispatcher', () => {
  it('runs a chord in a field too, and a single key only outside one', () => {
    const { dispatcher } = setup()
    const palette = vi.fn()
    const help = vi.fn()
    dispatcher.register('global', () => ({ palette, help }))

    expect(dispatcher.handle(press('k', { metaKey: true }), FIELD)).toBe(true)
    expect(dispatcher.handle(press('?', { shiftKey: true, code: 'Slash' }), FIELD)).toBe(false)
    expect(dispatcher.handle(press('?', { shiftKey: true, code: 'Slash' }), PAGE)).toBe(true)
    expect(palette).toHaveBeenCalledTimes(1)
    expect(help).toHaveBeenCalledTimes(1)
  })

  it('leaves ⌘A to a field, where it selects the text', () => {
    const { dispatcher } = setup()
    const canvasSelectAll = vi.fn()
    dispatcher.register('canvas', () => ({ canvasSelectAll }))

    expect(dispatcher.handle(press('a', { metaKey: true }), FIELD)).toBe(false)
    expect(dispatcher.handle(press('a', { metaKey: true }), PAGE)).toBe(true)
    expect(canvasSelectAll).toHaveBeenCalledTimes(1)
  })

  it('leaves every key to an open dialog', () => {
    const { dispatcher } = setup()
    const palette = vi.fn()
    const goProjects = vi.fn()
    dispatcher.register('global', () => ({ palette, goProjects }))

    expect(dispatcher.handle(press('k', { metaKey: true }), DIALOG)).toBe(false)
    dispatcher.handle(press('g'), DIALOG)
    expect(dispatcher.handle(press('p'), DIALOG)).toBe(false)
    expect(palette).not.toHaveBeenCalled()
    expect(goProjects).not.toHaveBeenCalled()
  })

  it.each([
    ['within the window', SEQUENCE_WINDOW_MS, 1],
    ['too late', SEQUENCE_WINDOW_MS + 1, 0],
  ])('runs g then p %s', (_name, wait, calls) => {
    const { dispatcher, advance } = setup()
    const goProjects = vi.fn()
    dispatcher.register('global', () => ({ goProjects }))

    dispatcher.handle(press('g'), PAGE)
    advance(wait)
    dispatcher.handle(press('p'), PAGE)
    expect(goProjects).toHaveBeenCalledTimes(calls)
  })

  it('never starts a sequence while typing', () => {
    const { dispatcher } = setup()
    const goProjects = vi.fn()
    dispatcher.register('global', () => ({ goProjects }))

    dispatcher.handle(press('g'), FIELD)
    dispatcher.handle(press('p'), PAGE)
    expect(goProjects).not.toHaveBeenCalled()
  })

  it('lets an inner scope win the same keys, and falls back once it unmounts', () => {
    const { dispatcher } = setup()
    const workspaceRuns = vi.fn()
    const itemRuns = vi.fn()
    dispatcher.register('global', () => ({ goRuns: workspaceRuns }))
    const unmount = dispatcher.register('workflow', () => ({ goItemRuns: itemRuns }))

    dispatcher.handle(press('g'), PAGE)
    dispatcher.handle(press('u'), PAGE)
    expect(itemRuns).toHaveBeenCalledTimes(1)
    expect(workspaceRuns).not.toHaveBeenCalled()

    unmount()
    dispatcher.handle(press('g'), PAGE)
    dispatcher.handle(press('u'), PAGE)
    expect(workspaceRuns).toHaveBeenCalledTimes(1)
  })

  it('passes a declined key on, and reports it unused when no one takes it', () => {
    const { dispatcher } = setup()
    const search = vi.fn(() => false as const)
    dispatcher.register('global', () => ({ search }))

    expect(dispatcher.handle(press('/', { code: 'Slash' }), PAGE)).toBe(false)
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('runs an action once when held, but repeats zoom', () => {
    const { dispatcher } = setup()
    const deploy = vi.fn()
    const canvasZoomIn = vi.fn()
    dispatcher.register('workflow', () => ({ deploy }))
    dispatcher.register('canvas', () => ({ canvasZoomIn }))

    dispatcher.handle(press('d'), PAGE)
    expect(dispatcher.handle(press('d', { repeat: true }), PAGE)).toBe(true)
    expect(deploy).toHaveBeenCalledTimes(1)

    dispatcher.handle(press('=', { code: 'Equal' }), PAGE)
    dispatcher.handle(press('+', { code: 'Equal', shiftKey: true, repeat: true }), PAGE)
    expect(canvasZoomIn).toHaveBeenCalledTimes(2)
  })

  it('reads Shift+E as a capital, not the e shortcut', () => {
    const { dispatcher } = setup()
    const openEditor = vi.fn()
    dispatcher.register('workflow', () => ({ openEditor }))

    dispatcher.handle(press('E', { shiftKey: true }), PAGE)
    expect(openEditor).not.toHaveBeenCalled()
    dispatcher.handle(press('e'), PAGE)
    expect(openEditor).toHaveBeenCalledTimes(1)
  })

  it('matches the theme on the physical key, whatever Option types', () => {
    const { dispatcher } = setup()
    const theme = vi.fn()
    dispatcher.register('global', () => ({ theme }))

    dispatcher.handle(press('¬', { code: 'KeyL', shiftKey: true, altKey: true }), PAGE)
    expect(theme).toHaveBeenCalledTimes(1)
  })

  it('never runs a shortcut that is only listed', () => {
    const { dispatcher } = setup()
    const canvasUndo = vi.fn()
    dispatcher.register('canvas', () => ({ canvasUndo }))

    expect(dispatcher.handle(press('z', { metaKey: true }), PAGE)).toBe(false)
    expect(canvasUndo).not.toHaveBeenCalled()
  })

  it('lists what can run now for the palette, and runs it as if pressed', () => {
    const { dispatcher } = setup()
    const deploy = vi.fn()
    const help = vi.fn()
    dispatcher.register('global', () => ({ help, theme: undefined }))
    dispatcher.register('workflow', () => ({ deploy, run: undefined }))

    expect(dispatcher.bound()).toEqual(['deploy', 'help'])
    expect(dispatcher.run('deploy')).toBe(true)
    expect(dispatcher.run('run')).toBe(false)
    expect(deploy).toHaveBeenCalledTimes(1)
  })

  it('tells the shortcuts sheet which scopes are mounted', () => {
    const { dispatcher } = setup()
    const seen = vi.fn()
    dispatcher.subscribe(seen)
    const unmount = dispatcher.register('canvas', () => ({}))
    expect([...dispatcher.scopes()]).toEqual(['canvas'])
    unmount()
    expect([...dispatcher.scopes()]).toEqual([])
    expect(seen).toHaveBeenCalledTimes(2)
  })
})

describe('shortcut labels', () => {
  it.each([
    [APP_SHORTCUTS.palette.keys, '⌘K', 'Ctrl+K'],
    [APP_SHORTCUTS.theme.keys, '⌥⇧L', 'Alt+Shift+L'],
    [APP_SHORTCUTS.canvasDeselect.keys, 'Esc', 'Esc'],
    [APP_SHORTCUTS.canvasDelete.keys, '⌫', 'Backspace'],
    [APP_SHORTCUTS.canvasSaveEnter.keys, '⌘⏎', 'Ctrl+Enter'],
  ])('%o reads %s on a Mac and %s elsewhere', (keys, mac, other) => {
    expect(formatShortcut(keys, true)).toBe(mac)
    expect(formatShortcut(keys, false)).toBe(other)
  })
})
