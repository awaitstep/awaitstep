/**
 * Re-exports the package-level helpers the graph emitters share, so a module
 * moved under `graph/` can import them relatively instead of through the
 * package's own name (which resolves to `dist/` during a build).
 */
export type { GenerateMode } from '../code-generator.js'
export type { ArmBlock } from '../dag.js'
export type { GenerationContext } from '../context.js'
export type { GeneratorLookup } from '../node-generator.js'
export type { StepKind } from '../manifest.js'
export type { TemplateResolver } from '../template-resolver.js'
export type { GeneratedFile } from '../types.js'

export { childContext, computeVarNames } from '../context.js'
export { indent } from '../format.js'
export { GenerateInputError } from '../errors.js'
export { maskNonCode } from '../code-text.js'
export { moduleInputReads } from '../module-inputs.js'
export { normalizeStepModule, stepReturnsValue } from '../step-module.js'
export { derivedStepLabel, stepLabel } from '../naming.js'
export {
  DEFAULT_EXPORTED_NODE_TYPES,
  EXPORTABLE_NODE_TYPES,
  isExportedName,
  isExportedNode,
  isValidExportKey,
  sanitizeIdentifier,
} from '../sanitize.js'
export {
  CATCH_BINDINGS,
  CATCH_ERROR_VAR,
  LOOP_COUNTER_VAR,
  blockBindingsOf,
  loopBindings,
} from '../block-bindings.js'
export {
  CONTAINER_TYPES,
  blockChain,
  buildAdjacencyList,
  collectChain,
  computeInDegree,
  containerArms,
  getEdgeLabels,
  topologicalSort,
} from '../dag.js'
