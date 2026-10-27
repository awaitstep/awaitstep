import { describe, expect, it, vi } from 'vitest'
import { EXPORT_CAP, collectPages } from '../export-pages'

/** A list of `total` numbers served in pages, with offset cursors. */
function pagedList(total: number) {
  return vi.fn(async (cursor: string | undefined, limit: number) => {
    const offset = Number(cursor ?? 0)
    const end = Math.min(offset + limit, total)
    return {
      data: Array.from({ length: end - offset }, (_, i) => offset + i),
      nextCursor: end < total ? String(end) : null,
    }
  })
}

describe('collectPages', () => {
  it('walks every page in order until there is no next cursor', async () => {
    const fetchPage = pagedList(250)
    const rows = await collectPages(fetchPage)
    expect(rows).toHaveLength(250)
    expect(rows.slice(0, 3)).toEqual([0, 1, 2])
    expect(fetchPage.mock.calls.map(([cursor]) => cursor)).toEqual([undefined, '100', '200'])
  })

  it('stops at the export cap', async () => {
    const fetchPage = pagedList(5000)
    const rows = await collectPages(fetchPage)
    expect(rows).toHaveLength(EXPORT_CAP)
    expect(fetchPage).toHaveBeenCalledTimes(EXPORT_CAP / 100)
  })

  it('returns nothing for an empty list', async () => {
    expect(await collectPages(pagedList(0))).toEqual([])
  })
})
