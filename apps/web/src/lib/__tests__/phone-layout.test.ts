import { describe, expect, it } from 'vitest'
import { isPhoneLayout } from '../phone-layout'

function windowAt(width: number) {
  return {
    matchMedia: (query: string) => ({ matches: width >= Number(/(\d+)px/.exec(query)![1]) }),
  } as unknown as Pick<Window, 'matchMedia'>
}

describe('isPhoneLayout', () => {
  it.each([
    [390, true],
    [767, true],
    [768, false],
    [1440, false],
  ])('at %ipx wide: %s', (width, phone) => {
    expect(isPhoneLayout(windowAt(width))).toBe(phone)
  })

  it('is never the phone layout without a window', () => {
    expect(isPhoneLayout(undefined)).toBe(false)
  })
})
