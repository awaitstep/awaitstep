import type { WorkflowIR } from './types.js'
import { workflowIRSchema } from './schema.js'

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
