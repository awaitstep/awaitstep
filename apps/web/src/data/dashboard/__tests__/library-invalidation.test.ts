import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { invalidateWorkflowLibraryReads } from '../library'

describe('invalidateWorkflowLibraryReads', () => {
  it('marks what a publish changes stale, the modules only unsaved code imports included', async () => {
    const client = new QueryClient()
    const keys = [
      ['workflow-source', 'wf'],
      ['workflow-library-modules', 'wf', ['solo']],
      ['workflow-custom-nodes', 'wf'],
      ['workflow-full', 'wf'],
    ]
    for (const key of keys) client.setQueryData(key, {})
    await invalidateWorkflowLibraryReads(client)
    const stale = keys.map((key) => client.getQueryState(key)?.isInvalidated)
    expect(stale).toEqual([true, true, true, false])
  })
})
