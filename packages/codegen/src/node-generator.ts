import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import type { GenerateMode } from './code-generator.js'
import type { GenerationContext } from './context.js'

/**
 * Uniform arguments passed to every node generator. `recurse` is bound to the
 * same generation context and dispatch options as the current call, so
 * container generators (branch/loop/parallel/...) can emit their inner chains
 * without a second source of naming truth.
 */
export interface NodeGeneratorArgs {
  node: WorkflowNode
  ir: WorkflowIR
  ctx: GenerationContext
  mode: GenerateMode
  recurse(node: WorkflowNode, ir: WorkflowIR): string
}

/** One node type's code generator, registered in a {@link GeneratorRegistry}. */
export interface NodeGenerator {
  type: string
  generate(args: NodeGeneratorArgs): string
}

/**
 * The lookup dispatch consumes — hand-written (not derived from the class) so
 * the published contract stays one method wide regardless of what the
 * registry implementation grows.
 */
export interface GeneratorLookup {
  get(type: string): NodeGenerator | undefined
}

/**
 * Provider-side registry mapping node types to their generators. Providers
 * register their builtin set once; dispatch looks types up here instead of a
 * hardcoded switch, so adding a control-flow primitive (or a new provider's
 * generator set) no longer touches shared dispatch code.
 */
export class GeneratorRegistry {
  private readonly generators = new Map<string, NodeGenerator>()

  register(generator: NodeGenerator): this {
    if (this.generators.has(generator.type)) {
      throw new Error(`Generator already registered for node type: ${generator.type}`)
    }
    this.generators.set(generator.type, generator)
    return this
  }

  get(type: string): NodeGenerator | undefined {
    return this.generators.get(type)
  }
}
