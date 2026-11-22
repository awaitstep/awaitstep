import { describe, expect, it } from 'vitest'
import { isPlainClick } from '../clicks'

const click = (over: Partial<Parameters<typeof isPlainClick>[0]> = {}) => ({
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...over,
})

describe('isPlainClick', () => {
  it('takes a plain primary click', () => {
    expect(isPlainClick(click())).toBe(true)
  })

  // The demo link once opened its dialog on Cmd-click, so "open in new tab" never worked.
  it.each([
    ['Cmd', { metaKey: true }],
    ['Ctrl', { ctrlKey: true }],
    ['Shift', { shiftKey: true }],
    ['Alt', { altKey: true }],
    ['a middle click', { button: 1 }],
  ])('leaves %s to the browser', (_, over) => {
    expect(isPlainClick(click(over))).toBe(false)
  })
})
