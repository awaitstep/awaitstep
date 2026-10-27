import { describe, expect, it } from 'vitest'
import { durationCompact, duration, formatDateTime, timeAgoOrDay } from '../time'

const T0 = '2026-01-05T12:00:00.000Z'

function plus(ms: number): string {
  return new Date(new Date(T0).getTime() + ms).toISOString()
}

describe('durationCompact', () => {
  it('formats sub-second durations in milliseconds', () => {
    expect(durationCompact(T0, plus(850))).toBe('850ms')
  })

  it('formats seconds', () => {
    expect(durationCompact(T0, plus(42_000))).toBe('42s')
  })

  it('formats minutes with remaining seconds', () => {
    expect(durationCompact(T0, plus(3 * 60_000 + 12_000))).toBe('3m 12s')
  })

  it('formats hours with remaining minutes', () => {
    expect(durationCompact(T0, plus(2 * 3_600_000 + 5 * 60_000))).toBe('2h 5m')
  })
})

describe('duration', () => {
  it('returns a placeholder while the run is still active', () => {
    expect(duration(T0, plus(5_000), 'running')).toBe('--')
    expect(duration(T0, plus(5_000), 'queued')).toBe('--')
  })

  it('formats milliseconds for sub-second durations', () => {
    expect(duration(T0, plus(500), 'complete')).toBe('500ms')
  })
})

describe('formatDateTime', () => {
  it('includes second precision', () => {
    expect(formatDateTime('2026-01-05T14:30:45')).toBe('Jan 5, 2026 2:30:45 PM')
  })
})

describe('timeAgoOrDay', () => {
  const NOW = new Date('2026-10-26T12:00:00.000Z')
  const ago = (ms: number) => new Date(NOW.getTime() - ms)

  it('reads short within a day', () => {
    expect(timeAgoOrDay(ago(20_000), NOW)).toBe('just now')
    expect(timeAgoOrDay(ago(5 * 60_000), NOW)).toBe('5m ago')
    expect(timeAgoOrDay(ago(3 * 3_600_000 + 59 * 60_000), NOW)).toBe('3h ago')
  })

  it('says Yesterday, then days, within a week', () => {
    expect(timeAgoOrDay(ago(30 * 3_600_000), NOW)).toBe('Yesterday')
    expect(timeAgoOrDay(ago(3 * 86_400_000), NOW)).toBe('3 days ago')
  })

  it('is the day once a week has passed', () => {
    expect(timeAgoOrDay('2026-10-12T09:30:00.000Z', NOW)).toBe('12 Oct')
  })
})
