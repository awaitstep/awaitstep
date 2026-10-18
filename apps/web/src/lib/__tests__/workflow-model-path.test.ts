import { describe, expect, it } from 'vitest'
import { parseWorkflowModelPath, workflowModelPath } from '../monaco/setup'

describe('workflowModelPath / parseWorkflowModelPath', () => {
  it('round-trips nested file paths and encoded workflow ids', () => {
    const uri = workflowModelPath('wf/1 x', 'src/nodes/fetch_data.ts')
    expect(uri).toBe('awaitstep://workflow/wf%2F1%20x/src/nodes/fetch_data.ts')
    expect(parseWorkflowModelPath(uri)).toEqual({
      workflowId: 'wf/1 x',
      file: 'src/nodes/fetch_data.ts',
    })
  })

  it('rejects URIs from other schemes or without a file segment', () => {
    expect(parseWorkflowModelPath('file:///awaitstep/cf-runtime.d.ts')).toBeNull()
    expect(parseWorkflowModelPath('awaitstep://workflow/abc')).toBeNull()
    expect(parseWorkflowModelPath('awaitstep://workflow/abc/')).toBeNull()
    expect(parseWorkflowModelPath('awaitstep://workflow//worker.ts')).toBeNull()
  })

  it('decodes percent-escapes Monaco may apply to the file part', () => {
    expect(parseWorkflowModelPath('awaitstep://workflow/abc/src/my%20file.ts')).toEqual({
      workflowId: 'abc',
      file: 'src/my file.ts',
    })
    expect(parseWorkflowModelPath('awaitstep://workflow/abc/%E0%A4%A')).toBeNull()
  })
})
