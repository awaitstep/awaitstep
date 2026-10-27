import { describe, expect, it } from 'vitest'
import { plural, pluralNoun } from '../plural'

describe('plural', () => {
  it('uses the singular for one and adds an s otherwise', () => {
    expect(plural(1, 'project key')).toBe('1 project key')
    expect(plural(5, 'variable')).toBe('5 variables')
    expect(plural(0, 'workflow')).toBe('0 workflows')
  })

  it('takes an irregular plural', () => {
    expect(plural(2, 'person', 'people')).toBe('2 people')
  })
})

describe('pluralNoun', () => {
  it('gives the noun alone, for a count shown apart from it', () => {
    expect(pluralNoun(1, 'item')).toBe('item')
    expect(pluralNoun(3, 'item')).toBe('items')
    expect(pluralNoun(2, 'person', 'people')).toBe('people')
  })
})
