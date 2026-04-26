import type { ProviderConfig } from '@awaitstep/codegen'
import type { ArtifactIR } from '@awaitstep/ir'
import type { DatabaseAdapter } from '@awaitstep/db'
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

export async function resolveAndValidateEnvVars(
  db: DatabaseAdapter,
  organizationId: string,
  projectId: string,
  workflowId: string,
  ir: ArtifactIR,
  nodeRegistry?: AppNodeRegistry,
): Promise<{ envVars?: ProviderConfig['envVars']; error?: string }> {
  const resolved = await db.resolveEnvVars(organizationId, projectId, workflowId)
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
