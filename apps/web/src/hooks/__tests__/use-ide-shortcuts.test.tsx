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
