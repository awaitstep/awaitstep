import { describe, expect, it } from 'vitest'
import { isExtensionId } from '../extension-id.js'

describe('isExtensionId', () => {
  it('accepts lowercase letters, digits and inner dashes up to 64 characters', () => {
    for (const id of ['a', 'x1', 'agent-chat', 'a'.repeat(64)]) expect(isExtensionId(id)).toBe(true)
  })

  it('refuses anything that is not one lowercase URL segment', () => {
    for (const id of [
      '',
      'A',
      'Agent',
      '-a',
      'a-',
      'a/b',
      '../x',
      'a b',
      'a'.repeat(65),
      7,
      null,
    ]) {
      expect(isExtensionId(id)).toBe(false)
    }
  })
})
