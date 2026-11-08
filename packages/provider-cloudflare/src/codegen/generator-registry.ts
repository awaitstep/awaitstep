/**
 * Cloudflare's node-generator set is the provider-neutral one. Sub-workflow
 * and sub-script generate platform-adapter calls (`flow.startWorkflow`,
 * `flow.callScript`); the Cloudflare host maps those to its Workflow and
 * service bindings. The old provider-specific emitters remain exported from
 * this package for callers that build bundles directly, but they are not part
 * of generated code any more.
 */
export { createBuiltinGeneratorRegistry, builtinGenerators } from '@awaitstep/codegen'
