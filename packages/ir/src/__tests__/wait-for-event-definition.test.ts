import { describe, expect, it } from 'vitest'
import { waitForEventDefinition } from '../bundled-nodes/wait-for-event.js'

describe('wait_for_event definition', () => {
  it('requires a timeout with a 365-day default', () => {
    expect(waitForEventDefinition.configSchema.timeout).toMatchObject({
      required: true,
      default: '365 days',
    })
  })
})
