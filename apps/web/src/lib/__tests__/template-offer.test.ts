import { describe, expect, it } from 'vitest'
import type { WorkflowFull } from '../api-client'
import { offersTemplates } from '../workflows/template-offer'

function full(
  kind: 'workflow' | 'script',
  versions: number,
): Pick<WorkflowFull, 'workflow' | 'versions'> {
  return {
    workflow: { kind } as WorkflowFull['workflow'],
    versions: Array.from({ length: versions }, (_, i) => ({
      version: i + 1,
    })) as WorkflowFull['versions'],
  }
}

describe('offersTemplates', () => {
  it('offers templates on /new, except for a function', () => {
    expect(offersTemplates({ isNew: true, fullData: undefined })).toBe(true)
    expect(offersTemplates({ isNew: true, kindParam: 'script', fullData: undefined })).toBe(false)
  })

  it('offers templates on a workflow the dashboard created and nobody has saved yet', () => {
    expect(offersTemplates({ isNew: false, fullData: full('workflow', 0) })).toBe(true)
  })

  it('never offers them over saved work, on a function, or before the workflow has loaded', () => {
    expect(offersTemplates({ isNew: false, fullData: full('workflow', 1) })).toBe(false)
    expect(offersTemplates({ isNew: false, fullData: full('script', 0) })).toBe(false)
    expect(offersTemplates({ isNew: false, fullData: undefined })).toBe(false)
  })
})
