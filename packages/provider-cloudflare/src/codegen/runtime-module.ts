import { CORE_RUNTIME_IMPORT, RUNTIME_MODULE_PATH, type GeneratedFile } from '@awaitstep/codegen'
import { RUNTIME_MODULE_SOURCE } from '@awaitstep/sdk/runtime-source'
import { CLOUDFLARE_PRIMITIVES_SOURCE } from '../runtime/cloudflare-source.js'

// Re-exported for the browser IDE, which declares the same modules globally.
export { CLOUDFLARE_PRIMITIVES_SOURCE, RUNTIME_MODULE_SOURCE }

/** Header on every emitted runtime module, so a reader knows where it came from. */
const GENERATED_HEADER = '// Generated from @awaitstep/sdk — do not edit.\n'
const CLOUDFLARE_HEADER = '// Generated from @awaitstep/provider-cloudflare — do not edit.\n'

/** Bundle path of the Cloudflare product-primitive module. */
export const CLOUDFLARE_PRIMITIVES_MODULE_PATH = 'awaitstep/cloudflare.ts'

/** The import specifier generated code uses for Cloudflare-only primitives. */
export const CLOUDFLARE_PRIMITIVES_IMPORT = '#awaitstep/cloudflare'

/**
 * The core runtime module emitted into a workflow bundle: the authoring
 * surface the generated workflow imports through `#awaitstep/runtime`. It is
 * the SDK's own source, so the package and the bundle cannot drift.
 */
export function runtimeModuleFile(): GeneratedFile {
  return {
    path: RUNTIME_MODULE_PATH,
    source: `${GENERATED_HEADER}${RUNTIME_MODULE_SOURCE}`,
    role: 'module',
  }
}

/**
 * The Cloudflare primitive module, emitted only when the workflow uses one.
 * Importing it is the capability declaration the deploy checks.
 */
export function cloudflarePrimitivesModuleFile(): GeneratedFile {
  return {
    path: CLOUDFLARE_PRIMITIVES_MODULE_PATH,
    source: `${CLOUDFLARE_HEADER}${CLOUDFLARE_PRIMITIVES_SOURCE}`,
    role: 'module',
  }
}

/**
 * The import the portable workflow module needs: the authoring helpers only.
 * Type-only specifiers are erased by the deploy transpile.
 */
export const WORKFLOW_RUNTIME_IMPORT = `import { defineWorkflow, durableStep } from "${CORE_RUNTIME_IMPORT}";`

/**
 * The import the provider bootstrap needs: the context factory and the types
 * its host adapter is declared against.
 */
export const BOOTSTRAP_RUNTIME_IMPORT =
  `import { createWorkflowContext, type StepAttempt, type StepConfig, ` +
  `type WaitForEventOptions, type WorkflowHost } from "${CORE_RUNTIME_IMPORT}";`

/** The single-file (legacy) emitter runs the body inline, so it needs both halves. */
export const FUSED_RUNTIME_IMPORT =
  `import { createWorkflowContext, durableStep, type StepAttempt, type StepConfig, ` +
  `type WaitForEventOptions, type WorkflowHost } from "${CORE_RUNTIME_IMPORT}";`

/**
 * The Cloudflare half of the primitive contract: a {@link WorkflowHost} over
 * the runtime's `WorkflowStep`. Emitted into the entry so the workflow module
 * itself stays free of `cloudflare:*` imports.
 */
export const CLOUDFLARE_HOST_HELPER = `function createCloudflareHost(step: WorkflowStep): WorkflowHost {
  return {
    do<T>(name: string, config: StepConfig | undefined, fn: (ctx: StepAttempt) => T | Promise<T>): Promise<T> {
      const attempt = (ctx: { attempt: number }) => Promise.resolve(fn({ attempt: ctx.attempt }));
      return config ? step.do(name, config, attempt) : step.do(name, attempt);
    },
    sleep(name: string, duration: string | number): Promise<void> {
      return step.sleep(name, duration);
    },
    sleepUntil(name: string, at: Date | number): Promise<void> {
      return step.sleepUntil(name, at);
    },
    waitForEvent<T>(name: string, options: WaitForEventOptions): Promise<T> {
      return step.waitForEvent<T>(name, options);
    },
  };
}`
