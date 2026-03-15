import { describe, it, expect } from 'vitest'
import { generateWranglerConfig } from '../wrangler-config.js'

describe('generateWranglerConfig', () => {
  it('generates valid JSON with workflow binding', () => {
    const config = generateWranglerConfig({
      workerName: 'awaitstep-my-workflow',
      className: 'MyWorkflow',
      workflowName: 'my-workflow',
      compatibilityDate: '2026-03-15',
      main: './worker.js',
    })

    const parsed = JSON.parse(config)
    expect(parsed.name).toBe('awaitstep-my-workflow')
    expect(parsed.main).toBe('./worker.js')
    expect(parsed.compatibility_date).toBe('2026-03-15')
    expect(parsed.workflows).toHaveLength(1)
    expect(parsed.workflows[0]).toEqual({
      binding: 'WORKFLOW',
      name: 'my-workflow',
      class_name: 'MyWorkflow',
    })
  })
})
