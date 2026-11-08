import type { DeployConnections } from '@awaitstep/ir'

export interface RunConnection {
  name: string
  /** The account it deploys to, in full or by its last four characters; null when unknown. */
  account: string | null
}

/**
 * The account a run went out with: the project's own, or one the workflow was
 * deployed with that the project has since dropped. The deploy page's answer
 * already names every account the workflow can use, so no org list is read.
 */
export function runConnection(
  connectionId: string | null | undefined,
  deploy: DeployConnections | undefined,
): RunConnection | null {
  if (!connectionId) return null
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
