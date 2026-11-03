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
`
