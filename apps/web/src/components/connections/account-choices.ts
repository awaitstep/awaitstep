import type {
  AvailableConnection,
  ProjectConnection,
  ProjectWorkspaceConnection,
} from '../../types/dashboard/project-connections'
import { scopeLabel } from '../project-connections/project-connections-copy'

/** One account a Settings picker offers. */
export interface AccountChoice {
  id: string
  name: string
  /** "Shared by Acme Inc", "This project only", or "Not added yet". */
  description: string
  /** False for an org account the project hasn't added: choosing it adds it first. */
  attached: boolean
}

/**
 * What the project's default can be: its accounts Deploy accepts, then the
 * org's accounts it may add but hasn't. Restricted ones aren't offered.
 */
export function defaultAccountChoices(
  connections: Pick<ProjectConnection, 'id' | 'name' | 'scope' | 'available'>[],
  available: Pick<AvailableConnection, 'id' | 'name' | 'state'>[],
  orgName: string,
): AccountChoice[] {
  const attached = new Set(connections.map((c) => c.id))
  return [
    ...connections
      .filter((c) => c.available)
      .map((c) => ({
        id: c.id,
        name: c.name,
        description: scopeLabel(c, orgName),
        attached: true,
      })),
    ...available
      .filter((a) => a.state === 'available' && !attached.has(a.id))
      .map((a) => ({ id: a.id, name: a.name, description: 'Not added yet', attached: false })),
  ]
}

/** A workspace's account as its Settings row says it. */
export function workspaceAccountText(
  workspace: Pick<ProjectWorkspaceConnection, 'source' | 'connectionName'>,
): string {
  if (workspace.source === 'override' && workspace.connectionName) return workspace.connectionName
  if (workspace.source === 'default' && workspace.connectionName) {
    return `Project default (${workspace.connectionName})`
  }
  return 'None yet'
}
