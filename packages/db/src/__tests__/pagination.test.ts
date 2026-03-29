import { describe, it, expect } from 'vitest'
import { encodeCursor, decodeCursor, clampLimit, paginateResults } from '../pagination.js'

describe('encodeCursor / decodeCursor', () => {
  it('round-trips id and timestamp', () => {
    const id = 'abc123'
    const timestamp = '2026-03-29T10:00:00.000Z'
    const cursor = encodeCursor(id, timestamp)
    expect(cursor).toBe('abc123_2026-03-29T10:00:00.000Z')
    const decoded = decodeCursor(cursor)
    expect(decoded).toEqual({ id, timestamp })
  })

  it('handles id containing no underscores', () => {
    const cursor = encodeCursor('xyz', '2026-01-01T00:00:00.000Z')
    const decoded = decodeCursor(cursor)
    expect(decoded.id).toBe('xyz')
    expect(decoded.timestamp).toBe('2026-01-01T00:00:00.000Z')
  })

  it('handles id containing underscores (nanoid)', () => {
    const cursor = encodeCursor('a_b_c', '2026-01-01T00:00:00.000Z')
    const decoded = decodeCursor(cursor)
    expect(decoded.id).toBe('a_b_c')
    expect(decoded.timestamp).toBe('2026-01-01T00:00:00.000Z')
  })

  it('handles real nanoid with underscore', () => {
    const cursor = 'j9POQWTwz_f5j3j6TXAFJ_2026-03-29T17:15:06.223Z'
    const decoded = decodeCursor(cursor)
    expect(decoded.id).toBe('j9POQWTwz_f5j3j6TXAFJ')
    expect(decoded.timestamp).toBe('2026-03-29T17:15:06.223Z')
  })

  it('throws on invalid cursor (no underscore)', () => {
    expect(() => decodeCursor('nounderscore')).toThrow('Invalid cursor')
  })
})

describe('clampLimit', () => {
  it('returns default 50 when undefined', () => {
    expect(clampLimit()).toBe(50)
    expect(clampLimit(undefined)).toBe(50)
    expect(clampLimit(null)).toBe(50)
  })

  it('clamps to minimum 1', () => {
    expect(clampLimit(0)).toBe(1)
    expect(clampLimit(-5)).toBe(1)
  })

  it('clamps to maximum 100', () => {
    expect(clampLimit(200)).toBe(100)
    expect(clampLimit(999)).toBe(100)
  })

  it('passes through valid values', () => {
    expect(clampLimit(1)).toBe(1)
    expect(clampLimit(50)).toBe(50)
    expect(clampLimit(100)).toBe(100)
  })
})

describe('paginateResults', () => {
  const makeRow = (id: string, createdAt: string) => ({ id, createdAt })

  it('returns all rows with no nextCursor when under limit', () => {
    const rows = [makeRow('a', '2026-03-01'), makeRow('b', '2026-02-01')]
    const result = paginateResults(rows, 5, (r) => r.createdAt)
    expect(result.data).toHaveLength(2)
    expect(result.nextCursor).toBeNull()
  })

  it('returns all rows with no nextCursor when exactly at limit', () => {
    const rows = [makeRow('a', '2026-03-01'), makeRow('b', '2026-02-01')]
    const result = paginateResults(rows, 2, (r) => r.createdAt)
    expect(result.data).toHaveLength(2)
    expect(result.nextCursor).toBeNull()
  })

  it('trims to limit and returns nextCursor when over limit', () => {
    const rows = [
      makeRow('a', '2026-03-01'),
      makeRow('b', '2026-02-01'),
      makeRow('c', '2026-01-01'),
    ]
    const result = paginateResults(rows, 2, (r) => r.createdAt)
    expect(result.data).toHaveLength(2)
    expect(result.data.map((r) => r.id)).toEqual(['a', 'b'])
    expect(result.nextCursor).toBe('b_2026-02-01')
  })

  it('returns null nextCursor for empty rows', () => {
    const result = paginateResults([], 10, (r: { id: string; createdAt: string }) => r.createdAt)
    expect(result.data).toHaveLength(0)
    expect(result.nextCursor).toBeNull()
  })
})
