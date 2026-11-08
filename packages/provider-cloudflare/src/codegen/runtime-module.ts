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
 * The import a function's entry needs: the context factory, the `step` adapter
 * its step modules receive, and the in-request host that runs them.
 */
export const FUNCTION_RUNTIME_IMPORT = `import { createInlineHost, createWorkflowContext, durableStep } from "${CORE_RUNTIME_IMPORT}";`

/** The same import when the graph calls another artifact and needs the platform adapter. */
export const FUNCTION_RUNTIME_IMPORT_WITH_PLATFORM = `import { createInlineHost, createWorkflowContext, durableStep, type PlatformHost } from "${CORE_RUNTIME_IMPORT}";`

/**
 * The import the provider bootstrap needs: the context factory and the types
 * its host adapter is declared against.
 */
export const BOOTSTRAP_RUNTIME_IMPORT = `import { createWorkflowContext } from "${CORE_RUNTIME_IMPORT}";`

/** The single-file (legacy) emitter runs the body inline, so it needs both halves. */
export const FUSED_RUNTIME_IMPORT =
  `import { createWorkflowContext, durableStep, type StepAttempt, type StepConfig, ` +
  `type WaitForEventOptions, type WorkflowHost } from "${CORE_RUNTIME_IMPORT}";`

/**
 * The Cloudflare platform adapter. The stable name is
 * `createAwaitstepPlatform`; the generated entry never names Cloudflare. It
 * reads the node's provider-scoped `params.cf` (a binding name, retention) and
 * otherwise derives the binding from the export/script name.
 *
 * `retention` is baked in because a child workflow create needs the same
 * retention the rest of the bundle uses.
 */
export function cloudflarePlatformHelper(retention: string): string {
  return `function cfParams(options: { params?: Record<string, unknown> }): Record<string, unknown> {
  const cf = options.params?.cf;
  return cf && typeof cf === "object" ? (cf as Record<string, unknown>) : {};
}

function cfBinding(options: { exportName?: string; workflow?: string; script?: string; params?: Record<string, unknown> }): string {
  const explicit = cfParams(options).binding;
  if (typeof explicit === "string" && explicit.length > 0) return explicit;
  const source = options.exportName ?? options.script ?? options.workflow ?? "";
  const base = source.replace(/^awaitstep-/i, "") || source;
  return base
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

export function createAwaitstepPlatform(env: Env): PlatformHost {
  const bindings = env as unknown as Record<string, any>;
  return {
    async startWorkflow(options) {
      const cf = cfParams(options);
      const retention = cf.retention ?? ${retention};
      const instance = await bindings[cfBinding(options)].create({
        id: crypto.randomUUID(),
        ...(options.input !== undefined && { params: options.input }),
        ...(retention !== undefined && { retention }),
      });
      return { instanceId: instance.id };
    },
    async workflowStatus(instanceId, options) {
      const status = await bindings[cfBinding(options)].get(instanceId).status();
      if (status.status === "errored") {
        throw new NonRetryableError(status.error?.message ?? "Sub-workflow failed");
      }
      if (status.status === "terminated") {
        throw new NonRetryableError("Sub-workflow was terminated");
      }
      return status;
    },
    async callScript(options) {
      const response = await bindings[cfBinding(options)].fetch(options.url ?? "https://invoke/", {
        method: options.method ?? "POST",
        ...(options.headers !== undefined && { headers: options.headers }),
        ...(options.body !== undefined && {
          body: typeof options.body === "string" ? options.body : JSON.stringify(options.body),
        }),
      });
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    },
  };
}`
}

/**
 * The Cloudflare host: the platform adapter plus the durable-step primitives.
 * It lives in the provider entry module, not in the portable workflow module.
 */
export function cloudflareHostHelper(): string {
  return `function createAwaitstepHost(step: WorkflowStep, env: Env): WorkflowHost {
  return {
    ...createAwaitstepPlatform(env),
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
}

/** Bundle path of the generated provider platform adapter. */
export const PLATFORM_MODULE_PATH = 'awaitstep/platform.ts'

/**
 * The platform module the provider entry imports. It is provider-generated and
 * only present in a deploy bundle; the portable workflow never names it.
 */
export function platformModuleFile(retention: string, envModule = '#awaitstep/env'): GeneratedFile {
  return {
    path: PLATFORM_MODULE_PATH,
    source: `// Generated from @awaitstep/provider-cloudflare — do not edit.
import type { PlatformHost } from "${CORE_RUNTIME_IMPORT}";
import type { Env } from "${envModule}";

${cloudflarePlatformHelper(retention)}
`,
    role: 'module',
  }
}
