import type { WorkflowIR } from '@awaitstep/ir'
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
  ir: WorkflowIR,
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
