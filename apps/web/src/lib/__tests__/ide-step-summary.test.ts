import { describe, expect, it } from 'vitest'
import type { RunStep } from '../api-client'
import {
  nodeMeta,
  previewSyncLabel,
  stepMeta,
  stepSettings,
  stepsForNode,
  summarizeNodeRun,
  versionLabel,
  type SummaryNode,
} from '../ide/step-summary'

function node(overrides: Partial<SummaryNode> = {}): SummaryNode {
  return { id: 'n1', type: 'step', data: {}, ...overrides }
}

function runStep(overrides: Partial<RunStep> = {}): RunStep {
  return {
    id: 's1',
    runId: 'r1',
    nodeId: 'n1',
    stepName: 'n1',
    kind: 'do',
    stepIndex: 1,
    status: 'complete',
    attemptCount: 1,
    error: null,
    startedAt: '2026-11-05T10:00:00.000Z',
    endedAt: '2026-11-05T10:00:00.412Z',
    createdAt: '2026-11-05T10:00:00.000Z',
    updatedAt: '2026-11-05T10:00:00.412Z',
    ...overrides,
  }
}

describe('nodeMeta', () => {
  it('describes a non-step node by kind and settings', () => {
    expect(nodeMeta(node({ type: 'try_catch' }))).toBe('try/catch')
    expect(nodeMeta(node({ type: 'branch' }), { arms: 2 })).toBe('branch · 2 arms')
    expect(nodeMeta(node({ type: 'parallel' }), { arms: 1 })).toBe('parallel · 1 arm')
    expect(nodeMeta(node({ type: 'http_request', data: { method: 'POST' } }))).toBe('http POST')
    expect(nodeMeta(node({ type: 'sleep', data: { duration: '10 seconds' } }))).toBe('sleep 10s')
    expect(nodeMeta(node({ type: 'sleep' }))).toBe('sleep')
    expect(nodeMeta(node({ type: 'loop', data: { loopType: 'while' } }))).toBe('loop while')
    expect(nodeMeta(node({ type: 'wait_for_event', data: { eventType: 'order.paid' } }))).toBe(
      'wait for order.paid',
    )
    expect(nodeMeta(node({ type: 'sub_workflow' }))).toBe('sub-workflow')
  })

  it('covers the kinds that carry no settings', () => {
    expect(nodeMeta(node({ type: 'race' }), { arms: 2 })).toBe('race · 2 arms')
    expect(nodeMeta(node({ type: 'sleep_until' }))).toBe('sleep until a time')
    expect(nodeMeta(node({ type: 'break' }))).toBe('break')
    expect(nodeMeta(node({ type: 'sub_script' }))).toBe('sub-script')
    expect(nodeMeta(node({ type: 'ollama' }))).toBe('ollama')
    expect(nodeMeta(node({ type: 'sleep', data: { duration: 90_000 } }))).toBe('sleep 1m 30s')
  })

  it('falls back when a setting is blank instead of printing a dangling label', () => {
    expect(nodeMeta(node({ type: 'loop', data: { loopType: '   ' } }))).toBe('loop forEach')
    expect(nodeMeta(node({ type: 'http_request', data: { method: '' } }))).toBe('http GET')
    expect(nodeMeta(node({ type: 'wait_for_event', data: { eventType: '  ' } }))).toBe(
      'wait for an event',
    )
    expect(nodeMeta(node({ type: 'sleep', data: { duration: '   ' } }))).toBe('sleep')
  })

  it('lets a step keep the step summary', () => {
    expect(nodeMeta(node())).toBeNull()
    expect(nodeMeta(node({ data: { retryLimit: 2 } }))).toBe('retries 2')
  })
})

describe('stepSettings', () => {
  it('says Default for an unset retry policy and timeout on a step', () => {
    expect(stepSettings(node())).toEqual({ retries: 'Default', timeout: 'Default' })
  })

  it('words the retry policy the way the canvas sets it', () => {
    const settings = stepSettings(
      node({
        data: {
          retryLimit: 3,
          retryDelay: '10 seconds',
          backoff: 'exponential',
          timeout: '30 seconds',
        },
      }),
    )
    expect(settings).toEqual({ retries: '3 retries · exponential from 10s', timeout: '30s' })
  })

  it('shows a constant delay as the gap between attempts', () => {
    expect(stepSettings(node({ data: { retryLimit: 2, retryDelay: '5 minutes' } })).retries).toBe(
      '2 retries · 5m apart',
    )
    expect(stepSettings(node({ data: { retryLimit: 1, backoff: 'constant' } })).retries).toBe(
      '1 retry · 10s apart',
    )
  })

  it('fills the half that is missing with what the step emits', () => {
    expect(stepSettings(node({ data: { retryDelay: '2 seconds' } })).retries).toBe(
      '5 retries · 2s apart',
    )
  })

  it('reads a retry policy stored on the node’s config', () => {
    const settings = stepSettings(
      node({
        type: 'webhook-post',
        config: { retries: { limit: 4, delay: 1500, backoff: 'linear' }, timeout: 2000 },
      }),
    )
    expect(settings).toEqual({ retries: '4 retries · linear from 1s', timeout: '2s' })
  })

  it('shows an http request no policy until it is durable, then its loose fields', () => {
    // A new HTTP node stores retryLimit 5 but runs no step, so nothing applies.
    expect(stepSettings(node({ type: 'http_request', data: { retryLimit: 5 } }))).toEqual({
      retries: null,
      timeout: null,
    })
    expect(
      stepSettings(node({ type: 'http_request', data: { retryLimit: 5, durable: true } })).retries,
    ).toBe('5 retries · 10s apart')
    expect(
      stepSettings(
        node({
          type: 'http_request',
          data: { durable: true },
          config: { retries: { limit: 2, delay: '3 seconds' } },
        }),
      ).retries,
    ).toBe('2 retries · 3s apart')
  })

  it('shows a sub_script and a registry node only their config', () => {
    for (const type of ['sub_script', 'github-issue']) {
      expect(stepSettings(node({ type, data: { retryLimit: 9, timeout: '1 hour' } }))).toEqual({
        retries: 'Default',
        timeout: 'Default',
      })
    }
  })

  it('says nothing about a sub_workflow, whose timeout the generated code ignores', () => {
    expect(stepSettings(node({ type: 'sub_workflow', data: { timeout: '5 minutes' } }))).toEqual({
      retries: null,
      timeout: null,
    })
  })

  it('gives only a timeout to kinds that have no retries', () => {
    expect(stepSettings(node({ type: 'wait_for_event', data: { timeout: '24 hours' } }))).toEqual({
      retries: null,
      timeout: '24h',
    })
    expect(stepSettings(node({ type: 'wait_for_event' }))).toEqual({
      retries: null,
      timeout: 'Default',
    })
  })

  it('leaves both out for kinds with neither', () => {
    for (const type of ['sleep', 'branch', 'parallel', 'loop', 'try_catch', 'race', 'break']) {
      expect(stepSettings(node({ type }))).toEqual({ retries: null, timeout: null })
    }
  })

  it('does not claim a policy for an inline step, which is not durable', () => {
    const settings = stepSettings(node({ data: { inline: true, retryLimit: 3 } }))
    expect(settings.retries).toMatch(/^Not used/)
    expect(settings.timeout).toMatch(/^Not used/)
  })
})

describe('stepSettings in a function', () => {
  it('reads an unset policy as none: the in-request host retries and times out only when asked', () => {
    expect(stepSettings(node(), { kind: 'script' })).toEqual({
      retries: 'None — runs once',
      timeout: 'None',
    })
  })

  it('words a set policy as it does for a workflow step', () => {
    const settings = stepSettings(
      node({
        data: { retryLimit: 3, retryDelay: '10 seconds', backoff: 'linear', timeout: '30 seconds' },
      }),
      { kind: 'script' },
    )
    expect(settings).toEqual({ retries: '3 retries · linear from 10s', timeout: '30s' })
  })

  it('gives the Steps list no line for an unset policy, rather than "timeout None"', () => {
    expect(stepMeta(node(), { kind: 'script' })).toBeNull()
    // A duration field left empty writes '' — still unset.
    expect(stepMeta(node({ data: { retryDelay: '' } }), { kind: 'script' })).toBeNull()
    expect(stepSettings(node({ data: { retryDelay: '' } }), { kind: 'script' }).retries).toBe(
      'None — runs once',
    )
    expect(stepMeta(node({ data: { retryLimit: 2 } }), { kind: 'script' })).toBe('retries 2')
    expect(stepMeta(node({ data: { timeout: '30 seconds' } }), { kind: 'script' })).toBe(
      'timeout 30s',
    )
  })

  it('still calls an inline step not durable', () => {
    expect(stepSettings(node({ data: { inline: true } }), { kind: 'script' })).toEqual({
      retries: 'Not used — runs inline',
      timeout: 'Not used — runs inline',
    })
  })

  it('reports a durable http request’s policy in a function, where its step retries', () => {
    const http = node({
      type: 'http_request',
      data: { durable: true },
      config: { retries: { limit: 2, delay: '1 second' }, timeout: '5 seconds' },
    })
    expect(stepSettings(http, { kind: 'script' })).toEqual({
      retries: '2 retries · 1s apart',
      timeout: '5s',
    })
    expect(stepSettings(node({ type: 'http_request' }), { kind: 'script' })).toEqual({
      retries: null,
      timeout: null,
    })
    expect(stepSettings(node({ type: 'sleep' }), { kind: 'script' })).toEqual({
      retries: null,
      timeout: null,
    })
  })
})

describe('stepMeta', () => {
  it('shows what was set and nothing for defaults', () => {
    expect(stepMeta(node())).toBeNull()
    expect(stepMeta(node({ data: { retryLimit: 3 } }))).toBe('retries 3')
    expect(stepMeta(node({ data: { retryLimit: 3, timeout: '30 seconds' } }))).toBe(
      'retries 3 · timeout 30s',
    )
    expect(stepMeta(node({ type: 'http_request', data: { retryLimit: 5 } }))).toBeNull()
    expect(stepMeta(node({ type: 'http_request', data: { retryLimit: 5, durable: true } }))).toBe(
      'retries 5',
    )
  })
})

describe('stepsForNode', () => {
  const steps = [runStep({ nodeId: 'leader' }), runStep({ id: 's2', nodeId: 'other' })]

  it('takes the node’s own rows', () => {
    expect(stepsForNode(steps, {}, 'other').map((s) => s.id)).toEqual(['s2'])
  })

  it('takes the leader’s rows for a node whose code ran inside a merged step', () => {
    expect(stepsForNode(steps, { member: 'leader' }, 'member').map((s) => s.id)).toEqual(['s1'])
  })

  it('has nothing for a node the run did not report', () => {
    expect(stepsForNode(steps, {}, 'absent')).toEqual([])
  })
})

describe('summarizeNodeRun', () => {
  it('has nothing to say without rows', () => {
    expect(summarizeNodeRun([])).toBeNull()
  })

  it('reports a completed step with its time and attempts', () => {
    expect(summarizeNodeRun([runStep()])).toMatchObject({
      tone: 'ok',
      headline: 'Complete',
      detail: '412ms · 1 attempt',
    })
  })

  it('reports an error with the attempts it took and the first line of the message', () => {
    const summary = summarizeNodeRun([
      runStep({
        status: 'errored',
        attemptCount: 3,
        error: '\nCard declined\n  at charge (charge.ts:4)',
      }),
    ])
    expect(summary).toEqual({
      tone: 'error',
      headline: 'Errored after 3 attempts',
      detail: null,
      error: 'Card declined',
      occurrences: 1,
    })
  })

  it('reports an error with no message without inventing one', () => {
    expect(summarizeNodeRun([runStep({ status: 'errored', attemptCount: 1 })])?.error).toBeNull()
  })

  it('lets the worst of several iterations speak, and counts them', () => {
    const summary = summarizeNodeRun([
      runStep({ id: 'a', stepIndex: 1 }),
      runStep({ id: 'b', stepIndex: 2, status: 'errored', attemptCount: 2, error: 'boom' }),
      runStep({ id: 'c', stepIndex: 3 }),
    ])
    expect(summary).toMatchObject({
      tone: 'error',
      headline: 'Errored after 2 attempts',
      occurrences: 3,
    })
  })

  it('shows a step still going as active, without a duration', () => {
    expect(summarizeNodeRun([runStep({ status: 'running', endedAt: null })])).toMatchObject({
      tone: 'active',
      headline: 'Running',
      detail: null,
    })
    expect(summarizeNodeRun([runStep({ status: 'waiting' })])?.headline).toBe('Waiting')
  })

  it('leaves the duration out of a completed step with no timestamps', () => {
    expect(summarizeNodeRun([runStep({ startedAt: null, endedAt: null })])?.detail).toBe(
      '1 attempt',
    )
  })
})

describe('versionLabel and previewSyncLabel', () => {
  const versions = [
    { id: 'a', version: 11 },
    { id: 'b', version: 12 },
    { id: 'c', version: 13 },
  ]

  it('names a version, or nothing once it is gone', () => {
    expect(versionLabel('a', versions)).toBe('v11')
    expect(versionLabel('zzz', versions)).toBeNull()
    expect(versionLabel(null, versions)).toBeNull()
  })

  it('says the preview is synced when graph and code are one version', () => {
    expect(previewSyncLabel({ graphVersionId: 'b', codeVersionId: 'b', versions })).toBe(
      'Synced with v12',
    )
  })

  it('says which is which when they differ', () => {
    expect(previewSyncLabel({ graphVersionId: 'b', codeVersionId: 'c', versions })).toBe(
      'Showing v12 · you’re editing v13',
    )
  })

  it('claims nothing when the graph’s version is unknown', () => {
    expect(previewSyncLabel({ graphVersionId: 'zzz', codeVersionId: 'b', versions })).toBeNull()
  })

  it('never says synced for code from a version it does not know (a newer save)', () => {
    const label = previewSyncLabel({ graphVersionId: 'b', codeVersionId: 'zzz', versions })
    expect(label).toBe('Showing v12 · the code is newer')
    expect(label).not.toMatch(/Synced/)
  })

  it('claims nothing before the code has loaded', () => {
    expect(previewSyncLabel({ graphVersionId: 'b', codeVersionId: null, versions })).toBeNull()
  })
})

describe('stepsForNode with prototype-named node ids', () => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'finds the steps of a node whose id is %s',
    (id) => {
      const steps = [runStep({ id: 's1', nodeId: id })]
      expect(stepsForNode(steps, {}, id).map((s) => s.id)).toEqual(['s1'])
    },
  )
})
