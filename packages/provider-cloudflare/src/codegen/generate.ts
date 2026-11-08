import type { ScriptIR, WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import type {
  CodeGenerator,
  GenerateMode,
  GenerationContext,
  GeneratorLookup,
  TemplateResolver,
} from '@awaitstep/codegen'
import { generateNodeCode as generateNeutralNodeCode } from '@awaitstep/codegen'
import { generateWorkflow } from './generate-workflow.js'
import { generateScript } from './generate-script.js'
import { builtinGenerators } from './generator-registry.js'

export { extractImports } from '@awaitstep/codegen'

/**
 * Dispatches one node to its emitter, defaulting to the Cloudflare registry so
 * a caller of this package gets the provider's own primitives (sub-workflow,
 * call-script) rather than the neutral set's refusal.
 */
export function generateNodeCode(
  node: WorkflowNode,
  ir: WorkflowIR,
  ctx: GenerationContext,
  templateResolver?: TemplateResolver,
  classDefinitions?: Map<string, string>,
  mode: GenerateMode = 'workflow',
  generators: GeneratorLookup = builtinGenerators,
): string {
  return generateNeutralNodeCode(
    node,
    ir,
    ctx,
    templateResolver,
    classDefinitions,
    mode,
    generators,
  )
}
export { deriveQueueName, toCFQueueName } from './bindings.js'
export { appliedStepSettings } from '@awaitstep/codegen'
export type { AppliedStepSettings } from '@awaitstep/codegen'
export {
  entryImportFor,
  handlerModuleScaffold,
  handlerModulesFromTriggerCode,
  handlerWiring,
  handlerDelegates,
  scheduleProblem,
  withConversionSettings,
} from './handler-modules.js'
export type {
  HandlerConversion,
  HandlerTarget,
  HandlerWiring,
  QueueConsumerSettings,
} from './handler-modules.js'
export {
  DEFAULT_TRIGGER_CODE,
  generateWorkflow,
  generateWorkflowBundle,
} from './generate-workflow.js'
export type { GenerateOptions } from './generate-workflow.js'
export {
  DEFAULT_SCRIPT_TRIGGER_CODE,
  generateScript,
  generateScriptBundle,
} from './generate-script.js'
export { FUNCTION_MODULE_PATH } from '@awaitstep/codegen'
export type { GenerateScriptOptions } from './generate-script.js'
export { exportPlan, nodeYieldsValue } from '@awaitstep/codegen'
export type { ExportPlanEntry } from '@awaitstep/codegen'
export { CLOUDFLARE_PRIMITIVES_SOURCE, RUNTIME_MODULE_SOURCE } from './runtime-module.js'
export { DEFAULT_RETENTION, resolveRetention, retentionLiteral } from './retention.js'
export type { CloudflareRetention } from './retention.js'

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

export * from './detect-bindings-client.js'
