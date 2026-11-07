import { describe, expect, it } from 'vitest'
import { getNodeVisuals } from '../node-icon-map'

describe('getNodeVisuals', () => {
  it('falls back for a prototype-named node type instead of reading Object.prototype', () => {
    const fallback = getNodeVisuals('not-a-node')
    for (const type of ['__proto__', 'constructor', 'toString']) {
      expect(getNodeVisuals(type)).toBe(fallback)
    }
  })
})
