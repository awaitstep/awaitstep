import { describe, it, expect } from 'vitest'
import type { WorkflowNode } from '@awaitstep/ir'
import { generateSleep, generateSleepUntil } from '@awaitstep/codegen'

describe('generateSleep', () => {
  it('generates sleep with string duration under the name-and-id label', () => {
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
    expect(code).toBe('await flow.sleep("Wait 10s (sleep-1)", "10 seconds");')
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
    expect(code).toBe('await flow.sleep("Wait (sleep-1)", 5000);')
  })

  it('labels carry the cleaned node name, so quotes in the node name never reach the source', () => {
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
    expect(code).toContain('flow.sleep("Wait for event (sleep-1)"')
    expect(code).not.toContain('"event"')
  })
})

describe('generateSleepUntil', () => {
  it('generates sleepUntil with timestamp under the name-and-id label', () => {
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
      'await flow.sleepUntil("Wait until midnight (sleep-until-1)", new Date("2026-01-01T00:00:00Z"));',
    )
  })

  it('labels carry the cleaned node name, so quotes in the node name never reach the source', () => {
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
    expect(code).toContain('sleepUntil("Wait for deadline (sleep-until-1)"')
    expect(code).not.toContain('"deadline"')
  })
})
