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
