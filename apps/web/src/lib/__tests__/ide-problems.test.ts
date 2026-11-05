import { describe, expect, it } from 'vitest'
import {
  collectProblems,
  countBySeverity,
  groupProblems,
  markerSeverity,
  type MarkerLike,
} from '../ide/problems'
import { workflowModelPath } from '../monaco/setup'

function marker(
  overrides: Partial<MarkerLike> & { file: string; workflowId?: string },
): MarkerLike {
  const { file, workflowId = 'wf-1', ...rest } = overrides
  return {
    resource: { toString: () => workflowModelPath(workflowId, file) },
    severity: 8,
    message: 'boom',
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: 1,
    endColumn: 2,
    ...rest,
  }
}

describe('markerSeverity', () => {
  it('maps Monaco severity numbers to the three dock buckets', () => {
    expect(markerSeverity(8)).toBe('error')
    expect(markerSeverity(4)).toBe('warning')
    expect(markerSeverity(2)).toBe('info')
    expect(markerSeverity(1)).toBe('info')
  })
})

describe('collectProblems', () => {
  it('keeps only this workflow’s file models and strips the URI down to the bundle path', () => {
    const problems = collectProblems(
      [
        marker({ file: 'worker.ts' }),
        marker({ file: 'worker.ts', workflowId: 'other' }),
        {
          ...marker({ file: 'ignored' }),
          resource: { toString: () => 'file:///awaitstep/cf-runtime.d.ts' },
        },
      ],
      'wf-1',
    )
    expect(problems.map((p) => p.file)).toEqual(['worker.ts'])
  })

  it('orders errors first, then by file, line and column', () => {
    const problems = collectProblems(
      [
        marker({ file: 'src/b.ts', severity: 4, startLineNumber: 3 }),
        marker({ file: 'src/a.ts', severity: 4, startLineNumber: 9 }),
        marker({ file: 'src/a.ts', severity: 4, startLineNumber: 2, startColumn: 7 }),
        marker({ file: 'src/a.ts', severity: 4, startLineNumber: 2, startColumn: 3 }),
        marker({ file: 'zzz.ts', severity: 8 }),
      ],
      'wf-1',
    )
    expect(problems.map((p) => `${p.severity} ${p.file}:${p.line}:${p.column}`)).toEqual([
      'error zzz.ts:1:1',
      'warning src/a.ts:2:3',
      'warning src/a.ts:2:7',
      'warning src/a.ts:9:1',
      'warning src/b.ts:3:1',
    ])
  })

  it('flattens structured codes and carries the marker source', () => {
    const [problem] = collectProblems(
      [marker({ file: 'worker.ts', code: { value: '2304' }, source: 'ts' })],
      'wf-1',
    )
    expect(problem).toMatchObject({ code: '2304', source: 'ts', endLine: 1, endColumn: 2 })
    const [plain] = collectProblems([marker({ file: 'worker.ts', code: 'E1' })], 'wf-1')
    expect(plain.code).toBe('E1')
  })
})

describe('countBySeverity', () => {
  it('tallies each bucket', () => {
    const problems = collectProblems(
      [
        marker({ file: 'a.ts', severity: 8 }),
        marker({ file: 'a.ts', severity: 8 }),
        marker({ file: 'a.ts', severity: 4 }),
        marker({ file: 'a.ts', severity: 1 }),
      ],
      'wf-1',
    )
    expect(countBySeverity(problems)).toEqual({ error: 2, warning: 1, info: 1 })
  })
})

describe('groupProblems', () => {
  const p = (file: string, message = 'm') => ({
    file,
    line: 1,
    column: 1,
    endLine: 1,
    endColumn: 1,
    message,
    severity: 'error' as const,
  })

  it('keeps live and saved problems in separate groups', () => {
    const groups = groupProblems([p('a.ts', 'live')], [p('b.ts', 'saved')], new Set())
    expect(groups.live.map((x) => x.message)).toEqual(['live'])
    expect(groups.saved.map((x) => x.problem.message)).toEqual(['saved'])
  })

  it('flags saved problems of a file with unsaved edits as pending', () => {
    const groups = groupProblems([], [p('a.ts'), p('b.ts')], new Set(['a.ts']))
    expect(groups.saved.map((x) => x.pending)).toEqual([true, false])
  })

  it('never flags a problem with no file: an edit cannot have fixed it', () => {
    const groups = groupProblems([], [p('')], new Set(['a.ts', '']))
    expect(groups.saved[0]!.pending).toBe(false)
  })

  it('stops flagging once the file is saved', () => {
    expect(groupProblems([], [p('a.ts')], new Set()).saved[0]!.pending).toBe(false)
  })
})
