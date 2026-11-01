import { describe, expect, it } from 'vitest'
import type { RunHour } from '../../../types/dashboard/workspaces'
import { passedLabel, runBars } from '../runs-by-hour'

function hour(runs: number, complete = runs, failed = 0): RunHour {
  return { runs, complete, failed }
}

describe('passedLabel', () => {
  it('rounds the share of finished runs that passed to one decimal', () => {
    expect(passedLabel([hour(100, 96, 4), hour(28, 28)])).toBe('96.9% passed')
  })

  it('says 100% when nothing failed, without a trailing .0', () => {
    expect(passedLabel([hour(4)])).toBe('100% passed')
  })

  it('leaves runs still going out of the share', () => {
    expect(passedLabel([hour(3, 1, 1)])).toBe('50% passed')
  })

  it('is null while no run has finished', () => {
    expect(passedLabel([hour(0), hour(2, 0, 0)])).toBeNull()
    expect(passedLabel([])).toBeNull()
  })
})

describe('runBars', () => {
  it('scales every hour to the busiest one, with its failed part', () => {
    expect(runBars([hour(2), hour(4, 3, 1), hour(0)])).toEqual([
      { height: 0.5, failedHeight: 0 },
      { height: 1, failedHeight: 0.25 },
      { height: 0, failedHeight: 0 },
    ])
  })

  it('draws no bars for a day without runs', () => {
    expect(runBars([hour(0), hour(0)])).toEqual([
      { height: 0, failedHeight: 0 },
      { height: 0, failedHeight: 0 },
    ])
  })
})
