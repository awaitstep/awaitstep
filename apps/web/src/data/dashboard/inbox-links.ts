import type { InboxNotification as ApiInboxNotification, NotificationTarget } from '@awaitstep/ir'
import {
  orgSettingsPath,
  projectSettingsPath,
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
      return projectSettingsPath({ org, project: to.project }, to.page)
    case 'org-settings':
      return orgSettingsPath(org, to.page)
  }
}

/** The API's notification as the dashboard draws it: its link a path. */
export function inboxNotification(org: string, n: ApiInboxNotification): InboxNotification {
  const { link, ...rest } = n
  return link
    ? { ...rest, link: { label: link.label, href: notificationHref(org, link.to) } }
    : rest
}
