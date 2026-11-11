import { describe, expect, it } from 'vitest'
import type { ApiWorkflowRow, ApiWorkspaceRun } from '../../../../lib/dashboard-api'
import { runResult, toFailingItem, toRunPage, toWorkspaceItem, toWorkspaceRun } from '../runs'

const run = (over: Partial<ApiWorkspaceRun> = {}): ApiWorkspaceRun => ({
  id: 'r-1',
  workflowId: 'wf-1',
  versionId: 'v-1',
  versionNumber: 1,
  connectionId: null,
  instanceId: 'i-1',
  status: 'complete',
  output: null,
  error: null,
  createdAt: '2026-10-28T07:00:00.000Z',
  updatedAt: '2026-10-28T07:00:04.200Z',
  workflowName: 'Lead enrichment',
  kind: 'workflow',
  ...over,
})

describe('runResult', () => {
  it('folds the provider statuses into the three the pages show', () => {
    expect(runResult('complete')).toBe('succeeded')
    expect(runResult('errored')).toBe('failed')
    expect(runResult('terminated')).toBe('failed')
    for (const status of ['queued', 'running', 'paused', 'waiting', 'unknown']) {
      expect(runResult(status), status).toBe('running')
    }
  })
})

describe('toWorkspaceRun', () => {
  it('takes the duration from the row’s clocks, only once it has finished', () => {
    expect(toWorkspaceRun(run(), { name: 'A', kind: 'workflow' })).toMatchObject({
      result: 'succeeded',
      durationMs: 4200,
      trigger: null,
      failure: null,
      waitingOn: null,
      httpStatus: null,
    })
    expect(
      toWorkspaceRun(run({ status: 'running' }), { name: 'A', kind: 'script' }).durationMs,
    ).toBeNull()
  })

  it('carries the error as the failure, with no step', () => {
    const failed = toWorkspaceRun(run({ status: 'errored', error: 'Timeout' }), {
      name: 'A',
      kind: 'workflow',
    })
    expect(failed.failure).toEqual({ step: null, message: 'Timeout' })
    expect(
      toWorkspaceRun(run({ status: 'terminated' }), { name: 'A', kind: 'workflow' }).failure,
    ).toEqual({ step: null, message: 'The run failed' })
  })
})

describe('toRunPage / toFailingItem', () => {
  it('keeps the page’s counts and cursor and names the workflow on each row', () => {
    const page = toRunPage({
      data: [run()],
      nextCursor: 'c',
      counts: { all: 1, succeeded: 1, failed: 0, running: 0 },
    })
    expect(page.nextCursor).toBe('c')
    expect(page.counts.all).toBe(1)
    expect(page.data[0]).toMatchObject({ workflowName: 'Lead enrichment', kind: 'workflow' })

    const failing = toFailingItem({
      workflow: { id: 'wf-1', name: 'A', kind: 'workflow' },
      project: { slug: 'p', name: 'P' },
      workspace: { slug: 'w', name: 'W', colour: 'blue' },
      run: run({ status: 'errored', error: 'Boom' }),
    })
    expect(failing).toMatchObject({
      item: { id: 'wf-1', name: 'A', kind: 'workflow' },
      project: { slug: 'p' },
      workspace: { slug: 'w', name: 'W' },
      run: { result: 'failed', failure: { message: 'Boom' } },
    })
  })
})

describe('toWorkspaceItem', () => {
  const row = (over: Partial<ApiWorkflowRow> = {}): ApiWorkflowRow => ({
    id: 'wf-1',
    name: 'Lead enrichment',
    kind: 'workflow',
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-21T00:00:00.000Z',
    workspaceId: 'ws-1',
    deployStatus: 'success',
    deployVersionId: 'v-2',
    deployedVersion: 2,
    sharing: null,
    lastRunStatus: 'running',
    lastRunAt: '2026-10-28T07:00:00.000Z',
    recentRunStatuses: ['errored', 'complete', 'complete'],
    ...over,
  })

  it('reads deployed from the latest deployment and the bars from the finished runs, oldest first', () => {
    const item = toWorkspaceItem(row(), { allowed: false, reason: 'Only Editors can share' })
    expect(item).toMatchObject({
      status: 'deployed',
      version: 2,
      workspaceId: 'ws-1',
      description: null,
      recentRuns: ['succeeded', 'succeeded', 'failed'],
      lastRun: { result: 'failed', at: '2026-10-28T07:00:00.000Z' },
      sharing: null,
      usedBy: [],
    })
    expect(item.shareToggle).toEqual({ allowed: false, reason: 'Only Editors can share' })
  })

  it('carries the share and takes the switch’s state from the workspace’s capability', () => {
    const sharing = { sharedAt: '2026-10-29T10:00:00.000Z', sharedBy: { id: 'u-ama', name: 'Ama' } }
    const item = toWorkspaceItem(row({ sharing }), { allowed: true })
    expect(item.sharing).toEqual(sharing)
    expect(item.shareToggle).toEqual({ allowed: true })
  })

  it('is a draft with no runs when nothing has happened yet', () => {
    const draft = toWorkspaceItem(
      row({
        deployStatus: null,
        deployedVersion: null,
        lastRunStatus: null,
        lastRunAt: null,
        recentRunStatuses: [],
        kind: 'script',
      }),
      { allowed: true },
    )
    expect(draft).toMatchObject({
      status: 'draft',
      version: null,
      kind: 'script',
      recentRuns: [],
      lastRun: null,
    })
  })
})
