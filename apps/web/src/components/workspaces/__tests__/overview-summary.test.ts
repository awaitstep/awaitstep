import { describe, expect, it } from 'vitest'
import type { WorkspaceItem } from '../../../types/dashboard/items'
import type { WorkspaceRun } from '../../../types/dashboard/runs'
import {
  attentionDetail,
  attentionTitle,
  latestRunPerItem,
  needsAttention,
  sharedOutLabel,
  sharedSummary,
} from '../overview-summary'

const at = new Date().toISOString()

function item(overrides: Partial<WorkspaceItem>): WorkspaceItem {
  return {
    id: 'itm',
    name: 'Item',
    kind: 'workflow',
    workspaceId: 'ws',
    description: null,
    status: 'deployed',
    version: 1,
    recentRuns: [],
    lastRun: null,
    sharing: null,
    usedBy: [],
    shareToggle: { allowed: true },
    createdAt: at,
    updatedAt: at,
    ...overrides,
  }
}

const LEAD = item({
  id: 'lead',
  name: 'Lead enrichment',
  recentRuns: [...Array(7).fill('succeeded'), 'failed', 'failed', 'failed'],
  lastRun: { result: 'failed', at },
  sharing: { sharedAt: at, sharedBy: { id: 'u', name: 'Ama' } },
  usedBy: [{ id: 'ws_it', slug: 'it', name: 'IT', colour: 'blue' }],
})
const QUOTE = item({ id: 'quote', name: 'Quote follow-up', lastRun: { result: 'succeeded', at } })

const FAILED_RUN: WorkspaceRun = {
  id: 'run_8f2c',
  workflowId: 'lead',
  createdAt: at,
  workflowName: 'Lead enrichment',
  kind: 'workflow',
  result: 'failed',
  trigger: 'webhook',
  durationMs: 4200,
  waitingOn: null,
  httpStatus: null,
  failure: { step: 'Fetch company', message: 'CRM returned 429' },
}

describe('Needs attention', () => {
  it('lists items whose latest run failed, in the board’s words', () => {
    const [entry, ...rest] = needsAttention([LEAD, QUOTE], [FAILED_RUN])
    expect(rest).toHaveLength(0)
    expect(attentionTitle(entry!)).toBe('Lead enrichment failed at “Fetch company”')
    expect(attentionDetail(entry!)).toBe('3 of the last 10 runs failed · CRM returned 429')
  })

  it('still reads without the failed run’s details', () => {
    const [entry] = needsAttention([LEAD], [])
    expect(attentionTitle(entry!)).toBe('Lead enrichment failed')
    expect(attentionDetail(entry!)).toBe('3 of the last 10 runs failed')
  })
})

describe('Shared', () => {
  it('splits shared out from shared in and names who calls what', () => {
    const summary = sharedSummary([LEAD, QUOTE], [])
    expect(summary.out.map((i) => i.id)).toEqual(['lead'])
    expect(sharedOutLabel(LEAD)).toBe('Lead enrichment · used by IT')
    expect(sharedOutLabel(QUOTE)).toBe('Quote follow-up')
  })
})

describe('Recent runs', () => {
  it('takes each item’s latest finished run, newest first', () => {
    const run = (id: string, workflowId: string, result: WorkspaceRun['result']) => ({
      ...FAILED_RUN,
      id,
      workflowId,
      result,
    })
    const runs = [
      run('a', 'lead', 'failed'),
      run('b', 'quote', 'running'),
      run('c', 'quote', 'succeeded'),
      run('d', 'lead', 'failed'),
      run('e', 'triage', 'succeeded'),
      run('f', 'crm', 'succeeded'),
    ]
    expect(latestRunPerItem(runs, 3).map((r) => r.id)).toEqual(['a', 'c', 'e'])
  })
})
