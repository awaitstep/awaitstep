import { describe, expect, it } from 'vitest'
import { initialsOf } from '../initials'
import { listNames } from '../name-list'

describe('initialsOf', () => {
  it('takes the first letters of two names, else the first two letters', () => {
    expect(initialsOf('Ama K. Mensah')).toBe('AK')
    expect(initialsOf('Priya')).toBe('PR')
    expect(initialsOf(null, 'sam@acme.test')).toBe('SA')
    expect(initialsOf('  ')).toBe('?')
  })
})

describe('listNames', () => {
  it('joins with commas and a final “and”', () => {
    expect(listNames([])).toBe('')
    expect(listNames(['Acme Inc'])).toBe('Acme Inc')
    expect(listNames(['Sales', 'IT', 'Support'])).toBe('Sales, IT and Support')
  })
})
