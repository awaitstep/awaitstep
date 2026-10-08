import { describe, it, expect } from 'vitest'
import type { WorkflowNode } from '@awaitstep/ir'
import { generateSleep, generateSleepUntil } from '../../../codegen/generators/sleep.js'

describe('generateSleep', () => {
  it('generates sleep with string duration under the node-id label', () => {
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
    expect(code).toBe('await step.sleep("sleep-1", "10 seconds");')
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
    expect(code).toBe('await step.sleep("sleep-1", 5000);')
  })

  it('labels are id-derived, so quotes in the node name never reach the source', () => {
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
    expect(code).toContain('step.sleep("sleep-1"')
    expect(code).not.toContain('event')
  })
})

describe('generateSleepUntil', () => {
  it('generates sleepUntil with timestamp under the node-id label', () => {
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
    expect(code).toBe('await step.sleepUntil("sleep-until-1", new Date("2026-01-01T00:00:00Z"));')
  })

  it('labels are id-derived, so quotes in the node name never reach the source', () => {
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
    expect(code).toContain('sleepUntil("sleep-until-1"')
    expect(code).not.toContain('deadline')
  })
})
