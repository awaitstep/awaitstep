import { describe, expect, it, vi } from 'vitest'
import { liveErrorCount, type MarkerSource } from '../live-errors'
import { workflowModelPath } from '../setup'

function monacoWith(markers: Record<string, number[]>) {
  const getModelMarkers = vi.fn(({ resource }: { resource: string }) =>
    (markers[resource] ?? []).map((severity) => ({ severity })),
  )
  const monaco: MarkerSource<string> = {
    Uri: { parse: (value) => value },
    editor: { getModelMarkers },
  }
  return { monaco, getModelMarkers }
}

describe('live errors on a file', () => {
  it('counts the errors on the very model the editor holds for the path, not warnings', () => {
    const uri = workflowModelPath('wf-1', 'steps/a1b2.ts')
    const { monaco, getModelMarkers } = monacoWith({ [uri]: [8, 8, 4, 1] })
    expect(liveErrorCount('wf-1', 'steps/a1b2.ts', monaco)).toBe(2)
    expect(getModelMarkers).toHaveBeenCalledWith({ resource: uri })
  })

  it('finds none for another workflow’s file, and none before Monaco has loaded', () => {
    const { monaco } = monacoWith({ [workflowModelPath('wf-2', 'a.ts')]: [8] })
    expect(liveErrorCount('wf-1', 'a.ts', monaco)).toBe(0)
    expect(liveErrorCount('wf-1', 'a.ts', null)).toBe(0)
  })
})
