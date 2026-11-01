import { format } from 'date-fns'
import type { InviteDetails, InvitePlace } from '../../types/dashboard/invites'
import type { OrgRole } from '../../types/dashboard/session'

const PLACE_ROLE: Record<string, { label: string; detail: string }> = {
  'workspace:viewer': { label: 'Viewer', detail: 'See workflows and runs' },
  'workspace:editor': { label: 'Editor', detail: 'Build, run and deploy workflows' },
  'workspace:admin': {
    label: 'Workspace admin',
    detail: 'Build, deploy and manage people and keys',
  },
  'project:member': { label: 'Project member', detail: 'Work in every workspace in it' },
  'project:admin': { label: 'Project admin', detail: 'Run the project and every workspace in it' },
}

const ORG_ROLE: Record<Exclude<OrgRole, 'member'>, { label: string; detail: string }> = {
  admin: { label: 'Admin', detail: 'Every project, plus members, connections and resources' },
  owner: { label: 'Owner', detail: 'Everything, including billing and deleting the org' },
}

/** "Editor · Build, run and deploy workflows": the role an invite gives, in words. */
export function inviteRole(invite: InviteDetails): { label: string; detail: string } {
  if (invite.orgRole !== 'member') return ORG_ROLE[invite.orgRole]
  if (!invite.place) return { label: 'Member', detail: 'Sees what someone adds them to' }
  return PLACE_ROLE[`${invite.place.kind}:${invite.place.role}`]!
}

/** "Workspace" or "Project", for the place fact. */
export function placeKind(place: InvitePlace): string {
  return place.kind === 'workspace' ? 'Workspace' : 'Project'
}

/** "1 Nov". */
export function shortDay(iso: string): string {
  return format(new Date(iso), 'd MMM')
}

export function firstName(name: string): string {
  return name.split(' ')[0]!
}
