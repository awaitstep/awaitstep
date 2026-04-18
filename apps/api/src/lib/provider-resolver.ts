import type { WorkflowProvider, TemplateResolver } from '@awaitstep/codegen'
import type { WorkflowIR } from '@awaitstep/ir'
import { CloudflareWorkflowsAdapter, type WranglerDeployer } from '@awaitstep/provider-cloudflare'

const DEFAULT_PROVIDER = 'cloudflare'

/** Maps provider config name to the node-level provider value used in IR nodes. */
const NODE_PROVIDER_MAP: Record<string, string> = {
  cloudflare: 'cloudflare',
}

export function resolveProvider(
  provider?: string,
  options?: { templateResolver?: TemplateResolver; deployer?: WranglerDeployer },
): WorkflowProvider {
  const name = provider ?? DEFAULT_PROVIDER

  switch (name) {
    case 'cloudflare':
      return new CloudflareWorkflowsAdapter({
        templateResolver: options?.templateResolver,
        deployer: options?.deployer,
      })
    default:
      throw new Error(`Unsupported provider: ${name}`)
  }
}

/**
 * Validate that all nodes in the IR are compatible with the target deploy provider.
 * Returns a list of node names that don't support the provider.
 */
export function validateNodesForProvider(
  ir: WorkflowIR,
  provider?: string,
): { valid: boolean; unsupportedNodes: string[] } {
  const name = provider ?? DEFAULT_PROVIDER
  const nodeProvider = NODE_PROVIDER_MAP[name]
  if (!nodeProvider) {
    return { valid: false, unsupportedNodes: ir.nodes.map((n) => n.name) }
  }

  const unsupported = ir.nodes.filter((node) => node.provider !== nodeProvider)
  return {
    valid: unsupported.length === 0,
    unsupportedNodes: unsupported.map((n) => n.name),
  }
}
