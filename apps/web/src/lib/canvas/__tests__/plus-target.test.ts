// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { isPressOnPlus, plusKey } from '../plus-target'

function plusFor(nodeId: string, side: string): HTMLElement {
  const plus = document.createElement('div')
  plus.setAttribute('data-plus', plusKey(nodeId, side))
  const icon = document.createElement('span')
  plus.appendChild(icon)
  document.body.appendChild(plus)
  return icon
}

describe('isPressOnPlus', () => {
  it('finds the + a press inside it belongs to', () => {
    const icon = plusFor('a', 'bottom')
    expect(isPressOnPlus(icon, plusKey('a', 'bottom'))).toBe(true)
    expect(isPressOnPlus(icon, plusKey('a', 'right'))).toBe(false)
  })

  // Regression: the key was built into a `[data-plus="…"]` selector, which
  // threw on an IR node id holding a quote.
  it('handles a node id with quotes and brackets', () => {
    const id = 'a"]b'
    const icon = plusFor(id, 'top')
    expect(isPressOnPlus(icon, plusKey(id, 'top'))).toBe(true)
  })

  it('ignores a press elsewhere, or no target', () => {
    expect(isPressOnPlus(document.body, plusKey('a', 'top'))).toBe(false)
    expect(isPressOnPlus(null, plusKey('a', 'top'))).toBe(false)
  })
})
