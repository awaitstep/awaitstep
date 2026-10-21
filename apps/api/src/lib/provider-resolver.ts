import type { WorkflowProvider, TemplateResolver } from '@awaitstep/codegen'
import type { ArtifactIR } from '@awaitstep/ir'
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
 * Validate that all nodes in the IR are compatible with the target deploy
 * provider. Returns the offending nodes by id and name: the name is what a
 * message should read, the id is what a client can locate on the canvas.
 */
export function validateNodesForProvider(
  ir: ArtifactIR,
  provider?: string,
): { valid: boolean; unsupportedNodes: { id: string; name: string }[] } {
  const name = provider ?? DEFAULT_PROVIDER
  const nodeProvider = NODE_PROVIDER_MAP[name]
  const unsupported = nodeProvider
    ? ir.nodes.filter((node) => node.provider !== nodeProvider)
    : ir.nodes
  return {
    valid: unsupported.length === 0,
    unsupportedNodes: unsupported.map((node) => ({ id: node.id, name: node.name })),
  }
}
