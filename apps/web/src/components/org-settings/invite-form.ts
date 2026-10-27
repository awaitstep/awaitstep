import type { NewInvitesInput } from '../../types/dashboard/org-settings'
import type { ProjectRole } from '../../types/dashboard/projects'
import type { WorkspaceRole } from '../../types/dashboard/workspaces'
import { plural } from '../../lib/plural'

/** Emails typed or pasted: split on commas, semicolons, spaces and new lines. */
export function parseEmails(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((email) => email.trim())
    .filter(Boolean)
}

/** A pick's default role: Project member for a project, Editor for a workspace. */
export function defaultRole(pickId: string): ProjectRole | WorkspaceRole {
  return pickId.startsWith('p:') ? 'member' : 'editor'
}

/** The picker's ids (`p:<project>`, `ws:<project>:<workspace>`) as invitation places. */
export function picksToPlaces(
  picks: readonly string[],
  roles: Readonly<Record<string, string>>,
): NewInvitesInput['places'] {
  return picks.map((id) => {
    const [kind, projectId, workspaceId] = id.split(':')
    const role = (roles[id] ?? defaultRole(id)) as ProjectRole | WorkspaceRole
    return { projectId: projectId!, workspaceId: kind === 'ws' ? workspaceId! : null, role }
  })
}

/** The footer line: "2 invites · they’ll open IT (Editor) and nothing else. …". */
export function inviteSummary(
  count: number,
  role: 'member' | 'admin',
  places: string[],
  orgName: string,
): string {
  const invites = plural(count, 'invite')
  const expiry = 'The link expires in 7 days.'
  if (role === 'admin') return `${invites} · they’ll be org admins. ${expiry}`
  if (places.length === 0) {
    return `${invites} · they’ll join ${orgName} and see nothing until someone adds them. ${expiry}`
  }
  return `${invites} · they’ll open ${places.join(', ')} and nothing else. ${expiry}`
}
