import { describe, expect, it } from 'vitest'
import { currentFirst } from '../current-first'

describe('currentFirst', () => {
  it('moves the current item to the front and keeps the rest in order', () => {
    expect(currentFirst(['a', 'b', 'c', 'd'], (x) => x === 'c')).toEqual(['c', 'a', 'b', 'd'])
  })

  it('leaves the order alone when nothing is current, or the first already is', () => {
    expect(currentFirst(['a', 'b'], () => false)).toEqual(['a', 'b'])
    expect(currentFirst(['a', 'b'], (x) => x === 'a')).toEqual(['a', 'b'])
  })
})
