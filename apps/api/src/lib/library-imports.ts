import {
  LIBRARY_NODE_TEMPLATE,
  PROJECT_IMPORT_PREFIX,
  isProjectCodePath,
  type LibraryItemKind,
  type ValidationError,
} from '@awaitstep/ir'
import { templateImports } from '@awaitstep/codegen'
import { TOO_COMPLEX, escapeMessage, escapingImports, importSpecifiers } from './import-check.js'

/**
 * What a library item's code may not import, with paths relative to the
 * item (a module's root, a node's version folder):
 * - `#app/…` in any of it: library code cannot depend on whichever
 *   workflow happens to bundle it;
 * - in a module, a relative import that climbs out of its own folder (it
 *   would reach another module or the workflow's files);
 * - in a node's template, a relative value import: the template is hoisted
 *   into a generated module, where `./x` means something else. Judged by
 *   codegen's own `templateImports`, so what publishes also generates (a
 *   type-only import, the editor's `./ctx` one included, is erased).
 */
export function libraryImportProblems(
  kind: LibraryItemKind,
  files: readonly { path: string; source: string }[],
): ValidationError[] {
  const code = files.filter((file) =>
    kind === 'node' ? file.path === LIBRARY_NODE_TEMPLATE : isProjectCodePath(file.path),
  )
  const problems: ValidationError[] = []
  const seen = new Set<string>()
  function report(path: string, message: string) {
    const key = JSON.stringify([path, message])
    if (seen.has(key)) return
    seen.add(key)
    problems.push({ path, message })
  }
  for (const file of code) {
    for (const specifier of importSpecifiers(file.source)) {
      if (specifier.startsWith(PROJECT_IMPORT_PREFIX)) {
        report(
          file.path,
          `"${specifier}" reaches into the workflow that bundles it; library code imports npm packages and #modules/ only`,
        )
      }
    }
    if (kind === 'node') {
      for (const problem of templateImports(file.source).problems) report(file.path, problem)
    }
  }
  if (kind === 'module') {
    for (const escape of escapingImports(code)) {
      report(
        escape.path,
        escape.specifier === TOO_COMPLEX
          ? TOO_COMPLEX
          : `${escapeMessage(escape, 'the module')}; import another module as #modules/<slug>`,
      )
    }
  }
  return problems
}
