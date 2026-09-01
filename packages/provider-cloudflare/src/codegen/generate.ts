import type { ScriptIR, WorkflowIR } from '@awaitstep/ir'
import type { CodeGenerator, TemplateResolver } from '@awaitstep/codegen'
import { generateWorkflow } from './generate-workflow.js'
import { generateScript } from './generate-script.js'

export { extractImports, generateNodeCode } from './generate-helpers.js'
export { deriveQueueName, toCFQueueName } from './bindings.js'
export { DEFAULT_TRIGGER_CODE, generateWorkflow } from './generate-workflow.js'
export type { GenerateOptions } from './generate-workflow.js'
export { DEFAULT_SCRIPT_TRIGGER_CODE, generateScript } from './generate-script.js'
export type { GenerateScriptOptions } from './generate-script.js'

export class CloudflareCodeGenerator implements CodeGenerator {
  readonly name = 'cloudflare-workflows'
  private templateResolver?: TemplateResolver

  constructor(templateResolver?: TemplateResolver) {
    this.templateResolver = templateResolver
  }

  generateWorkflow(ir: WorkflowIR): string {
    return generateWorkflow(ir, this.templateResolver)
  }

  generateScript(ir: ScriptIR): string {
    return generateScript(ir, this.templateResolver)
  }
}
