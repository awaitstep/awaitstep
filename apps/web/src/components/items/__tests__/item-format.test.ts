import { describe, expect, it } from 'vitest'
import type { WorkspaceItem } from '../../../types/dashboard/items'
import { filterCounts, lastRunLabel, matchesFilter, runOutcomes, statusLabel } from '../item-format'

const NOW = new Date('2026-10-27T12:00:00Z')
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString()

function item(overrides: Partial<WorkspaceItem> = {}): WorkspaceItem {
  return {
    id: 'i',
    name: 'Lead enrichment',
    kind: 'workflow',
    workspaceId: 'w',
    description: null,
    status: 'deployed',
    version: 12,
    recentRuns: [],
    lastRun: null,
    sharing: null,
    usedBy: [],
    shareToggle: { allowed: true },
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  }
}

describe('item labels, in the boards’ words', () => {
  it('reads "Deployed · v12" or "Draft"', () => {
    expect(statusLabel(item())).toBe('Deployed · v12')
    expect(statusLabel(item({ status: 'draft', version: null }))).toBe('Draft')
  })

  it('reads the last run as "Failed 5m ago", "Succeeded 22m ago" or "Never run"', () => {
    const failed = item({ lastRun: { result: 'failed', at: minutesAgo(5) } })
    expect(lastRunLabel(failed, NOW)).toBe('Failed 5m ago')
    expect(lastRunLabel(item({ lastRun: { result: 'succeeded', at: minutesAgo(22) } }), NOW)).toBe(
      'Succeeded 22m ago',
    )
    expect(lastRunLabel(item(), NOW)).toBe('Never run')
  })

  it('draws only finished runs in the history bars', () => {
    expect(runOutcomes(item({ recentRuns: ['succeeded', 'running', 'failed'] }))).toEqual([
      'ok',
      'fail',
    ])
  })
})

describe('workflow filters', () => {
  const list = [
    item({ id: 'lead', lastRun: { result: 'failed', at: minutesAgo(5) } }),
    item({ id: 'quote', lastRun: { result: 'succeeded', at: minutesAgo(22) } }),
    item({ id: 'report', status: 'draft', version: null }),
  ]

  it('counts All, Deployed, Drafts and Failing', () => {
    expect(filterCounts(list)).toEqual({ all: 3, deployed: 2, draft: 1, failing: 1 })
  })

  it('keeps only the failing workflow under Failing', () => {
    expect(list.filter((i) => matchesFilter(i, 'failing')).map((i) => i.id)).toEqual(['lead'])
  })
})
