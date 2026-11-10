export type {
  GeneratedArtifact,
  GeneratedFile,
  GeneratedFileRole,
  GeneratedBundle,
  ProviderConfig,
  DeployResult,
  WorkflowStatus,
  WorkflowRunStatus,
  WorkflowRunDetail,
  RunStepDetail,
  RunStepDetailKind,
  RunStepDetailStatus,
  LocalDevSession,
  ProcessLogEntry,
  LocalDevOptions,
  DeploymentConfigUiSchema,
  DeploymentConfigUiGroup,
  DeploymentConfigUiField,
  DeploymentConfigUiFieldOption,
  DeploymentConfigUiWidget,
  DeploymentConfigUiVisibility,
  DeploymentConfigValidator,
  DeploymentConfigPreview,
  DiagnosticSource,
  SourceDiagnostic,
} from './types.js'
export { DIAGNOSTIC_SOURCES } from './types.js'

export type {
  WorkflowProvider,
  ProviderCapabilities,
  ProviderHandlerKind,
  CredentialsCheckResult,
  CredentialsInspection,
  InspectOptions,
  HandlerConversionResult,
  LocalDevProvider,
} from './provider.js'
export { supportsLocalDev } from './provider.js'
export type {
  TestSessionRunner,
  TestSessionRuntime,
  TestSessionTarget,
  TestSessionHandle,
  StartedTestSessionHandle,
  TestSessionStart,
  TestSessionResponse,
  TestSessionLogPage,
} from './test-session.js'
export { TEST_SESSION_RUNTIMES } from './test-session.js'
export type { CodeGenerator, GenerateMode } from './code-generator.js'
export type { TemplateResolver } from './template-resolver.js'

export {
  topologicalSort,
  buildAdjacencyList,
  getEdgeLabels,
  upstreamVarNames,
  upstreamVarNamesOf,
  upstreamScopeOf,
  containerArms,
  blockChain,
  collectChain,
  computeInDegree,
  CONTAINER_TYPES,
} from './dag.js'
export type { ArmBlock } from './dag.js'
export {
  sanitizeIdentifier,
  deduplicateStepNames,
  isExportedName,
  isExportedNode,
  exportKeyFor,
  EXPORT_KEY_RE,
  isValidExportKey,
  DEFAULT_EXPORTED_NODE_TYPES,
  EXPORTABLE_NODE_TYPES,
  stripExportPrefix,
  RESERVED_VAR_NAMES,
} from './sanitize.js'
export {
  toBundle,
  bundleEntry,
  bundleCodeFiles,
  assertSafeBundlePath,
  validateBundle,
  projectBundleFiles,
  bundleDeployFiles,
  bundlePackageManifest,
} from './bundle.js'
export { GenerateInputError } from './errors.js'
export { escName } from './var-names.js'
export { computeVarNames, createGenerationContext, childContext } from './context.js'
export type { GenerationContext, GenerationContextOptions } from './context.js'
export { GeneratorRegistry } from './node-generator.js'
export type { NodeGenerator, NodeGeneratorArgs, GeneratorLookup } from './node-generator.js'
export { indent } from './format.js'
export { contentHash, resolveStepNode, stepLabelBase } from './manifest.js'
export type { StepManifest, StepManifestEntry, StepKind } from './manifest.js'
export { stepLabel, sanitizeStepLabel, derivedStepLabel } from './naming.js'
export { outputFieldToType, outputSchemaToType, propertyKey, escapeJsdoc } from './output-types.js'
export {
  AWAITSTEP_IMPORT_PREFIX,
  AWAITSTEP_IMPORTS_FIELD,
  AWAITSTEP_MODULE_DIR,
  CORE_RUNTIME_IMPORT,
  RUNTIME_MODULE_PATH,
  FUNCTION_MODULE_PATH,
} from './runtime.js'
export {
  checkRequirements,
  collectProviderImports,
  collectRuntimeRequirements,
  describeBindingKind,
  describeProvider,
  formatUnsupportedRequirements,
  importSpecifiers,
  mergeRequirements,
  providerFromAwaitstepImport,
  providerFromSpecifier,
  withoutComments,
} from './requirements.js'
export type {
  RequirementSupport,
  RequirementTarget,
  RuntimeRequirement,
  UnsupportedRequirement,
} from './requirements.js'
export { GENERATED_GRAPH_MODULES } from './runtime.js'
export { extractImports } from './imports.js'
export {
  MAX_STEP_CODE_LENGTH,
  STEP_MODULE_PARAMS,
  STEP_MODULE_SIGNATURE,
  isStepModule,
  stepFunctionName,
  stepReturnsValue,
  stepModuleTemplate,
  normalizeStepModule,
  normalizeStepModules,
  renameStepFunction,
  followStepFunctionNames,
  stepBodyFromModule,
  stepModuleProblem,
  stepModuleProblems,
} from './step-module.js'
export { insertStep } from './graph-edit.js'
export type { InsertStepResult, NewStep, StepPlacement } from './graph-edit.js'
export { moduleInputReads, moduleInputNames } from './module-inputs.js'
export type { ModuleInputReads } from './module-inputs.js'
export {
  LOOP_COUNTER_VAR,
  CATCH_ERROR_VAR,
  CATCH_BINDINGS,
  loopBindings,
  blockBindingsOf,
} from './block-bindings.js'
export { maskNonCode } from './code-text.js'

// ── Provider-neutral graph emission ──
// The per-node emitters and their shared helpers. Provider packages compose
// these with their own primitives; the universal generator uses them alone.
export { generateStep, generateStepGroup, resolveStepConfig } from './graph/generators/step.js'
export { generateStepConfig } from './graph/generators/config.js'
export { collectBranchInlineTargets } from './graph/generators/branch.js'
export { hasTemplateExpressions } from './graph/generators/state-tracking.js'
export { appliedStepSettings } from './graph/generators/step-settings.js'
export type { AppliedStepSettings } from './graph/generators/step-settings.js'
export { groupChain, emitGroupedChain } from './graph/coalesce.js'
export { assertStepPathsFree, moduleImportLine, modulePathOf } from './graph/module-files.js'
export { boundVarNames, exportPlan, nodeYieldsValue } from './graph/export-plan.js'
export type { ExportPlanEntry } from './graph/export-plan.js'
export { buildOutputConsumption } from './graph/consumption.js'
export { graphModuleNames } from './graph/graph-module-names.js'
export {
  generateNodeCode,
  collectEnvRefNames,
  envFieldName,
  collapseBlankLines,
  endsWithReturn,
  detectKind,
  resolveNodeExpressions,
  wrapModuleCalls,
} from './graph/generate-helpers.js'
export { builtinGenerators, createBuiltinGeneratorRegistry } from './graph/generator-registry.js'

// ── Graph emitter internals provider packages compose on ──
// Exported so a provider can test the shared emitter it builds on without
// reaching into another package's source tree.
export { generateBranch } from './graph/generators/branch.js'
export { generateSleep, generateSleepUntil } from './graph/generators/sleep.js'
export { generateHttp } from './graph/generators/http.js'
export { generateWaitForEvent } from './graph/generators/wait-for-event.js'
export { generateTryCatch } from './graph/generators/try-catch.js'
export { generateLoop } from './graph/generators/loop.js'
export { generateBreak, enterLoop, exitLoop } from './graph/generators/break.js'
export { generateRace } from './graph/generators/race.js'
export { generateParallel } from './graph/generators/parallel.js'
export { isJsonLiteralBody } from './graph/generators/http-body.js'
export {
  generateCustomNode,
  generateCustomNodeModule,
  generateCustomNodeParts,
} from './graph/generators/custom.js'
export {
  generatePromiseContainer,
  indentCode,
  inlineChain,
  prepareContainerContext,
} from './graph/generators/container-utils.js'
export type { ContainerContext } from './graph/generators/container-utils.js'
export { isCoalescible } from './graph/coalesce.js'
export {
  extractTemplateBody,
  resolveCtxConfig,
  resolveCtxEnv,
  resolveCtxInputs,
  toJsLiteral,
} from './graph/generators/custom.js'
export { getForkTargets } from './graph/generators/container-utils.js'

// ── Universal (provider-neutral) generation ──
export {
  generateUniversalWorkflow,
  generateUniversalWorkflowBundle,
  UNIVERSAL_ENV_PATH,
  UNIVERSAL_WORKFLOW_PATH,
} from './graph/universal.js'
export type { UniversalGenerateOptions } from './graph/universal.js'

export {
  generateUniversalFunction,
  generateUniversalFunctionBundle,
  UNIVERSAL_FUNCTION_PATH,
} from './graph/universal.js'
export type { UniversalFunctionOptions } from './graph/universal.js'
export { generatePortableWorkflow } from './graph/universal.js'
export type { PortableWorkflow } from './graph/universal.js'

// ── Neutral handler contract ──
export { handlerModuleScaffold } from './handlers.js'
export type { HandlerTarget } from './handlers.js'

export { splitEnvVars } from './env-vars.js'
