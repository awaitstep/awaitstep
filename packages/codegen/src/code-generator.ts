import type { ScriptIR, WorkflowIR } from '@awaitstep/ir'

export type GenerateMode = 'workflow' | 'script'

export interface CodeGenerator {
  readonly name: string
  generateWorkflow(ir: WorkflowIR): string
  generateScript(ir: ScriptIR): string
}
