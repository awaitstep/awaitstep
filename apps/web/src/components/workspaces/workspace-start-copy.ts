import { plural } from '../../lib/plural'
import type { SharedItem } from '../../types/dashboard/items'
import type { Connection } from '../../types/dashboard/org-settings'
import type { Person } from '../../types/dashboard/session'

// The sentences on a new workspace's Overview (`WsOverview`, New state).

const NAMED = 3

/** "2 can open Default: you and Frank Owusu": the viewer first, as "you"; past three names, "and 2 more". */
export function peopleSentence(
  people: Person[],
  viewerId: string | undefined,
  workspaceName: string,
): string {
  const lead = `${people.length} can open ${workspaceName}`
  if (people.length === 0) return lead
  const names = [
    ...people.filter((p) => p.id === viewerId).map(() => 'you'),
    ...people.filter((p) => p.id !== viewerId).map((p) => p.name || p.email),
  ]
  const shown = names.length > NAMED + 1 ? names.slice(0, NAMED) : names
  const rest = names.length - shown.length
  const parts = rest > 0 ? [...shown, `${rest} more`] : shown
  const list =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
  return `${lead}: ${list}`
}

/** "Acme production, inherited from Project 101"; null when nothing deploys the project yet. */
export function deploysSentence(connections: Connection[], projectName: string): string | null {
  const [first] = connections
  if (!first) return null
  const more = connections.length > 1 ? ` and ${connections.length - 1} more` : ''
  return `${first.name}${more}, inherited from ${projectName}`
}

/** "Nothing shared in or out of this workspace yet", else the counts each way. */
export function sharedSentence(sharedIn: number, sharedOut: number): string {
  if (sharedIn === 0 && sharedOut === 0) return 'Nothing shared in or out of this workspace yet'
  return `${sharedIn} shared in · ${sharedOut} shared out`
}

/** The Reuse card's line: what the project already shares with this workspace. */
export function reuseSentence(sharedIn: SharedItem[], projectName: string): string {
  if (sharedIn.length === 0) {
    return 'Nothing is shared with this workspace yet. What other workspaces share shows up in the library.'
  }
  const noun = sharedIn.every((item) => item.kind === 'workflow') ? 'workflow' : 'item'
  return `${projectName} already shares ${plural(sharedIn.length, noun)} with this workspace. Call them instead of rebuilding.`
}
