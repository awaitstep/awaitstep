import type { WorkflowProvider } from '@awaitstep/codegen'
import { validateDependencySpecs, type ArtifactIR } from '@awaitstep/ir'
import {
  libraryDependencies,
  libraryDependencyConflicts,
  mergeDependencies,
} from './dependencies.js'
import type { DependencySource } from './library-fold.js'

// The parts of a prepare that the Library adds: validating the bundle with
// library code folded in, and the dependency set library code joins.

/** A project-file rule: the caps and path checks over `runtime.files` as a whole or one entry. */
function isProjectFileRule(error: { path: string }): boolean {
  return error.path === 'runtime.files' || error.path.startsWith('runtime.files[')
}

/**
 * Validates the bundle a prepare generates from. Library files are not the
 * workflow's project files, so the project-file caps and path rules judge
 * the workflow's own document; everything else — the bindings and profiles
 * library code declares included — judges the bundle with the Library
 * folded in.
 */
export function validateWithLibrary(
  adapter: WorkflowProvider,
  own: ArtifactIR,
  bundled: ArtifactIR,
): ReturnType<WorkflowProvider['validate']> {
  if (own === bundled) return adapter.validate(own)
  const ownResult = adapter.validate(own)
  const bundledResult = adapter.validate(bundled)
  const errors = [
    ...(ownResult.ok ? [] : ownResult.errors.filter(isProjectFileRule)),
    ...(bundledResult.ok ? [] : bundledResult.errors.filter((e) => !isProjectFileRule(e))),
  ]
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: undefined }
}

/**
 * The deploy's dependency set — the workflow's own, its nodes', and what
 * library code asks for — and what is wrong with it once library code is in
 * it: two sides wanting one package at different ranges, or a set an
 * install would refuse (the count cap, a spec stored before a rule). Those
 * are said at check, not first at install. Without library code, the set
 * is exactly what it was before the Library.
 */
export function dependenciesWithLibrary(
  workflowDeps: Record<string, string> | undefined,
  nodeDeps: Record<string, string>,
  library: readonly DependencySource[],
): { dependencies: Record<string, string> | undefined; findings: string[] } {
  const conflicts = libraryDependencyConflicts(workflowDeps, library).map(
    (conflict) => `Dependency conflict: ${conflict}`,
  )
  const dependencies = mergeDependencies(workflowDeps, {
    ...nodeDeps,
    ...libraryDependencies(library),
  })
  const specs =
    library.length > 0 && dependencies
      ? validateDependencySpecs(dependencies, 'dependencies').map(
          (problem) => `Dependencies with library code: ${problem.message}`,
        )
      : []
  return { dependencies, findings: [...conflicts, ...specs] }
}
