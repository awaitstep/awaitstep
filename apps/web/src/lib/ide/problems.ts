import type { SourceDiagnostic } from '@awaitstep/codegen'
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

/**
 * Server-reported problems as dock entries. Monaco only knows about files, so
 * an issue about a node (no worker selected) carries no file — the dock shows
 * it without a location rather than dropping it, since it is usually the
 * explanation for the marker sitting next to it.
 *
 * A compile message ends in `(line:column)`; that position is lifted out so
 * the entry navigates like any other.
 */
export function diagnosticProblems(diagnostics: readonly SourceDiagnostic[]): Problem[] {
  return diagnostics.map((diagnostic) => {
    const position = diagnostic.source === 'compile' ? parsePosition(diagnostic.message) : null
    return {
      file: diagnostic.path ?? '',
      line: position?.line ?? 1,
      column: position?.column ?? 1,
      endLine: position?.line ?? 1,
      endColumn: position?.column ?? 1,
      message: diagnostic.message,
      severity: 'error' as ProblemSeverity,
      source: diagnostic.source === 'compile' ? 'compile' : 'workflow',
    }
  })
}

const POSITION = /\((\d+):(\d+)\)/

function parsePosition(message: string): { line: number; column: number } | null {
  const match = POSITION.exec(message)
  if (!match) return null
  return { line: Number(match[1]), column: Number(match[2]) + 1 }
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
