import type { InboxNotification, Release } from '../../../../../types/dashboard/inbox'

// Canvas sample data for the Notifications and WhatsNew boards. Times are
// relative to when the module loads.

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

export const FAILURE: InboxNotification = {
  id: 'fail',
  kind: 'failure',
  title: 'Lead enrichment failed 3 times in the last hour, at step "Fetch company"',
  where: 'Project 101 · Sales',
  at: minutesAgo(5),
  read: false,
  needsAction: true,
  link: { label: 'See runs', href: '/acme/project-101/sales/runs' },
}

export const REQUEST: InboxNotification = {
  id: 'req',
  kind: 'request',
  title: 'Daniel Kim asked for edit access to Sales',
  where: 'Project 101 · Sales',
  at: minutesAgo(40),
  read: false,
  needsAction: true,
  request: { status: 'pending' },
}

export const APPROVED: InboxNotification = {
  ...REQUEST,
  read: true,
  needsAction: false,
  request: { status: 'approved', outcome: 'Approved. Daniel is now an Editor in Sales.' },
}

export const DECLINED: InboxNotification = {
  ...REQUEST,
  read: true,
  needsAction: false,
  request: { status: 'declined', outcome: 'Declined. Daniel was told.' },
}

export const JOINED: InboxNotification = {
  id: 'joined',
  kind: 'people',
  title: 'sam@acme.test accepted your invite',
  where: 'Acme Inc',
  at: minutesAgo(2 * 24 * 60),
  read: true,
  needsAction: false,
  link: { label: 'See members', href: '/acme/settings/members' },
}

export const WORKSPACES_RELEASE: Release = {
  id: 'workspaces',
  tag: 'new',
  date: '2026-10-24T12:00:00.000Z',
  title: 'Workspaces inside projects',
  body: 'Give each team its own workspace with separate people, keys and workflows. Anything set at the project level still reaches every workspace.',
  link: { label: 'See your workspaces', href: '/acme/project-101/settings/workspaces' },
  fresh: true,
}

export const RESOURCES_RELEASE: Release = {
  id: 'resources',
  tag: 'improved',
  date: '2026-10-17T12:00:00.000Z',
  title: 'Install marketplace nodes from Resources',
  body: 'Browse the marketplace and install nodes for the whole org in one place. Workflows keep the version they were built with.',
  link: { label: 'Open Resources', href: '/acme/resources' },
  fresh: false,
}

export const AUDIT_RELEASE: Release = {
  id: 'audit-export',
  tag: 'fixed',
  date: '2026-10-09T12:00:00.000Z',
  title: 'Audit log export includes the API key used',
  body: 'CSV exports now name the key prefix for every action taken through the API.',
  link: { label: 'Open audit log', href: '/acme/audit' },
  fresh: false,
}
