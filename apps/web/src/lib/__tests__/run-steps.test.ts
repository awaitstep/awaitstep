import { describe, it, expect } from 'vitest'
import type { RunStep } from '../api-client'
import {
  buildRunTimeline,
  graphShapeOf,
  isInterruptedStep,
  mapRunStepsToNodeStatuses,
  stepToNodeStatus,
} from '../run-steps'

function step(overrides: Partial<RunStep> = {}): RunStep {
  return {
    id: `rs-${Math.random().toString(36).slice(2)}`,
    runId: 'run-1',
    nodeId: null,
    stepName: 'fetch',
    kind: 'do',
    stepIndex: 1,
    status: 'complete',
    attemptCount: 1,
    error: null,
    startedAt: '2026-10-15T00:00:00.000Z',
    endedAt: '2026-10-15T00:00:02.000Z',
    createdAt: '2026-10-15T00:00:00.000Z',
    updatedAt: '2026-10-15T00:00:02.000Z',
    ...overrides,
  }
}

describe('isInterruptedStep', () => {
  it('flags in-flight steps only once the run is over', () => {
    const inFlight = step({ status: 'running', endedAt: null })
    expect(isInterruptedStep(inFlight, 'running')).toBe(false)
    expect(isInterruptedStep(inFlight, 'terminated')).toBe(true)
    expect(isInterruptedStep(step({ status: 'complete' }), 'terminated')).toBe(false)
  })
})

describe('stepToNodeStatus', () => {
  it('animates both running and waiting as in-progress', () => {
    expect(stepToNodeStatus('running')).toBe('running')
    expect(stepToNodeStatus('waiting')).toBe('running')
    expect(stepToNodeStatus('complete')).toBe('complete')
    expect(stepToNodeStatus('errored')).toBe('errored')
  })
})

describe('mapRunStepsToNodeStatuses', () => {
  const nodeIds = ['fetch', 'loop', 'work', 'follow', 'branch', 'sub-1']

  it('attributes rows by nodeId, then by label base (loop and derived suffixes stripped)', () => {
    const statuses = mapRunStepsToNodeStatuses(
      nodeIds,
      [
        step({ nodeId: 'fetch', stepName: 'fetch' }),
        step({ nodeId: null, stepName: 'work [0]', status: 'running' }),
        step({ nodeId: null, stepName: 'sub-1--await', status: 'complete' }),
      ],
      {},
      'running',
    )
    expect(statuses.fetch).toBe('complete')
    expect(statuses.work).toBe('running')
    expect(statuses['sub-1']).toBe('complete')
  })

  it('keeps the most urgent status across repeated rows (loop iterations)', () => {
    const statuses = mapRunStepsToNodeStatuses(
      nodeIds,
      [
        step({ stepName: 'work [0]', status: 'complete' }),
        step({ stepName: 'work [1]', status: 'errored' }),
        step({ stepName: 'work [2]', status: 'complete' }),
      ],
      {},
      'errored',
    )
    expect(statuses.work).toBe('errored')
  })

  it('mirrors the leader status onto coalesced members', () => {
    const statuses = mapRunStepsToNodeStatuses(
      nodeIds,
      [step({ nodeId: 'fetch', status: 'running' })],
      { follow: 'fetch' },
      'running',
    )
    expect(statuses.follow).toBe('running')
  })

  it('marks unreported nodes pending while active and leaves them unstyled when terminal', () => {
    const active = mapRunStepsToNodeStatuses(nodeIds, [step({ nodeId: 'fetch' })], {}, 'running')
    expect(active.branch).toBe('pending')
    const done = mapRunStepsToNodeStatuses(nodeIds, [step({ nodeId: 'fetch' })], {}, 'complete')
    expect(done.branch).toBeUndefined()
    expect(done.fetch).toBe('complete')
  })

  it('reads interrupted steps as pending, not running, once the run is terminal', () => {
    const rows = [step({ nodeId: 'fetch', status: 'running', endedAt: null })]
    expect(mapRunStepsToNodeStatuses(nodeIds, rows, {}, 'running').fetch).toBe('running')
    expect(mapRunStepsToNodeStatuses(nodeIds, rows, {}, 'terminated').fetch).toBe('pending')
  })

  it('ignores rows that map to no known node', () => {
    const statuses = mapRunStepsToNodeStatuses(
      nodeIds,
      [step({ nodeId: null, stepName: 'ghost' })],
      {},
      'complete',
    )
    expect(Object.keys(statuses)).toEqual([])
  })
})

describe('the canvas overlay of a run', () => {
  // entry → branch; the branch's then-path runs a, its else-path b; a try/catch holds c;
  // a wait w with a timeout.
  const node = (id: string, type: string) =>
    ({
      id,
      type,
      name: id,
      position: { x: 0, y: 0 },
      version: '1',
      provider: 'cloudflare',
      data: {},
    }) as never
  const graph = {
    nodes: [
      node('entry', 'step'),
      node('br', 'branch'),
      node('a', 'step'),
      node('b', 'step'),
      node('tc', 'try_catch'),
      node('c', 'step'),
      node('h', 'step'),
      node('w', 'wait_for_event'),
    ],
    edges: [
      { id: 'e1', source: 'entry', target: 'br' },
      { id: 'e2', source: 'br', target: 'a', label: 'then' },
      { id: 'e3', source: 'br', target: 'b', label: 'else' },
      { id: 'e4', source: 'tc', target: 'c', label: 'try' },
      { id: 'e5', source: 'tc', target: 'h', label: 'catch' },
    ],
  }
  const ids = graph.nodes.map((n: { id: string }) => n.id)
  const containment = graphShapeOf(graph)

  it('colours nothing for a run that reported no steps (it never started, or is gone)', () => {
    // Nothing is guessed from the graph: both arms of a wait were painted done before.
    expect(mapRunStepsToNodeStatuses(ids, [], {}, 'errored', containment)).toEqual({})
  })

  it('colours the nodes that report no step but certainly ran — never an arm nothing says ran', () => {
    // The example: entry → sleep → step → wait (onEvent: sunny, onTimeout: no_sunny) → after.
    const example = {
      nodes: ['entry', 'sleep', 'step1', 'wait', 'sunny', 'no_sunny', 'after'].map((id) =>
        node(id, id === 'wait' ? 'wait_for_event' : id === 'sleep' ? 'sleep' : 'step'),
      ),
      edges: [
        { id: 'a', source: 'entry', target: 'sleep' },
        { id: 'b', source: 'sleep', target: 'step1' },
        { id: 'c', source: 'step1', target: 'wait' },
        { id: 'd', source: 'wait', target: 'sunny', label: 'onEvent' },
        { id: 'e', source: 'wait', target: 'no_sunny', label: 'onTimeout' },
        { id: 'f', source: 'sunny', target: 'after' },
        { id: 'g', source: 'no_sunny', target: 'after' },
      ],
    }
    const statuses = mapRunStepsToNodeStatuses(
      example.nodes.map((n: { id: string }) => n.id),
      [
        step({ stepName: 'sleep-1', kind: 'sleep' }),
        step({ stepName: 'step1-1' }),
        step({
          stepName: 'wait-1',
          kind: 'waitForEvent',
          status: 'errored',
          error: 'WorkflowTimeoutError: Execution timed out after 30000ms',
        }),
        step({ stepName: 'after-1' }),
      ],
      {},
      'complete',
      graphShapeOf(example),
    )
    expect(statuses).toMatchObject({
      entry: 'complete', // everything after it ran
      wait: 'timed_out',
      no_sunny: 'complete', // the arm a timed-out wait takes, and the step after it ran
      after: 'complete',
    })
    expect(statuses.sunny).toBeUndefined()
  })

  it('colours a merge the taken arm of a wait leads into, and what runs after it', () => {
    // The run in the report: a wait whose onTimeout edge goes straight to the
    // merge ("Say Hello", inline), then an inline "Exit". Neither reports a step.
    const graph = {
      nodes: ['entry', 'sleep', 'wait', 'sunny', 'say_hello', 'exit'].map((id) =>
        node(id, id === 'wait' ? 'wait_for_event' : id === 'sleep' ? 'sleep' : 'step'),
      ),
      edges: [
        { id: 'a', source: 'entry', target: 'sleep' },
        { id: 'b', source: 'sleep', target: 'wait' },
        { id: 'c', source: 'wait', target: 'sunny', label: 'onEvent' },
        { id: 'd', source: 'wait', target: 'say_hello', label: 'onTimeout' },
        { id: 'e', source: 'sunny', target: 'say_hello' },
        { id: 'f', source: 'say_hello', target: 'exit' },
      ],
    }
    const statuses = mapRunStepsToNodeStatuses(
      graph.nodes.map((n: { id: string }) => n.id),
      [
        step({ stepName: 'sleep-1', kind: 'sleep' }),
        step({
          stepName: 'wait-1',
          kind: 'waitForEvent',
          status: 'errored',
          error: 'WorkflowTimeoutError: Execution timed out after 30000ms',
        }),
      ],
      {},
      'complete',
      graphShapeOf(graph),
    )
    expect(statuses).toMatchObject({
      entry: 'complete',
      wait: 'timed_out',
      say_hello: 'complete',
      exit: 'complete',
    })
    expect(statuses.sunny).toBeUndefined()
  })

  it('leaves a merge alone while the run is still going and nothing after it reported', () => {
    const graph = {
      nodes: ['wait', 'sunny', 'merge'].map((id) =>
        node(id, id === 'wait' ? 'wait_for_event' : 'step'),
      ),
      edges: [
        { id: 'c', source: 'wait', target: 'sunny', label: 'onEvent' },
        { id: 'd', source: 'wait', target: 'merge', label: 'onTimeout' },
        { id: 'e', source: 'sunny', target: 'merge' },
      ],
    }
    const statuses = mapRunStepsToNodeStatuses(
      ['wait', 'sunny', 'merge'],
      [
        step({
          stepName: 'wait-1',
          kind: 'waitForEvent',
          status: 'errored',
          error: 'WorkflowTimeoutError: Execution timed out after 30000ms',
        }),
      ],
      {},
      'running',
      graphShapeOf(graph),
    )
    expect(statuses.merge).toBe('pending')
  })

  it('leaves a branch join unstyled when nothing says which arm ran', () => {
    const graph = {
      nodes: [
        node('entry', 'step'),
        node('br', 'branch'),
        node('a', 'step'),
        node('b', 'step'),
        node('j', 'step'),
      ],
      edges: [
        { id: '1', source: 'entry', target: 'br' },
        { id: '2', source: 'br', target: 'a', label: 'yes' },
        { id: '3', source: 'br', target: 'b', label: 'no' },
        { id: '4', source: 'a', target: 'j' },
        { id: '5', source: 'b', target: 'j' },
      ],
    }
    const statuses = mapRunStepsToNodeStatuses(
      ['entry', 'br', 'a', 'b', 'j'],
      [],
      {},
      'complete',
      graphShapeOf(graph),
    )
    expect(statuses.a).toBeUndefined()
    expect(statuses.b).toBeUndefined()
    expect(statuses.j).toBeUndefined()
  })

  it('never infers which arm of a branch ran', () => {
    const statuses = mapRunStepsToNodeStatuses(
      ids,
      [step({ stepName: 'entry' })],
      {},
      'complete',
      containment,
    )
    expect(statuses.a).toBeUndefined()
    expect(statuses.b).toBeUndefined()
  })

  it('reads the entry of a completed run as done even when no step was durable', () => {
    expect(mapRunStepsToNodeStatuses(ids, [], {}, 'complete', containment).entry).toBe('complete')
  })

  it('names a step Cloudflare reported with its occurrence count', () => {
    const statuses = mapRunStepsToNodeStatuses(
      ids,
      [step({ stepName: 'entry-1', status: 'complete' })],
      {},
      'complete',
    )
    expect(statuses.entry).toBe('complete')
  })

  it('reads a wait that timed out as timed out, not failed', () => {
    const statuses = mapRunStepsToNodeStatuses(
      ids,
      [
        step({
          stepName: 'w-1',
          kind: 'waitForEvent',
          status: 'errored',
          error: 'WorkflowTimeoutError: Execution timed out after 30000ms',
        }),
      ],
      {},
      'complete',
    )
    expect(statuses.w).toBe('timed_out')
  })

  it('colours a container from its children: green done, red failed, blue running', () => {
    const done = mapRunStepsToNodeStatuses(
      ids,
      [step({ stepName: 'a' })],
      {},
      'complete',
      containment,
    )
    expect(done.br).toBe('complete')
    const failed = mapRunStepsToNodeStatuses(
      ids,
      [step({ stepName: 'a', status: 'errored' })],
      {},
      'errored',
      containment,
    )
    expect(failed.br).toBe('errored')
    const running = mapRunStepsToNodeStatuses(
      ids,
      [step({ stepName: 'a', status: 'running', endedAt: null })],
      {},
      'running',
      containment,
    )
    expect(running.br).toBe('running')
  })

  it('reads a try/catch that handled a failure as done, with the failed step still red', () => {
    const statuses = mapRunStepsToNodeStatuses(
      ids,
      [step({ stepName: 'c', status: 'errored' }), step({ stepName: 'h' })],
      {},
      'complete',
      containment,
    )
    expect(statuses.c).toBe('errored')
    expect(statuses.tc).toBe('complete')
  })

  it('reads a branch the completed run went through as done, and neither arm', () => {
    const statuses = mapRunStepsToNodeStatuses(
      ids,
      [step({ stepName: 'entry' })],
      {},
      'complete',
      containment,
    )
    expect(statuses.br).toBe('complete')
    expect(statuses.a).toBeUndefined()
    expect(statuses.b).toBeUndefined()
  })
})

describe('buildRunTimeline', () => {
  const now = new Date('2026-10-15T00:00:10.000Z')
  const active = { status: 'running', endedAt: null }

  it('lays rows out from the earliest start with measured durations', () => {
    const timeline = buildRunTimeline(
      [
        step({
          id: 'a',
          startedAt: '2026-10-15T00:00:01.000Z',
          endedAt: '2026-10-15T00:00:03.000Z',
        }),
        step({
          id: 'b',
          startedAt: '2026-10-15T00:00:00.000Z',
          endedAt: '2026-10-15T00:00:02.000Z',
        }),
      ],
      active,
      now,
    )
    expect(timeline.rows.map((r) => r.id)).toEqual(['b', 'a'])
    expect(timeline.rows[1]).toMatchObject({ startOffsetMs: 1000, durationMs: 2000 })
    expect(timeline.spanMs).toBe(3000)
    expect(timeline.billableSteps).toBe(2)
  })

  it('extends in-flight steps of an active run to now', () => {
    const timeline = buildRunTimeline(
      [step({ status: 'running', startedAt: '2026-10-15T00:00:04.000Z', endedAt: null })],
      active,
      now,
    )
    expect(timeline.rows[0]).toMatchObject({ durationMs: 6000, interrupted: false })
  })

  it('caps interrupted steps at the run end instead of growing forever', () => {
    const timeline = buildRunTimeline(
      [step({ status: 'running', startedAt: '2026-10-15T00:00:04.000Z', endedAt: null })],
      { status: 'terminated', endedAt: '2026-10-15T00:00:06.000Z' },
      new Date('2026-10-18T00:00:00.000Z'),
    )
    expect(timeline.rows[0]).toMatchObject({ durationMs: 2000, interrupted: true })
    expect(timeline.spanMs).toBe(2000)
  })

  it('lists steps without timing at zero width', () => {
    const timeline = buildRunTimeline([step({ startedAt: null, endedAt: null })], active, now)
    expect(timeline.rows[0]).toMatchObject({ startOffsetMs: 0, durationMs: 0 })
    expect(timeline.spanMs).toBe(1)
  })

  it('treats an end without a start as no timing rather than measuring from the origin', () => {
    const timeline = buildRunTimeline(
      [
        step({
          id: 'a',
          startedAt: '2026-10-15T00:00:00.000Z',
          endedAt: '2026-10-15T00:00:01.000Z',
        }),
        step({ id: 'b', startedAt: null, endedAt: '2026-10-15T00:00:09.000Z' }),
      ],
      active,
      now,
    )
    expect(timeline.rows.find((r) => r.id === 'b')).toMatchObject({
      startOffsetMs: 0,
      durationMs: 0,
    })
    expect(timeline.spanMs).toBe(1000)
  })
})

describe('a sleep the run never woke from', () => {
  // The provider reports a sleep with the time it would wake; the run was
  // terminated 3 s in, before that, and the step stayed `waiting`.
  const sleep = step({
    stepName: 'nap (nap)-1',
    nodeId: 'nap',
    kind: 'sleep',
    status: 'waiting',
    startedAt: '2026-11-22T06:00:10.660Z',
    endedAt: '2026-11-22T06:00:20.660Z',
  })
  const runEnd = '2026-11-22T06:00:13.929Z'

  it('reads as interrupted, whatever end it was given', () => {
    expect(isInterruptedStep(sleep, 'terminated')).toBe(true)
    expect(mapRunStepsToNodeStatuses(['nap'], [sleep], {}, 'terminated')).toEqual({
      nap: 'pending',
    })
  })

  it('stops its bar at the run’s end, not at the wake time', () => {
    const { rows } = buildRunTimeline([sleep], { status: 'terminated', endedAt: runEnd })
    expect(rows[0]!.interrupted).toBe(true)
    expect(rows[0]!.durationMs).toBe(3_269)
  })

  it('stops it at its own end when that came first, the run’s last update being later', () => {
    // The app stamps the run's end when it notices it, which can be well after.
    const late = '2026-11-22T06:01:00.000Z'
    const { rows } = buildRunTimeline([sleep], { status: 'terminated', endedAt: late })
    expect(rows[0]!.interrupted).toBe(true)
    expect(rows[0]!.durationMs).toBe(10_000)
  })

  it('is not interrupted while the run is going', () => {
    expect(isInterruptedStep(sleep, 'running')).toBe(false)
  })
})
