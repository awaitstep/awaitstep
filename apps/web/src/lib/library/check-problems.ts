import type { ValidationError } from '@awaitstep/ir'
import type { Problem } from '../ide/problems'
import type { ApiLibraryTreeItem } from '../library-api'
import type { DependencyConflict } from '../monaco/library-config'
import { idePath } from './ide-index'

function problem(file: string, message: string, severity: Problem['severity']): Problem {
  return {
    file,
    line: 1,
    column: 1,
    endLine: 1,
    endColumn: 1,
    message,
    severity,
    source: 'publish',
  }
}

/**
 * A publish check's findings as dock entries. A finding names a file, or a
 * field inside one (`1.0.0/node.json.version`): it is placed on the item's
 * file the path starts with, the field kept in the message. Findings about
 * no file (the version rule, an import) stay without one.
 */
export function checkProblems(
  item: ApiLibraryTreeItem,
  problems: readonly ValidationError[],
): Problem[] {
  const paths = item.files.map((f) => f.path).sort((a, b) => b.length - a.length)
  return problems.map((found) => {
    const file = paths.find((path) => found.path === path || found.path.startsWith(`${path}.`))
    if (!file) {
      const where = found.path ? `${found.path}: ` : ''
      return problem('', `${item.name}: ${where}${found.message}`, 'error')
    }
    const field = found.path.slice(file.length + 1)
    return problem(
      idePath(item, file),
      field ? `${field}: ${found.message}` : found.message,
      'error',
    )
  })
}

/** Two manifests asking for one package at different ranges: the deploy refuses that, naming both. */
export function conflictProblems(conflicts: readonly DependencyConflict[]): Problem[] {
  return conflicts.map((conflict) => {
    const ranges = conflict.declared.map((d) => `${d.path} wants ${d.range}`).join(', ')
    return problem(
      conflict.declared[1]?.path ?? '',
      `${conflict.name} is asked for at different versions: ${ranges}`,
      'warning',
    )
  })
}
