import type { WorkflowIR } from '@awaitstep/ir'

export interface CodeGenerator {
  readonly name: string
  generateWorkflow(ir: WorkflowIR): string
}
