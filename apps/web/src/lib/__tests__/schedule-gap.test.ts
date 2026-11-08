import { describe, expect, it } from 'vitest'
import { scheduleMissing } from '../ide/schedule-gap'

describe('scheduleMissing', () => {
  it('is false without a scheduled handler, whatever else is set', () => {
    expect(
      scheduleMissing({
        hasScheduledModule: false,
        deployConfig: null,
        scheduleConfigKey: 'cronTriggers',
      }),
    ).toBe(false)
  })

  it('is true for a scheduled handler with no cron in the provider config', () => {
    expect(
      scheduleMissing({
        hasScheduledModule: true,
        deployConfig: null,
        scheduleConfigKey: 'cronTriggers',
      }),
    ).toBe(true)
    expect(
      scheduleMissing({
        hasScheduledModule: true,
        deployConfig: '{}',
        scheduleConfigKey: 'cronTriggers',
      }),
    ).toBe(true)
  })

  it('is false when the provider does not support schedules', () => {
    expect(scheduleMissing({ hasScheduledModule: true, deployConfig: null })).toBe(false)
  })

  it('is false when the deployment config names a cron, and true for an empty list', () => {
    const named = JSON.stringify({ cronTriggers: ['*/5 * * * *'] })
    const empty = JSON.stringify({ cronTriggers: [] })
    expect(
      scheduleMissing({
        hasScheduledModule: true,
        deployConfig: named,
        scheduleConfigKey: 'cronTriggers',
      }),
    ).toBe(false)
    expect(
      scheduleMissing({
        hasScheduledModule: true,
        deployConfig: empty,
        scheduleConfigKey: 'cronTriggers',
      }),
    ).toBe(true)
  })

  it('treats unreadable JSON as nothing set, without throwing', () => {
    expect(
      scheduleMissing({
        hasScheduledModule: true,
        deployConfig: '{nope',
        scheduleConfigKey: 'cronTriggers',
      }),
    ).toBe(true)
  })
})
