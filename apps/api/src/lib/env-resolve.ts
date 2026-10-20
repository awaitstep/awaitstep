import type { ProviderConfig } from '@awaitstep/codegen'
import type { ArtifactIR } from '@awaitstep/ir'
import { globalEnvRefName } from '@awaitstep/ir'
import type { DatabaseAdapter, ResolvedEnvVar } from '@awaitstep/db'
import type { AppNodeRegistry } from './node-registry.js'

export function collectRequiredEnvVars(ir: ArtifactIR, nodeRegistry?: AppNodeRegistry): string[] {
  if (!nodeRegistry) return []
  const required: string[] = []
  for (const node of ir.nodes) {
    const def = nodeRegistry.registry.get(node.type)
    if (!def) continue
    for (const field of Object.values(def.configSchema)) {
      if (field.type === 'secret' && field.envVarName) {
        required.push(field.envVarName)
      }
    }
  }
  return [...new Set(required)]
}

/**
 * A workflow's variables with every `{{global.env.X}}` reference replaced by
 * the project or org variable it names, project winning.
 *
 * One query for every reference in the workflow, rather than a lookup per
 * reference per scope — and it lives here rather than in `@awaitstep/db`
 * because what counts as a reference is defined in `@awaitstep/ir`, which
 * that package is deliberately standalone from.
 */
export async function resolveWorkflowEnvVars(
  db: DatabaseAdapter,
  organizationId: string,
  projectId: string,
  workflowId: string,
): Promise<Record<string, ResolvedEnvVar>> {
  const workflowVars = await db.getWorkflowEnvVars(workflowId)
  const referenced = [
    ...new Set(
      workflowVars.map((v) => globalEnvRefName(v.value)).filter((name): name is string => !!name),
    ),
  ]
  const found = await db.findEnvVarsByNames(organizationId, referenced, projectId)
  // Project scope overrides org scope for the same name.
  const byName = new Map<string, { value: string; isSecret: boolean }>()
  for (const envVar of found) {
    if (envVar.projectId === null && byName.has(envVar.name)) continue
    byName.set(envVar.name, { value: envVar.value, isSecret: envVar.isSecret })
  }

  const resolved: Record<string, ResolvedEnvVar> = {}
  for (const wVar of workflowVars) {
    const refName = globalEnvRefName(wVar.value)
    if (refName === null) {
      resolved[wVar.name] = { value: wVar.value, isSecret: wVar.isSecret }
      continue
    }
    const target = byName.get(refName)
    resolved[wVar.name] = target
      ? { value: target.value, isSecret: target.isSecret }
      : { value: undefined, isSecret: wVar.isSecret }
  }
  return resolved
}

/** The referenced names this project and org cannot supply. */
export async function unresolvableEnvRefs(
  db: DatabaseAdapter,
  organizationId: string,
  projectId: string,
  workflowId: string,
): Promise<string[]> {
  const workflowVars = await db.getWorkflowEnvVars(workflowId)
  const referenced = [
    ...new Set(
      workflowVars.map((v) => globalEnvRefName(v.value)).filter((name): name is string => !!name),
    ),
  ]
  const found = await db.findEnvVarsByNames(organizationId, referenced, projectId)
  const available = new Set(found.map((envVar) => envVar.name))
  return referenced.filter((name) => !available.has(name))
}

export async function resolveAndValidateEnvVars(
  db: DatabaseAdapter,
  organizationId: string,
  projectId: string,
  workflowId: string,
  ir: ArtifactIR,
  nodeRegistry?: AppNodeRegistry,
): Promise<{ envVars?: ProviderConfig['envVars']; error?: string }> {
  const resolved = await resolveWorkflowEnvVars(db, organizationId, projectId, workflowId)
  const requiredNames = collectRequiredEnvVars(ir, nodeRegistry)

  const missing: string[] = []
  for (const name of requiredNames) {
    const entry = resolved[name]
    if (!entry || entry.value === undefined) {
      missing.push(name)
    }
  }

  for (const [name, entry] of Object.entries(resolved)) {
    if (entry.value === undefined) {
      missing.push(name)
    }
  }

  if (missing.length > 0) {
    const unique = [...new Set(missing)]
    return { error: `Missing or unresolved environment variables: ${unique.join(', ')}` }
  }

  if (Object.keys(resolved).length === 0) return {}

  const envVars: Record<string, { value: string; isSecret: boolean }> = {}
  for (const [name, entry] of Object.entries(resolved)) {
    envVars[name] = { value: entry.value!, isSecret: entry.isSecret }
  }
  return { envVars }
}
