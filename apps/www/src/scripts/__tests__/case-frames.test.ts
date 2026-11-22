// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { syncCaseFrame } from '../case-frames'

const frame = (scrollWidth: number, clientWidth: number) => {
  const el = document.createElement('div')
  el.setAttribute('tabindex', '0')
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth })
  Object.defineProperty(el, 'clientWidth', { value: clientWidth })
  return el
}

describe('syncCaseFrame', () => {
  it('keeps a drawing that scrolls a tab stop, so a keyboard can scroll it', () => {
    const el = frame(700, 360)
    syncCaseFrame(el)
    expect(el.getAttribute('tabindex')).toBe('0')
  })

  it('drops the tab stop when the drawing fits its frame', () => {
    const el = frame(640, 640)
    syncCaseFrame(el)
    expect(el.hasAttribute('tabindex')).toBe(false)
  })
})
