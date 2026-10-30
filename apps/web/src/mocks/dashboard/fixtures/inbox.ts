import type { EditRequestRow, NotificationReadRow, NotificationRow, ReleaseVisitRow } from '../db'
import { daysAgo, minutesAgo } from './clock'
import { ACME } from './orgs'
import { AMA, PRIYA } from './people'
import { P101 } from './projects'
import { IT, SALES } from './workspaces'

// `Notifications`: Ama's six. The board's request is from Daniel, already an
// Editor in Sales, so it comes from Priya, its only Viewer (D-P8-3).
// `WhatsNew`: the real notes (`content/releases.ts`); Ama last looked on 29 Oct at noon.

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

/** Ama last looked on 29 Oct at noon: the four notes from before then. */
export const RELEASE_VISITS: ReleaseVisitRow[] = [
  {
    userId: AMA,
    at: '2026-10-29T12:00:00.000Z',
    seenIds: ['rel_lock', 'rel_variables', 'rel_keys', 'rel_workspaces'],
  },
]
