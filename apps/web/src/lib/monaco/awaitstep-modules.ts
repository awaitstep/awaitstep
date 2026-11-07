/**
 * Ambient declarations for the generated `#awaitstep/*` modules, shared by
 * every editor.
 *
 * The code workspace resolves these through the bundle's own emitted models
 * (`paths` in `project-config.ts`). The canvas's step-code editors have no
 * bundle models, so without these a step importing `#awaitstep/cloudflare`
 * would have no completion and no hover. The declarations are built from the
 * same sources the provider emits, so they cannot drift from the runtime.
 */
import {
  CLOUDFLARE_PRIMITIVES_SOURCE,
  RUNTIME_MODULE_SOURCE,
} from '@awaitstep/provider-cloudflare/codegen'

export const AWAITSTEP_MODULES_DTS = `declare module '#awaitstep/runtime' {
${RUNTIME_MODULE_SOURCE}
}

declare module '#awaitstep/cloudflare' {
${CLOUDFLARE_PRIMITIVES_SOURCE}
}

declare module '#awaitstep/function' {
  /** The function's bindings and declared env vars. */
  export interface Env {}
  /** Runs the node graph with the request's payload; resolves to the returned steps by key. */
  export function runGraph(env: Env, event: { payload: unknown }): Promise<Record<string, unknown>>
}

declare module '#awaitstep/workflow' {
  export const AWAITSTEP_RETENTION: { successRetention?: string | number; errorRetention?: string | number }
  /** Starts an instance of this workflow with \`params\` as its event payload. */
  export function startWorkflow(env: unknown, params: unknown): Promise<{ instanceId: string }>
  /** The status of an instance, or null when there is none by that id. */
  export function workflowStatus(env: unknown, instanceId: string): Promise<unknown>
}
`
