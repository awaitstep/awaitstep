import { describe, expect, it } from 'vitest'
import type { TestRunStep } from '@awaitstep/codegen'
import {
  MAX_KNOWN_INSTANCES,
  instanceStatusLabel,
  instanceStepList,
  instanceViewOf,
  parseEventForm,
  parseInstanceId,
  rememberInstance,
  sentEventLine,
  stepExtrasOf,
  testStepById,
  waitEventTypes,
} from '../ide/test-instance'
import { flatSteps } from '../run-step-list'

const step = (over: Partial<TestRunStep>): TestRunStep => ({
  name: 'send',
  kind: 'do',
  index: 1,
  status: 'complete',
  attemptCount: 1,
  start: '2026-11-28T10:00:00.000Z',
  end: '2026-11-28T10:00:01.000Z',
  ...over,
})

const graph = {
  nodes: [
    { id: 'n1', name: 'Charge card', type: 'step' },
    { id: 'n2', name: 'Await approval', type: 'wait_for_event', data: { eventType: 'approved' } },
    { id: 'n3', name: 'Other wait', type: 'wait_for_event', data: { eventType: ' approved ' } },
    { id: 'n4', name: 'Blank wait', type: 'wait_for_event', data: { eventType: '' } },
  ],
  edges: [],
}

describe('rememberInstance', () => {
  it('puts the newest first, once, and keeps what was seen of one already known', () => {
    const list = rememberInstance([{ id: 'a', view: { status: 'complete' } }, { id: 'b' }], 'a')
    expect(list).toEqual([{ id: 'a', view: { status: 'complete' } }, { id: 'b' }])
    expect(rememberInstance(list, 'c').map((i) => i.id)).toEqual(['c', 'a', 'b'])
  })

  it('drops the oldest past the cap', () => {
    let list = rememberInstance([], 'first')
    for (let i = 0; i < MAX_KNOWN_INSTANCES; i++) list = rememberInstance(list, `i${i}`)
    expect(list).toHaveLength(MAX_KNOWN_INSTANCES)
    expect(list.some((i) => i.id === 'first')).toBe(false)
  })
})

describe('instanceViewOf', () => {
  it('keeps status, output, error, steps and the incomplete flag', () => {
    const steps = [step({})]
    expect(
      instanceViewOf({ status: 'complete', output: { n: 1 }, steps, stepsIncomplete: true }),
    ).toEqual({ status: 'complete', output: { n: 1 }, steps, stepsIncomplete: true })
    expect(instanceViewOf({ error: 'instance.not_found' })).toEqual({ error: 'instance.not_found' })
  })

  it.each([null, 'text', [1], 3])('is null for a body that is not an object (%j)', (body) => {
    expect(instanceViewOf(body)).toBeNull()
  })
})

describe('instanceStepList', () => {
  it('names a step after its node and folds a loop’s repeats', () => {
    const view = {
      status: 'running',
      steps: [
        step({ name: 'n1', index: 1 }),
        step({
          name: 'n1',
          index: 2,
          start: '2026-11-28T10:00:02.000Z',
          end: undefined,
          status: 'running',
        }),
      ],
    }
    const { entries } = instanceStepList(view, 'i-1', graph, new Date('2026-11-28T10:00:05.000Z'))
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ kind: 'group', name: 'Charge card', state: 'running' })
    expect(flatSteps(entries).map((i) => i.id)).toEqual(['do:n1:1', 'do:n1:2'])
  })

  it('shows a failed step with its error, as the run page reads it', () => {
    const view = {
      status: 'errored',
      steps: [step({ status: 'errored', error: { name: 'Error', message: 'card declined' } })],
    }
    const [item] = flatSteps(instanceStepList(view, 'i-1', null).entries)
    expect(item).toMatchObject({ state: 'failed', name: 'send' })
    expect(JSON.parse(item!.step.error!)).toEqual({ name: 'Error', message: 'card declined' })
  })

  it('is empty before anything was read', () => {
    expect(instanceStepList(undefined, 'i-1', null).entries).toEqual([])
  })
})

describe('stepExtrasOf', () => {
  it('passes a whole output, and a cut one as its text preview', () => {
    expect(stepExtrasOf(step({ output: { ok: true } }))).toEqual({
      output: { ok: true },
      outputTruncated: false,
      outputPreview: null,
      attempts: [],
    })
    expect(stepExtrasOf(step({ output: '{"big":', outputTruncated: true }))).toMatchObject({
      output: null,
      outputTruncated: true,
      outputPreview: '{"big":',
    })
    expect(stepExtrasOf(step({})).output).toBeNull()
  })

  it('finds the record behind a row', () => {
    const steps = [step({ name: 'a' }), step({ name: 'b', kind: 'sleep' })]
    expect(testStepById(steps, 'sleep:b:1')?.name).toBe('b')
    expect(testStepById(steps, undefined)).toBeUndefined()
  })
})

describe('the send-event form', () => {
  it('suggests each wait’s event type once', () => {
    expect(waitEventTypes(graph)).toEqual(['approved'])
    expect(waitEventTypes(null)).toEqual([])
  })

  it.each([
    ['', '{}', 'Enter an event type'],
    ['has space', '{}', 'type must be up to 100 letters, digits, - or _'],
    ['ok', '{', 'Not valid JSON'],
  ])('refuses type %j with payload %j', (type, payload, error) => {
    expect(parseEventForm(type, payload)).toEqual({ ok: false, error })
  })

  it('sends a trimmed type and the parsed payload; an empty payload is {}', () => {
    expect(parseEventForm(' approved ', '{"by":"me"}')).toEqual({
      ok: true,
      type: 'approved',
      payload: { by: 'me' },
    })
    expect(parseEventForm('approved', '')).toMatchObject({ ok: true, payload: {} })
  })

  it('writes the send as a line of Output', () => {
    expect(sentEventLine('approved', 'i-1', 5)).toEqual({
      timestamp: 5,
      stream: 'stdout',
      text: 'Sent event "approved" to i-1',
    })
  })
})

describe('picking an instance', () => {
  it('takes a pasted id trimmed, and refuses one the server would', () => {
    expect(parseInstanceId('  abc-1 ')).toEqual({ ok: true, id: 'abc-1' })
    expect(parseInstanceId('-bad')).toMatchObject({ ok: false })
  })

  it.each([
    [undefined, 'Not read yet'],
    [{ error: 'instance.not_found' }, 'Not in this session'],
    [{ status: 'waiting' }, 'Waiting'],
    [{ status: 'odd' }, 'odd'],
  ])('labels %j as %s', (view, label) => {
    expect(instanceStatusLabel(view)).toBe(label)
  })
})
