import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useIdeShortcuts } from '../use-ide-shortcuts'

function press(target: Element, init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useIdeShortcuts guard', () => {
  it('runs a shortcut from the page', () => {
    const save = vi.fn()
    renderHook(() => useIdeShortcuts({ save }))
    press(document.body, { key: 's', code: 'KeyS', ctrlKey: true })
    // jsdom has no Mac platform, so Ctrl is the modifier.
    expect(save).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a dialog', '<div role="dialog"><input id="t"></div>'],
    ['an alert dialog', '<div role="alertdialog"><input id="t"></div>'],
    ['the new-file row', '<input id="t" data-ide-text-input>'],
  ])('leaves %s alone but keeps the browser from opening Save Page', (_name, html) => {
    const save = vi.fn()
    renderHook(() => useIdeShortcuts({ save }))
    document.body.innerHTML = html
    const event = press(document.getElementById('t')!, { key: 's', code: 'KeyS', ctrlKey: true })
    expect(save).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
  })

  it('does not swallow ordinary typing in those places', () => {
    renderHook(() => useIdeShortcuts({ save: vi.fn() }))
    document.body.innerHTML = '<input id="t" data-ide-text-input>'
    const event = press(document.getElementById('t')!, { key: 'a', code: 'KeyA' })
    expect(event.defaultPrevented).toBe(false)
  })

  it('runs an action once, not once per auto-repeat, while the key is held', () => {
    const run = vi.fn()
    renderHook(() => useIdeShortcuts({ run }))
    const first = press(document.body, { code: 'Enter', key: 'Enter', altKey: true })
    const repeat = press(document.body, { code: 'Enter', key: 'Enter', altKey: true, repeat: true })
    press(document.body, { code: 'Enter', key: 'Enter', altKey: true, repeat: true })
    expect(run).toHaveBeenCalledTimes(1)
    // Still ours: the browser must not get the repeat either.
    expect(first.defaultPrevented && repeat.defaultPrevented).toBe(true)
  })

  it('lets tab cycling repeat, which is what holding the keys is for', () => {
    const nextTab = vi.fn()
    renderHook(() => useIdeShortcuts({ nextTab }))
    const keys = { code: 'BracketRight', key: ']', ctrlKey: true, shiftKey: true }
    press(document.body, keys)
    press(document.body, { ...keys, repeat: true })
    expect(nextTab).toHaveBeenCalledTimes(2)
  })
})

describe('useIdeShortcuts declining', () => {
  it('leaves the key alone when the handler returns false, and takes it otherwise', () => {
    const nextSearchHit = vi.fn<() => void | false>(() => false)
    renderHook(() => useIdeShortcuts({ nextSearchHit }))
    const declined = press(document.body, { key: 'F4', code: 'F4' })
    expect(nextSearchHit).toHaveBeenCalledTimes(1)
    expect(declined.defaultPrevented).toBe(false)
    nextSearchHit.mockReturnValue(undefined)
    expect(press(document.body, { key: 'F4', code: 'F4' }).defaultPrevented).toBe(true)
  })
})

describe('useIdeShortcuts, Run and Search together', () => {
  it('lets F4 repeat while held, and still declines each repeat when there is nothing to step to', () => {
    const nextSearchHit = vi.fn<() => void | false>(() => undefined)
    renderHook(() => useIdeShortcuts({ nextSearchHit }))
    press(document.body, { key: 'F4', code: 'F4' })
    const repeat = press(document.body, { key: 'F4', code: 'F4', repeat: true })
    expect(nextSearchHit).toHaveBeenCalledTimes(2)
    expect(repeat.defaultPrevented).toBe(true)
    nextSearchHit.mockReturnValue(false)
    const declined = press(document.body, { key: 'F4', code: 'F4', repeat: true })
    expect(nextSearchHit).toHaveBeenCalledTimes(3)
    expect(declined.defaultPrevented).toBe(false)
  })

  it('does not start Search, or Run, while a Run confirm dialog is open', () => {
    const findInFiles = vi.fn()
    const run = vi.fn()
    renderHook(() => useIdeShortcuts({ findInFiles, run }))
    document.body.innerHTML = '<div role="alertdialog"><button id="t"></button></div>'
    const target = document.getElementById('t')!
    const search = press(target, { key: 'F', code: 'KeyF', ctrlKey: true, shiftKey: true })
    const go = press(target, { key: 'Enter', code: 'Enter', altKey: true })
    expect(findInFiles).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
    expect(search.defaultPrevented && go.defaultPrevented).toBe(true)
  })

  it('does not run a held Run through the declining path either', () => {
    const run = vi.fn()
    renderHook(() => useIdeShortcuts({ run }))
    press(document.body, { key: 'Enter', code: 'Enter', altKey: true })
    press(document.body, { key: 'Enter', code: 'Enter', altKey: true, repeat: true })
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('useIdeShortcuts throwing handlers', () => {
  it('keeps the browser from opening Save Page even when the save handler throws', () => {
    const save = vi.fn(() => {
      throw new Error('boom')
    })
    renderHook(() => useIdeShortcuts({ save }))
    const event = new KeyboardEvent('keydown', {
      key: 's',
      code: 'KeyS',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    // jsdom reports listener errors on window rather than throwing here.
    const onError = vi.fn((e: ErrorEvent) => e.preventDefault())
    window.addEventListener('error', onError)
    document.body.dispatchEvent(event)
    window.removeEventListener('error', onError)
    expect(save).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })
})
