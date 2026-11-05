import { describe, expect, it } from 'vitest'
import { runDurationMs, runResult } from '../run-result'

describe('runResult', () => {
  it('reads a run the way the boards say it', () => {
    expect(runResult('complete')).toBe('succeeded')
    expect(runResult('errored')).toBe('failed')
    expect(runResult('terminated')).toBe('failed')
    for (const status of ['queued', 'running', 'paused', 'waiting']) {
      expect(runResult(status)).toBe('running')
    }
  })

  it('times only a run that has ended', () => {
    const at = '2026-11-05T09:00:00.000Z'
    const later = '2026-11-05T09:00:01.200Z'
    expect(runDurationMs({ status: 'complete', createdAt: at, updatedAt: later })).toBe(1200)
    expect(runDurationMs({ status: 'running', createdAt: at, updatedAt: later })).toBeNull()
  })
})
