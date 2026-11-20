import { describe, expect, it } from 'vitest'
import { issuesLine } from '../deploy-action'

describe('issuesLine', () => {
  it('sets validator messages side by side as sentences, so their own commas stay inside them', () => {
    expect(
      issuesLine([
        'Fetch: Fetch is not connected to the workflow’s start, so it would never run.',
        'Charge: needs an API key',
        'Open the editor to see the rest.',
      ]),
    ).toBe(
      'Fetch: Fetch is not connected to the workflow’s start, so it would never run. Charge: needs an API key. Open the editor to see the rest.',
    )
  })
})
