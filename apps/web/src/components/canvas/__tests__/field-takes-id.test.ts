import { describe, expect, it } from 'vitest'
import { fieldTakesId } from '../dynamic-fields'

describe('which fields a label can point at', () => {
  it.each([
    [{ type: 'textarea', label: 'Notes' }, true],
    // Highlighted text is in the code editor, which has no single control.
    [{ type: 'textarea', label: 'SQL', language: 'sql' }, false],
    [{ type: 'code', label: 'Code' }, false],
  ] as const)('%o: %s', (field, takes) => {
    expect(fieldTakesId(field)).toBe(takes)
  })
})
