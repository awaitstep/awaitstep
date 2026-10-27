import type { OrgPage, OrgSettingsPage } from '../../../lib/dashboard-paths'
import type { ReleaseTag } from '../../../types/dashboard/inbox'
import type { EditRequestRow, NotificationReadRow, NotificationRow, ReleaseVisitRow } from '../db'
import { daysAgo, minutesAgo } from './clock'
import { ACME } from './orgs'
import { AMA, PRIYA } from './people'
import { P101 } from './projects'
import { IT, SALES } from './workspaces'

// `Notifications`: Ama's six. The board's request is from Daniel, already an
// Editor in Sales, so it comes from Priya, its only Viewer (D-P8-3).
// `WhatsNew`: five releases; Ama last looked on 20 Oct.

export const PRIYA_REQUEST = 'req_priya_sales'

export function seedEditRequests(now: Date): EditRequestRow[] {
  return [
    {
      id: PRIYA_REQUEST,
      workspaceId: SALES,
      userId: PRIYA,
      toUserId: AMA,
      at: minutesAgo(now, 40),
      status: 'pending',
    },
  ]
}

export function seedNotifications(now: Date): NotificationRow[] {
  const forAma = { orgId: ACME, userId: AMA }
  return [
    {
      ...forAma,
      id: 'ntf_failing',
      kind: 'failure',
      title: 'Lead enrichment failed 3 times in the last hour, at step “Fetch company”',
      projectId: P101,
      workspaceId: SALES,
      whereDetail: null,
      at: minutesAgo(now, 5),
      needsAction: true,
      link: { label: 'See runs', to: { kind: 'workspace', workspaceId: SALES, page: 'runs' } },
    },
    {
      ...forAma,
      id: 'ntf_key',
      kind: 'expiry',
      title: 'API key “Read-only dashboard” expires in 3 days',
      projectId: P101,
      workspaceId: null,
      whereDetail: null,
      at: minutesAgo(now, 120),
      needsAction: true,
      link: {
        label: 'Review key',
        to: { kind: 'project-settings', projectId: P101, page: 'api-keys' },
      },
    },
    {
      ...forAma,
      id: 'ntf_token',
      kind: 'expiry',
      title: 'Cloudflare token for “Marketing sandbox” expires in 6 days. Deploys to it will stop.',
      projectId: null,
      workspaceId: null,
      whereDetail: 'Connections',
      at: daysAgo(now, 1),
      needsAction: true,
      link: { label: 'Replace token', to: { kind: 'org-settings', page: 'connections' } },
    },
    {
      ...forAma,
      id: 'ntf_joined',
      kind: 'people',
      title: 'sam@acme.test accepted your invite',
      projectId: null,
      workspaceId: null,
      whereDetail: null,
      at: daysAgo(now, 2),
      needsAction: false,
      link: { label: 'See members', to: { kind: 'org-settings', page: 'members' } },
    },
    {
      ...forAma,
      id: 'ntf_deploy',
      kind: 'deploy',
      title: 'Lena Ortiz deployed Provision account v7, shared with every workspace',
      projectId: P101,
      workspaceId: IT,
      whereDetail: null,
      at: daysAgo(now, 3),
      needsAction: false,
      link: { label: 'Open', to: { kind: 'workspace', workspaceId: IT, page: 'workflows' } },
    },
  ]
}

/** On the board the last three are read. */
export const NOTIFICATION_READS: NotificationReadRow[] = [
  'ntf_token',
  'ntf_joined',
  'ntf_deploy',
].map((notificationId) => ({ userId: AMA, notificationId }))

export const RELEASE_VISITS: ReleaseVisitRow[] = [{ userId: AMA, at: '2026-10-20T09:00:00.000Z' }]

export interface ReleaseFixture {
  id: string
  tag: ReleaseTag
  date: string
  title: string
  body: string
  link: { label: string; page: OrgPage | { settings: OrgSettingsPage } }
}

/** The product's release notes: the same for everyone, newest first. */
export const RELEASES: ReleaseFixture[] = [
  {
    id: 'rel_workspaces',
    tag: 'new',
    date: '2026-10-24T12:00:00.000Z',
    title: 'Workspaces inside projects',
    body: 'Give each team its own workspace with separate people, keys and workflows. Anything set at the project level still reaches every workspace.',
    link: { label: 'See your projects', page: 'projects' },
  },
  {
    id: 'rel_keys',
    tag: 'new',
    date: '2026-10-24T12:00:00.000Z',
    title: 'API keys at org, project and workspace level',
    body: 'Pick what a key reaches and exactly which actions it can take. The key is shown once when you create it.',
    link: { label: 'Manage API keys', page: { settings: 'api-keys' } },
  },
  {
    id: 'rel_resources',
    tag: 'improved',
    date: '2026-10-17T12:00:00.000Z',
    title: 'Install marketplace nodes from Resources',
    body: 'Browse the marketplace and install nodes for the whole org in one place. Workflows keep the version they were built with.',
    link: { label: 'Open Resources', page: 'resources' },
  },
  {
    id: 'rel_lock',
    tag: 'new',
    date: '2026-10-12T12:00:00.000Z',
    title: 'Deletion lock for projects',
    body: 'Turn it on to stop a project and its workspaces from being deleted by mistake.',
    link: { label: 'See your projects', page: 'projects' },
  },
  {
    id: 'rel_audit',
    tag: 'fixed',
    date: '2026-10-09T12:00:00.000Z',
    title: 'Audit log export includes the API key used',
    body: 'CSV exports now name the key prefix for every action taken through the API.',
    link: { label: 'Open audit log', page: 'audit' },
  },
]
