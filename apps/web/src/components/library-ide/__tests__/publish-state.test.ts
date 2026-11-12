import { describe, expect, it } from 'vitest'
import { publishState } from '../publish-state'

const ok = { version: '1.0.1', bumpedFrom: null, problems: [] }

describe('publishState', () => {
  it('names the version and says why it is held back', () => {
    expect(publishState(ok, false, false)).toEqual({
      label: 'Publish v1.0.1',
      disabledReason: null,
    })
    expect(publishState(ok, false, true).disabledReason).toBe('Save first')
    expect(
      publishState({ ...ok, problems: [{ path: 'x', message: 'y' }] }, false, false).disabledReason,
    ).toBe('1 problem to fix')
    expect(publishState(undefined, true, false).disabledReason).toBe('Checking…')
  })

  it('says the check failed instead of checking forever', () => {
    expect(publishState(undefined, false, false, true).disabledReason).toBe(
      'Couldn’t check it. Save to try again',
    )
  })
})
