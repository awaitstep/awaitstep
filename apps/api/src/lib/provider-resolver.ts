import type { TemplateResolver, WorkflowProvider } from '@awaitstep/codegen'
import { createProvider, hasProvider, providerIds } from './provider-registry.js'
import type { WranglerDeployer } from '@awaitstep/provider-cloudflare'

export { validateNodesForProvider } from './provider-registry.js'

/**
 * Kept as the one provider the host currently knows. A production migration
 * should resolve from the connection/workflow, never from a default; the
 * registry is already the shape that change needs.
 */
const DEFAULT_PROVIDER = 'cloudflare'

export function resolveProvider(
  provider?: string,
  options?: { templateResolver?: TemplateResolver; deployer?: WranglerDeployer },
): WorkflowProvider {
  const name = provider ?? DEFAULT_PROVIDER
  if (!hasProvider(name)) {
    throw new Error(`Unsupported provider: ${name} (known: ${providerIds().join(', ')})`)
  }
  return createProvider(name, {
    ...(options?.templateResolver && { templateResolver: options.templateResolver }),
    ...(options?.deployer && { deployer: options.deployer }),
  })
}
