import { describe, it, expect } from 'vitest'
import type { WorkflowIR } from '@awaitstep/ir'
import { generateWorkflow } from '../generate.js'
import { transpileToJS } from '../transpile.js'
import simpleWorkflow from './fixtures/simple-workflow.json'

describe('transpileToJS', () => {
  it('transpiles generated workflow to valid JS', async () => {
    const ts = generateWorkflow(simpleWorkflow as unknown as WorkflowIR)
    const js = await transpileToJS(ts)
    expect(js).toBeTruthy()
    expect(js).toContain('class SimpleWorkflow')
    expect(js).not.toContain(': WorkflowIR')
  })

  it('produces ESM output', async () => {
    const ts = generateWorkflow(simpleWorkflow as unknown as WorkflowIR)
    const js = await transpileToJS(ts)
    expect(js).toContain('import')
    expect(js).toContain('export')
  })
})
