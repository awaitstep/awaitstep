import type { DeployConnections } from '@awaitstep/ir'

export interface RunConnection {
  name: string
  /** The account it deploys to, in full or by its last four characters; null when unknown. */
  account: string | null
}

interface OrgConnection {
  id: string
  name: string
  credentials: Record<string, string> | string
}

/**
 * The account a run went out with. It may be the org's, the project's own, or
 * one the workflow was deployed with that the project has since dropped.
 */
export function runConnection(
  connectionId: string | null | undefined,
  org: readonly OrgConnection[] | undefined,
  deploy: DeployConnections | undefined,
): RunConnection | null {
  if (!connectionId) return null
  const fromOrg = org?.find((c) => c.id === connectionId)
  if (fromOrg) {
    const account = typeof fromOrg.credentials === 'string' ? null : fromOrg.credentials.accountId
    return { name: fromOrg.name, account: account ?? null }
  }
  const fromProject = deploy?.connections.find((c) => c.id === connectionId)
  if (fromProject) {
    return {
      name: fromProject.name,
      account: fromProject.accountSuffix ? `…${fromProject.accountSuffix}` : null,
    }
  }
  const deployedWith = deploy?.deployedWith.find((c) => c.id === connectionId)
  return deployedWith ? { name: deployedWith.name, account: null } : null
}
