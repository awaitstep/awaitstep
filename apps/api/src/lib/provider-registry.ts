import type { ProviderCapabilities, TemplateResolver, WorkflowProvider } from '@awaitstep/codegen'
import type { ArtifactIR } from '@awaitstep/ir'
import { CloudflareWorkflowsAdapter, type WranglerDeployer } from '@awaitstep/provider-cloudflare'

export interface ProviderFactoryOptions {
  templateResolver?: TemplateResolver
  deployer?: WranglerDeployer
}

/** Builds a provider for one use; the API passes its template resolver and deployer. */
export type ProviderFactory = (options: ProviderFactoryOptions) => WorkflowProvider

/** The provider packages this repository ships. */
const BUILT_IN: Readonly<Record<string, ProviderFactory>> = {
  cloudflare: (options) =>
    new CloudflareWorkflowsAdapter({
      templateResolver: options.templateResolver,
      deployer: options.deployer,
    }),
}

// The providers the running app's extensions contribute, set once at startup
// by `useExtensionProviders`. Module state, like the built-in table: the
// resolver is called from deep in the libraries, with no app at hand.
let fromExtensions: Readonly<Record<string, ProviderFactory>> = {}
// The extension providers a user may connect an account to; the rest are
// operated by the instance itself.
let connectableFromExtensions: ReadonlySet<string> = new Set()

function all(): Readonly<Record<string, ProviderFactory>> {
  return { ...BUILT_IN, ...fromExtensions }
}

export function providerIds(): string[] {
  return Object.keys(all())
}

/** Provider ids are registry keys, never prototype names. */
const PROVIDER_ID = /^[a-z][a-z0-9-]*$/

export function hasProvider(id: string): boolean {
  return PROVIDER_ID.test(id) && Object.hasOwn(all(), id)
}

/**
 * Whether a user may connect an account to this provider: every built-in
 * one, and an extension's only when it lists it in `connectableProviders`.
 */
export function acceptsConnections(id: string): boolean {
  return PROVIDER_ID.test(id) && (Object.hasOwn(BUILT_IN, id) || connectableFromExtensions.has(id))
}

/**
 * Installs the providers the app's extensions contribute, replacing any set
 * an earlier app installed. Refuses, at startup, an id that is not a valid
 * provider id, or one already taken by a built-in provider or another
 * extension, or whose factory can't build it without options or names it
 * otherwise, naming it.
 */
export function useExtensionProviders(
  extensions: readonly {
    id: string
    providers?: Readonly<Record<string, ProviderFactory>>
    connectableProviders?: readonly string[]
  }[],
): void {
  const next: Record<string, ProviderFactory> = {}
  const connectable = new Set<string>()
  const owner = new Map<string, string>()
  for (const extension of extensions) {
    for (const [id, factory] of Object.entries(extension.providers ?? {})) {
      if (!PROVIDER_ID.test(id)) {
        throw new Error(
          `Provider id "${id}" (extension "${extension.id}") is not valid: start with a lowercase letter, then lowercase letters, digits and dashes.`,
        )
      }
      if (Object.hasOwn(BUILT_IN, id)) {
        throw new Error(
          `Provider id "${id}" (extension "${extension.id}") is already a built-in provider.`,
        )
      }
      const first = owner.get(id)
      if (first !== undefined) {
        throw new Error(
          `Provider id "${id}" is registered twice (extensions "${first}" and "${extension.id}").`,
        )
      }
      // Built once here, as `GET /api/providers` builds it with no options:
      // a factory that can't, or a provider named otherwise, fails at startup.
      let name: string
      try {
        name = factory({}).name
      } catch (err) {
        throw new Error(
          `Provider "${id}" (extension "${extension.id}") could not be built: ${err instanceof Error ? err.message : String(err)}`,
          { cause: err },
        )
      }
      if (name !== id) {
        throw new Error(
          `Provider "${id}" (extension "${extension.id}") is named "${name}"; a provider's name must be its id.`,
        )
      }
      owner.set(id, extension.id)
      next[id] = factory
    }
  }
  for (const extension of extensions) {
    for (const id of extension.connectableProviders ?? []) {
      if (owner.get(id) !== extension.id) {
        throw new Error(
          `Extension "${extension.id}" lists "${id}" as connectable, but does not register that provider.`,
        )
      }
      connectable.add(id)
    }
  }
  fromExtensions = next
  connectableFromExtensions = connectable
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
  return all()[id]!(options)
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
