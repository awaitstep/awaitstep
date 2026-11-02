import { plural } from '../../lib/plural'
import { timeAgoOrDay } from '../../lib/time'
import type {
  AvailableConnection,
  ProjectConnection,
} from '../../types/dashboard/project-connections'

// The sentences on a project's Connections page (boards `ProjectConnections`,
// `AttachConnection`, `ProjectConnectionsEmpty`).

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']

function counted(n: number): string {
  return NUMBER_WORDS[n] ?? String(n)
}

/** "Two available, one it owns, one no longer available"; "None yet" with none. */
export function accountsCaption(
  connections: Pick<ProjectConnection, 'scope' | 'available'>[],
): string {
  if (connections.length === 0) return 'None yet'
  const shared = connections.filter((c) => c.scope === 'shared')
  const available = shared.filter((c) => c.available).length
  const gone = shared.length - available
  const owned = connections.length - shared.length
  const counts = [
    [available, 'available'],
    [owned, 'it owns'],
    [gone, 'no longer available'],
  ] as const
  return counts
    .filter(([n]) => n > 0)
    .map(([n, text], i) => `${i === 0 ? counted(n) : counted(n).toLowerCase()} ${text}`)
    .join(', ')
}

/** "Cloudflare account ••••7f2a · added by Ama Mensah". */
export function accountMeta(
  connection: Pick<ProjectConnection, 'accountSuffix' | 'createdByName'>,
): string {
  const account = connection.accountSuffix
    ? `Cloudflare account ••••${connection.accountSuffix}`
    : 'Cloudflare account'
  return connection.createdByName ? `${account} · added by ${connection.createdByName}` : account
}

/** The scope chip: "Shared by Acme Inc" or "This project only". */
export function scopeLabel(connection: Pick<ProjectConnection, 'scope'>, orgName: string): string {
  return connection.scope === 'project' ? 'This project only' : `Shared by ${orgName}`
}

/** "Deployed from Sales and IT"; "Not deployed from any workspace yet". */
export function deployedFromText(names: string[]): string {
  if (names.length === 0) return 'Not deployed from any workspace yet'
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  return `Deployed from ${list}`
}

/** "18 deployments · last 22m ago"; "No deployments yet". */
export function usageText(
  deployments: ProjectConnection['deployments'],
  now: Date = new Date(),
): string {
  if (deployments.count === 0 || !deployments.lastAt) return 'No deployments yet'
  return `${plural(deployments.count, 'deployment')} · last ${timeAgoOrDay(deployments.lastAt, now)}`
}

/** Add connection's line above its list (23b). */
export function availableNote(
  accounts: Pick<AvailableConnection, 'state'>[],
  orgName: string,
): string {
  if (accounts.length === 0) return `${orgName} has no shared accounts yet.`
  const restricted = accounts.filter((a) => a.state === 'restricted').length
  const lead = `${plural(accounts.length, 'account')} in ${orgName}.`
  if (restricted === 0) return lead
  return `${lead} ${restricted === 1 ? 'One is' : `${counted(restricted)} are`} restricted to other projects.`
}

/** A restricted account's line: "Restricted to Data Platform", or to unnamed projects. */
export function restrictedText(account: Pick<AvailableConnection, 'restrictedTo'>): string {
  const [first, ...rest] = account.restrictedTo
  if (!first) return 'Restricted to other projects'
  return rest.length === 0
    ? `Restricted to ${first}`
    : `Restricted to ${first} and ${plural(rest.length, 'other')}`
}

/** The confirm's body when an account is removed: what changes (D-PC-6). */
export function removeText(
  connection: Pick<ProjectConnection, 'name' | 'scope' | 'isDefault'>,
  workspacesUsing: string[],
  projectName: string,
): string {
  const what =
    connection.scope === 'project'
      ? `${connection.name} belongs to ${projectName}, so removing it deletes it.`
      : `${connection.name} stays in the organization; ${projectName} stops deploying to it.`
  const workspaces =
    workspacesUsing.length > 0
      ? ` ${deployedFromList(workspacesUsing)} ${workspacesUsing.length === 1 ? 'goes' : 'go'} back to the project default.`
      : ''
  const fallback = connection.isDefault
    ? ' It’s the default: until you pick another, Deploy asks which account to use.'
    : ''
  return `${what}${workspaces}${fallback} Deployed workflows keep running.`
}

function deployedFromList(names: string[]): string {
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}
