import type { ArtifactIR, ScriptIR, WorkflowIR } from './types.js'
import { artifactIRSchema, scriptIRSchema, workflowIRSchema } from './schema.js'

export function serializeIR(ir: WorkflowIR): string {
  return JSON.stringify(ir, null, 2)
}

export function deserializeIR(json: string): WorkflowIR {
  const parsed: unknown = JSON.parse(json)
  const result = workflowIRSchema.safeParse(parsed)

  if (!result.success) {
    throw new Error(`Invalid WorkflowIR JSON: ${result.error.issues[0]?.message}`)
  }

  return result.data as WorkflowIR
}

export function serializeScript(ir: ScriptIR): string {
  return JSON.stringify(ir, null, 2)
}

export function deserializeScript(json: string): ScriptIR {
  const parsed: unknown = JSON.parse(json)
  const result = scriptIRSchema.safeParse(parsed)

  if (!result.success) {
    throw new Error(`Invalid ScriptIR JSON: ${result.error.issues[0]?.message}`)
  }

  return result.data as ScriptIR
}

export function serializeArtifact(ir: ArtifactIR): string {
  return JSON.stringify(ir, null, 2)
}

/**
 * Deserialise an artifact, dispatching on the `kind` discriminator. Legacy
 * IRs without a `kind` field are treated as `'workflow'`.
 */
export function deserializeArtifact(json: string): ArtifactIR {
  const parsed: unknown = JSON.parse(json)
  const kind = (parsed as { kind?: string } | null)?.kind

  if (kind === 'script') {
    const result = scriptIRSchema.safeParse(parsed)
    if (!result.success) {
      throw new Error(`Invalid ScriptIR JSON: ${result.error.issues[0]?.message}`)
    }
    return result.data as ScriptIR
  }

  const result = workflowIRSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`Invalid WorkflowIR JSON: ${result.error.issues[0]?.message}`)
  }
  return result.data as WorkflowIR
}

// Re-export so callers can use the discriminated union schema directly.
export { artifactIRSchema }
