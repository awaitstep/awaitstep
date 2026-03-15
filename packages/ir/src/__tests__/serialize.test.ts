import { describe, it, expect } from 'vitest'
import { serializeIR, deserializeIR } from '../serialize.js'
import type { WorkflowIR } from '../types.js'
import simpleWorkflow from './fixtures/simple-workflow.json'

describe('serializeIR / deserializeIR', () => {
  it('round-trips a valid workflow', () => {
    const ir = simpleWorkflow as unknown as WorkflowIR
    const json = serializeIR(ir)
    const restored = deserializeIR(json)
    expect(restored).toEqual(ir)
  })

  it('produces valid JSON', () => {
    const ir = simpleWorkflow as unknown as WorkflowIR
    const json = serializeIR(ir)
    expect(() => JSON.parse(json)).not.toThrow()
  })

  it('throws on invalid JSON string', () => {
    expect(() => deserializeIR('not json')).toThrow()
  })

  it('throws on valid JSON but invalid IR', () => {
    expect(() => deserializeIR('{"foo":"bar"}')).toThrow('Invalid WorkflowIR JSON')
  })
})
