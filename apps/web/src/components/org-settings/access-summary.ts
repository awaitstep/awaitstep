import type { AccessPlace, Invitation } from '../../types/dashboard/org-settings'
import type { ProjectRole } from '../../types/dashboard/projects'
import type { WorkspaceRole } from '../../types/dashboard/workspaces'
import {
  ORG_ROLE_LABEL,
  PROJECT_ROLE_LABEL,
  WORKSPACE_ROLE_LABEL,
} from '../access/parts/access-draft'

/**
 * One "Has access to" line (`OrgMembers`): "Project 101 · all workspaces",
 * "Internal Tools" (a one-workspace project), "Project 101 · Sales (Editor)".
 */
export function placeLabel(place: AccessPlace): string {
  if (place.workspace) {
    return `${place.project.name} · ${place.workspace.name} (${WORKSPACE_ROLE_LABEL[place.role as WorkspaceRole]})`
  }
  return place.project.workspaceCount > 1
    ? `${place.project.name} · all workspaces`
    : place.project.name
}

/** "Member · Project 101 · IT", under a pending invitation. */
export function invitationLabel(invitation: Invitation): string {
  const places = invitation.places.map((place) =>
    place.kind === 'workspace'
      ? `${place.project} · ${place.workspace}`
      : `${place.project} (${PROJECT_ROLE_LABEL[place.role as ProjectRole]})`,
  )
  return [ORG_ROLE_LABEL[invitation.role], ...places].join(' · ')
}
