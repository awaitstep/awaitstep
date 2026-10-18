import { parseWorkflowModelPath } from '../monaco/setup'

export type ProblemSeverity = 'error' | 'warning' | 'info'

export interface Problem {
  file: string
  line: number
  column: number
  endLine: number
  endColumn: number
  message: string
  severity: ProblemSeverity
  source?: string
  code?: string
}

/** The subset of Monaco's `editor.IMarker` the dock reads. */
export interface MarkerLike {
  resource: { toString(): string }
  severity: number
  message: string
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
  source?: string
  code?: string | { value: string }
}

const SEVERITY_RANK: Record<ProblemSeverity, number> = { error: 0, warning: 1, info: 2 }

/** Monaco's MarkerSeverity enum: Hint 1, Info 2, Warning 4, Error 8. */
export function markerSeverity(severity: number): ProblemSeverity {
  if (severity >= 8) return 'error'
  if (severity >= 4) return 'warning'
  return 'info'
}

/**
 * Markers belonging to this workflow's file models, flattened for the
 * Problems dock: errors first, then by file, line and column.
 */
export function collectProblems(markers: readonly MarkerLike[], workflowId: string): Problem[] {
  const problems: Problem[] = []
  for (const marker of markers) {
    const parsed = parseWorkflowModelPath(marker.resource.toString())
    if (!parsed || parsed.workflowId !== workflowId) continue
    problems.push({
      file: parsed.file,
      line: marker.startLineNumber,
      column: marker.startColumn,
      endLine: marker.endLineNumber,
      endColumn: marker.endColumn,
      message: marker.message,
      severity: markerSeverity(marker.severity),
      ...(marker.source !== undefined && { source: marker.source }),
      ...(marker.code !== undefined && {
        code: typeof marker.code === 'string' ? marker.code : marker.code.value,
      }),
    })
  }
  return problems.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.file.localeCompare(b.file, 'en') ||
      a.line - b.line ||
      a.column - b.column,
  )
}

export function countBySeverity(problems: readonly Problem[]): Record<ProblemSeverity, number> {
  const counts: Record<ProblemSeverity, number> = { error: 0, warning: 0, info: 0 }
  for (const problem of problems) counts[problem.severity]++
  return counts
}
