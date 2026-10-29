import type { ProviderConfig } from '@awaitstep/codegen'
import type { ArtifactIR } from '@awaitstep/ir'
import { globalEnvRefName } from '@awaitstep/ir'
import type { DatabaseAdapter, ResolvedEnvVar, Workflow } from '@awaitstep/db'
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

/** Where a workflow lives: the places its references resolve against, closest first. */
export interface WorkflowPlace {
  organizationId: string
  projectId: string
  workspaceId: string
}

/** The workflow's own place, from its row. */
export function placeOf(organizationId: string, workflow: Workflow): WorkflowPlace {
  return { organizationId, projectId: workflow.projectId, workspaceId: workflow.workspaceId }
}

function referencedNames(workflowVars: { value: string }[]): string[] {
  return [
    ...new Set(
      workflowVars.map((v) => globalEnvRefName(v.value)).filter((name): name is string => !!name),
    ),
  ]
}

/**
 * A workflow's variables with every `{{global.env.X}}` reference replaced by
 * the value its place resolves: the workflow's workspace, then its project,
 * then the organization (B4).
 *
 * One query for every reference in the workflow, which answers one row per
 * name — the closest level's, chosen in the statement — and it lives here
 * rather than in `@awaitstep/db` because what counts as a reference is
 * defined in `@awaitstep/ir`, which that package is deliberately standalone
 * from.
 */
export async function resolveWorkflowEnvVars(
  db: DatabaseAdapter,
  place: WorkflowPlace,
  workflow: Workflow,
): Promise<Record<string, ResolvedEnvVar>> {
  // The caller holds the workflow row: its own variables are decoded from
  // it, not read again.
  const workflowVars = await db.decodeWorkflowEnvVars(workflow)
  const found = await db.findEnvVarsByNames(
    place.organizationId,
    referencedNames(workflowVars),
    place.projectId,
    place.workspaceId,
  )
  const byName = new Map(found.map((v) => [v.name, { value: v.value, isSecret: v.isSecret }]))

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

/**
 * The referenced names a project and its org cannot supply — what a workflow
 * moved into the project would lose. Its destination workspace is decided
 * by the move itself, so a value set only in one workspace there is not
 * counted on.
 */
export async function unresolvableEnvRefs(
  db: DatabaseAdapter,
  organizationId: string,
  projectId: string,
  workflow: Workflow,
): Promise<string[]> {
  const workflowVars = await db.decodeWorkflowEnvVars(workflow)
  const referenced = referencedNames(workflowVars)
  const found = await db.findEnvVarsByNames(organizationId, referenced, projectId)
  const available = new Set(found.map((envVar) => envVar.name))
  return referenced.filter((name) => !available.has(name))
}

export async function resolveAndValidateEnvVars(
  db: DatabaseAdapter,
  place: WorkflowPlace,
  workflow: Workflow,
  ir: ArtifactIR,
  nodeRegistry?: AppNodeRegistry,
): Promise<{ envVars?: ProviderConfig['envVars']; error?: string }> {
  const resolved = await resolveWorkflowEnvVars(db, place, workflow)
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
