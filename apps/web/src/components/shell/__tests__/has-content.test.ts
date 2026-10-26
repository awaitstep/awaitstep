import { describe, expect, it } from 'vitest'
import { hasContent } from '../has-content'

describe('hasContent', () => {
  it('treats an empty slot as no content', () => {
    for (const node of [undefined, null, false, '']) expect(hasContent(node)).toBe(false)
  })

  it('treats 0 and any other value as content', () => {
    for (const node of [0, 'Invite', true, []]) expect(hasContent(node)).toBe(true)
  })
})
