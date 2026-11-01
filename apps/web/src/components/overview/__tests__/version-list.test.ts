import { describe, expect, it } from 'vitest'
import { latestFailure } from '../version-list'

const failed = new Error('Version is deployed')

describe('latestFailure', () => {
  it('shows the reason while the failed action is the latest', () => {
    expect(
      latestFailure([
        { submittedAt: 1, error: null },
        { submittedAt: 2, error: failed },
      ]),
    ).toBe(failed)
  })

  it('clears it once a later action works', () => {
    expect(
      latestFailure([
        { submittedAt: 3, error: null },
        { submittedAt: 0, error: null },
        { submittedAt: 2, error: failed },
      ]),
    ).toBeNull()
  })

  it('has nothing to say before any action', () => {
    expect(latestFailure([{ submittedAt: 0, error: null }])).toBeNull()
  })
})
