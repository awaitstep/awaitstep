import { describe, it, expect } from 'vitest'
import { generateWranglerConfig, WRANGLER_BASE_CONFIG } from '../wrangler-config.js'

describe('generateWranglerConfig', () => {
  it('generates valid JSON with workflow binding', () => {
    const config = generateWranglerConfig({
      workerName: 'awaitstep-my-workflow',
      className: 'MyWorkflow',
      workflowName: 'my-workflow',
      main: './worker.js',
    })

    const parsed = JSON.parse(config)
    expect(parsed.name).toBe('awaitstep-my-workflow')
    expect(parsed.main).toBe('./worker.js')
    expect(parsed.compatibility_date).toBe(WRANGLER_BASE_CONFIG.compatibility_date)
    expect(parsed.compatibility_flags).toEqual(WRANGLER_BASE_CONFIG.compatibility_flags)
    expect(parsed.workflows).toHaveLength(1)
    expect(parsed.workflows[0]).toEqual({
      binding: 'WORKFLOW',
      name: 'my-workflow',
      class_name: 'MyWorkflow',
    })
  })

  it('always includes nodejs_compat flag', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
    })

    const parsed = JSON.parse(config)
    expect(parsed.compatibility_flags).toContain('nodejs_compat')
  })

  it('includes vars when provided', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
      vars: { FOO: 'bar' },
    })

    const parsed = JSON.parse(config)
    expect(parsed.vars).toEqual({ FOO: 'bar' })
  })

  it('omits vars when empty', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
      vars: {},
    })

    const parsed = JSON.parse(config)
    expect(parsed.vars).toBeUndefined()
  })
})
