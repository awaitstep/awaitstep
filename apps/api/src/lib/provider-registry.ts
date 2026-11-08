import type { ProviderCapabilities, TemplateResolver, WorkflowProvider } from '@awaitstep/codegen'
import type { ArtifactIR } from '@awaitstep/ir'
import { CloudflareWorkflowsAdapter, type WranglerDeployer } from '@awaitstep/provider-cloudflare'

export interface ProviderFactoryOptions {
  templateResolver?: TemplateResolver
  deployer?: WranglerDeployer
}

/** The provider packages the API can build. Adding a provider registers it here. */
const PROVIDERS: Readonly<Record<string, (options: ProviderFactoryOptions) => WorkflowProvider>> = {
  cloudflare: (options) =>
    new CloudflareWorkflowsAdapter({
      templateResolver: options.templateResolver,
      deployer: options.deployer,
    }),
}

export function providerIds(): string[] {
  return Object.keys(PROVIDERS)
}

/** Provider ids are registry keys, never prototype names. */
const PROVIDER_ID = /^[a-z][a-z0-9-]*$/

export function hasProvider(id: string): boolean {
  return PROVIDER_ID.test(id) && Object.hasOwn(PROVIDERS, id)
}

export function providerCapabilities(): ProviderCapabilities[] {
  return providerIds().map((id) => {
    const provider = createProvider(id, {})
    return (
      provider.capabilities ?? {
        id,
        label: id,
        handlerKinds: ['fetch'],
        importSchemes: [],
        bindingKinds: provider.supportedBindingKinds ?? [],
        bindingKindLabels: {},
      }
    )
  })
}

export function createProvider(id: string, options: ProviderFactoryOptions): WorkflowProvider {
  if (!hasProvider(id)) throw new Error(`Unsupported provider: ${id}`)
  return PROVIDERS[id]!(options)
}

/**
 * Whether every node in the artifact can run on the target. Node-level
 * compatibility is metadata on the definition, not a provider label on the
 * instance; this remains the coarse check for a provider that declares
 * support separately.
 */
export function validateNodesForProvider(
  ir: ArtifactIR,
  provider: string,
  providersFor?: (nodeType: string) => readonly string[] | undefined,
): { valid: boolean; unsupportedNodes: { id: string; name: string }[] } {
  const unsupported = ir.nodes.filter((node) => {
    if (node.provider !== undefined) return node.provider !== provider
    const providers = providersFor?.(node.type)
    return providers !== undefined && providers.length > 0 && !providers.includes(provider)
  })
  return {
    valid: unsupported.length === 0,
    unsupportedNodes: unsupported.map((node) => ({ id: node.id, name: node.name })),
  }
}
