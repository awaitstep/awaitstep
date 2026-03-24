import { describe, it, expect } from 'vitest'
import type { WorkflowNode } from '@awaitstep/ir'
import { generateSleep, generateSleepUntil } from '../../../codegen/generators/sleep.js'

describe('generateSleep', () => {
  it('generates sleep with string duration', () => {
    const node: WorkflowNode = {
      id: 'sleep-1',
      type: 'sleep',
      name: 'Wait 10s',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { duration: '10 seconds' },
    }
    const code = generateSleep(node)
    expect(code).toBe('await step.sleep("Wait 10s", "10 seconds");')
  })

  it('generates sleep with numeric duration', () => {
    const node: WorkflowNode = {
      id: 'sleep-1',
      type: 'sleep',
      name: 'Wait',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { duration: 5000 },
    }
    const code = generateSleep(node)
    expect(code).toBe('await step.sleep("Wait", 5000);')
  })

  it('escapes quotes in step name', () => {
    const node: WorkflowNode = {
      id: 'sleep-1',
      type: 'sleep',
      name: 'Wait for "event"',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { duration: '1 minute' },
    }
    const code = generateSleep(node)
    expect(code).toContain('step.sleep("Wait for \\"event\\"')
  })
})

describe('generateSleepUntil', () => {
  it('generates sleepUntil with timestamp', () => {
    const node: WorkflowNode = {
      id: 'sleep-until-1',
      type: 'sleep_until',
      name: 'Wait until midnight',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { timestamp: '2026-01-01T00:00:00Z' },
    }
    const code = generateSleepUntil(node)
    expect(code).toBe(
      'await step.sleepUntil("Wait until midnight", new Date("2026-01-01T00:00:00Z"));',
    )
  })

  it('escapes quotes in step name', () => {
    const node: WorkflowNode = {
      id: 'sleep-until-1',
      type: 'sleep_until',
      name: 'Wait for "deadline"',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { timestamp: '2026-06-01T00:00:00Z' },
    }
    const code = generateSleepUntil(node)
    expect(code).toContain('sleepUntil("Wait for \\"deadline\\"')
  })
})
