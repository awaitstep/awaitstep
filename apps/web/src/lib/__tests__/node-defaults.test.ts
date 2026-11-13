import { describe, expect, it } from 'vitest'
import { configDefaults } from '../node-defaults'

describe('configDefaults', () => {
  it('takes each field’s default and leaves fields without one unset', () => {
    expect(
      configDefaults({
        greeting: { type: 'string', label: 'Greeting', default: 'hi' },
        count: { type: 'number', label: 'Count', default: 0 },
        target: { type: 'string', label: 'Target', required: true },
      }),
    ).toEqual({ greeting: 'hi', count: 0 })
  })

  it('is empty for a node with no fields', () => {
    expect(configDefaults(undefined)).toEqual({})
  })
})
