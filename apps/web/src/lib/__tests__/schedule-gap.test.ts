import { describe, expect, it } from 'vitest'
import { scheduleMissing } from '../ide/schedule-gap'

const cronIr = JSON.stringify({ trigger: { type: 'cron', expression: '0 * * * *' } })
const manualIr = JSON.stringify({ trigger: { type: 'manual' } })

describe('scheduleMissing', () => {
  it('is false without a scheduled handler, whatever else is set', () => {
    expect(scheduleMissing({ hasScheduledModule: false, deployConfig: null, ir: null })).toBe(false)
  })

  it('is true for a scheduled handler with no cron anywhere, even before the first save', () => {
    expect(scheduleMissing({ hasScheduledModule: true, deployConfig: null, ir: null })).toBe(true)
    expect(scheduleMissing({ hasScheduledModule: true, deployConfig: '{}', ir: manualIr })).toBe(
      true,
    )
  })

  it('is false when the workflow trigger is a schedule', () => {
    expect(scheduleMissing({ hasScheduledModule: true, deployConfig: null, ir: cronIr })).toBe(
      false,
    )
  })

  it('is false when the deployment config names a cron, and true for an empty list', () => {
    const named = JSON.stringify({ cronTriggers: ['*/5 * * * *'] })
    expect(scheduleMissing({ hasScheduledModule: true, deployConfig: named, ir: null })).toBe(false)
    const empty = JSON.stringify({ cronTriggers: [] })
    expect(scheduleMissing({ hasScheduledModule: true, deployConfig: empty, ir: null })).toBe(true)
  })

  it('treats unreadable JSON as nothing set, without throwing', () => {
    expect(scheduleMissing({ hasScheduledModule: true, deployConfig: '{nope', ir: 'x' })).toBe(true)
  })
})
