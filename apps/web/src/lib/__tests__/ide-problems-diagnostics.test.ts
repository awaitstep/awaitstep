import { describe, it, expect } from 'vitest'
import { diagnosticProblems } from '../ide/problems'

describe('diagnosticProblems', () => {
  it('navigates a compile diagnostic to the position in its message', () => {
    const [problem] = diagnosticProblems([
      { source: 'compile', path: 'worker.ts', message: 'Unexpected token, expected ";" (16:21)' },
    ])
    expect(problem).toMatchObject({
      file: 'worker.ts',
      line: 16,
      // Sucrase columns are zero-based; Monaco's are one-based.
      column: 22,
      severity: 'error',
      source: 'compile',
    })
  })

  it('keeps a compile diagnostic without a position usable', () => {
    const [problem] = diagnosticProblems([
      { source: 'compile', path: 'nodes/a.ts', message: 'Something went wrong' },
    ])
    expect(problem).toMatchObject({ file: 'nodes/a.ts', line: 1, column: 1 })
  })

  it('shows a node-level finding with no file to reveal, keeping the node', () => {
    const [problem] = diagnosticProblems([
      { source: 'ir', nodeId: 'call', message: 'Call Script node "call" has no worker selected' },
    ])
    expect(problem).toMatchObject({
      file: '',
      severity: 'error',
      source: 'workflow',
      nodeId: 'call',
    })
  })

  it('keeps the node a compile error in a step module names, and none for a project file', () => {
    const [step, file] = diagnosticProblems([
      { source: 'compile', path: 'nodes/a.ts', nodeId: 'a', message: 'Unexpected token (3:1)' },
      { source: 'compile', path: 'lib/x.ts', message: 'Unexpected token (1:1)' },
    ])
    expect(step).toMatchObject({ file: 'nodes/a.ts', nodeId: 'a', line: 3 })
    expect(file!.nodeId).toBeUndefined()
  })

  it('returns nothing for a healthy workflow', () => {
    expect(diagnosticProblems([])).toEqual([])
  })
})
