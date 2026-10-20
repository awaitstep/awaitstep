import { describe, it, expect } from 'vitest'
import { driftDiagnostic } from '../lib/workflow-prepare.js'

describe('driftDiagnostic', () => {
  it('turns a bundle file path into a path a client can open', () => {
    expect(
      driftDiagnostic({ path: 'source.nodes/fetch.ts', message: 'Module file is missing' }),
    ).toEqual({ source: 'drift', message: 'Module file is missing', path: 'nodes/fetch.ts' })
  })

  it('keeps the node id a step record already carries, with no path', () => {
    // `manifest.steps.<id>` is not a file — pointing an editor at it would
    // open nothing.
    expect(
      driftDiagnostic({
        path: 'manifest.steps.step-1',
        message: 'Node "step-1" was removed',
        nodeId: 'step-1',
      }),
    ).toEqual({ source: 'drift', message: 'Node "step-1" was removed', nodeId: 'step-1' })
  })

  it('carries both when the error names a file and a node', () => {
    expect(
      driftDiagnostic({ path: 'source.worker.ts', message: 'Marker missing', nodeId: 'step-2' }),
    ).toEqual({
      source: 'drift',
      message: 'Marker missing',
      nodeId: 'step-2',
      path: 'worker.ts',
    })
  })

  it('gives a bundle-level error no path at all', () => {
    expect(driftDiagnostic({ path: 'source', message: 'Invalid bundle structure' })).toEqual({
      source: 'drift',
      message: 'Invalid bundle structure',
    })
  })
})
