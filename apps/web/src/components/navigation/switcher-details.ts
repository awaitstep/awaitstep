import type { Project } from '../../types/dashboard/projects'
import type { OrgRole, OrgSummary } from '../../types/dashboard/session'
import type { Workspace } from '../../types/dashboard/workspaces'

// The second line of each switcher row.

const ROLE_LABEL: Record<OrgRole, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' }

/** A workspace this young reads "New". */
const NEW_FOR_MS = 7 * 24 * 60 * 60_000

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

/** "Owner · 3 projects · 6 members". */
export function orgDetail(org: OrgSummary): string {
  return [
    ROLE_LABEL[org.role],
    plural(org.projectCount, 'project'),
    plural(org.memberCount, 'member'),
  ].join(' · ')
}

/**
 * "3 workspaces · Sales, IT, Support · opens in Sales" — names and the
 * landing workspace only when there's a choice; "1 workspace" otherwise.
 */
export function projectDetail(project: Project, recent: readonly string[]): string {
  const workspaces = project.workspaces
  const count = plural(workspaces.length, 'workspace')
  if (workspaces.length < 2) return count
  const opens =
    recent.map((slug) => workspaces.find((w) => w.slug === slug)).find(Boolean) ?? workspaces[0]!
  return `${count} · ${workspaces.map((w) => w.name).join(', ')} · opens in ${opens.name}`
}

/** "4 workflows · 4 members", or "New · nothing built yet" for a young, empty one. */
export function workspaceDetail(workspace: Workspace, now: Date = new Date()): string {
  const empty = workspace.counts.workflows === 0 && workspace.counts.functions === 0
  if (empty) {
    const isNew = now.getTime() - new Date(workspace.createdAt).getTime() < NEW_FOR_MS
    return isNew ? 'New · nothing built yet' : 'Nothing built yet'
  }
  return `${plural(workspace.counts.workflows, 'workflow')} · ${plural(workspace.people.length, 'member')}`
}
