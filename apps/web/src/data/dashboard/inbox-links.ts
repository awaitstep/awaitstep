import type {
  InboxNotification as ApiInboxNotification,
  NotificationTarget,
  OssFeature,
} from '@awaitstep/ir'
import {
  orgDestinationPath,
  projectPagePath,
  workspacePath,
  workspaceSettingsPath,
} from '../../lib/dashboard-paths'
import type { InboxNotification } from '../../types/dashboard/inbox'

/** Where a notification's link goes, as a path in the org the Inbox is open in. */
export function notificationHref(org: string, to: NotificationTarget): string {
  switch (to.kind) {
    case 'workspace':
      return workspacePath({ org, project: to.project, workspace: to.workspace }, to.page)
    case 'workspace-settings':
      return workspaceSettingsPath({ org, project: to.project, workspace: to.workspace }, to.tab)
    case 'project-settings':
      return projectPagePath({ org, project: to.project }, to.page)
    case 'org-settings':
      // Connections and API keys left Settings for their own pages: stored links follow.
      return orgDestinationPath(org, to.page)
    case 'project-connections':
      return projectPagePath({ org, project: to.project }, 'connections')
  }
}

/** Whether the target is a Connections page. */
function isConnectionsTarget(to: NotificationTarget): boolean {
  return (
    to.kind === 'project-connections' || (to.kind === 'org-settings' && to.page === 'connections')
  )
}

/**
 * The API's notification as the dashboard draws it: its link a path, or none
 * when it points at a page the instance switches off (`disabled`).
 */
export function inboxNotification(
  org: string,
  n: ApiInboxNotification,
  disabled: readonly OssFeature[] = [],
): InboxNotification {
  const { link, ...rest } = n
  if (!link) return rest
  if (isConnectionsTarget(link.to) && disabled.includes('connections.ui')) return rest
  return { ...rest, link: { label: link.label, href: notificationHref(org, link.to) } }
}
