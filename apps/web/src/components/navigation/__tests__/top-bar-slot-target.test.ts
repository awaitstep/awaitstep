import { describe, expect, it } from 'vitest'
import { slotTargetFor } from '../top-bar-slot-target'

const topBar = { id: 'top-bar' } as unknown as HTMLElement
const phone = { id: 'phone' } as unknown as HTMLElement

describe('slotTargetFor', () => {
  it.each([
    ['a phone, with the strip: the strip', { topBar, phone }, true, phone],
    ['wider: the top bar', { topBar, phone }, false, topBar],
    ['a phone, without a strip: the top bar', { topBar, phone: null }, true, topBar],
    ['nothing mounted yet: nowhere', { topBar: null, phone: null }, false, null],
  ])('%s', (_name, targets, isPhone, expected) => {
    expect(slotTargetFor(targets, isPhone)).toBe(expected)
  })
})
