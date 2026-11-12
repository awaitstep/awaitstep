import type { ArtifactIR } from '@awaitstep/ir'
import type { AppNodeRegistry } from './node-registry.js'

export function parseDependencies(
  raw: string | null | undefined,
): Record<string, string> | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    if (Object.keys(parsed).length === 0) return undefined
    return parsed as Record<string, string>
  } catch {
    return undefined
  }
}

export function collectNodeDependencies(
  ir: ArtifactIR,
  nodeRegistry?: AppNodeRegistry,
): Record<string, string> {
  if (!nodeRegistry) return {}
  const deps: Record<string, string> = {}
  for (const node of ir.nodes) {
    const def = nodeRegistry.registry.get(node.type)
    if (def?.dependencies) {
      Object.assign(deps, def.dependencies)
    }
  }
  return deps
}

export function mergeDependencies(
  workflowDeps: Record<string, string> | undefined,
  nodeDeps: Record<string, string>,
): Record<string, string> | undefined {
  const merged = { ...nodeDeps, ...workflowDeps }
  return Object.keys(merged).length > 0 ? merged : undefined
}

/** What the workflow's own manifest is called in a dependency conflict. */
export const WORKFLOW_MANIFEST_LABEL = 'this workflow’s package.json'

/**
 * Packages library code asks for at a range another library source, or
 * the workflow's own package.json, does not share: one install cannot
 * satisfy both, so each names every side ("zod: lead-scoring 1.4.2 wants
 * ^3.23, this workflow’s package.json wants ^4.1"). Registry nodes keep
 * their old rule (the workflow's range wins) and are not judged here.
 */
export function libraryDependencyConflicts(
  workflowDeps: Record<string, string> | undefined,
  library: readonly { label: string; dependencies: Record<string, string> }[],
): string[] {
  if (library.length === 0) return []
  const wanted = new Map<string, { label: string; range: string }[]>()
  const add = (label: string, deps: Record<string, string>) => {
    for (const [name, range] of Object.entries(deps)) {
      wanted.set(name, [...(wanted.get(name) ?? []), { label, range }])
    }
  }
  for (const source of library) add(source.label, source.dependencies)
  const libraryNames = new Set(wanted.keys())
  if (workflowDeps) {
    add(
      WORKFLOW_MANIFEST_LABEL,
      Object.fromEntries(Object.entries(workflowDeps).filter(([name]) => libraryNames.has(name))),
    )
  }
  const conflicts: string[] = []
  for (const [name, sides] of [...wanted].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    if (new Set(sides.map((side) => side.range)).size < 2) continue
    conflicts.push(
      `${name}: ${sides.map((side) => `${side.label} wants ${side.range}`).join(', ')}`,
    )
  }
  return conflicts
}

/** Every library source's dependencies in one record (they agree, or a conflict was reported). */
export function libraryDependencies(
  library: readonly { dependencies: Record<string, string> }[],
): Record<string, string> {
  return Object.assign({}, ...library.map((source) => source.dependencies)) as Record<
    string,
    string
  >
}
