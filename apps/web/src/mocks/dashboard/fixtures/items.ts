import type { CallRow, ItemRow } from '../db'
import { daysAgo, minutesAgo } from './clock'
import { AMA, LENA } from './people'
import { IT, SALES, SUPPORT } from './workspaces'

// Workflows and functions from the Workflows, WsFunctions, ProjectShared and
// ProjectOverview boards. Sales = 4 workflows + 2 functions, 1 shared out
// (Lead enrichment); IT = 4 workflows + 1 function, 2 shared out.

export const LEAD = 'itm_lead'
export const QUOTE = 'itm_quote'
export const REPORT = 'itm_report'
export const TRIAGE = 'itm_triage'
export const CRM_SYNC = 'itm_crm_sync'
export const PRICING = 'itm_pricing'
export const PROVISION = 'itm_provision'
export const SLACK = 'itm_slack'

const MARKETING_DEFAULT = 'ws_marketing_default'
const INTERNAL_DEFAULT = 'ws_internal_default'

interface ItemSeed {
  id: string
  workspaceId: string
  name: string
  description: string
  version: number | null
  kind?: ItemRow['kind']
  route?: string
  ageDays?: number
  sharing?: ItemRow['sharing']
  traffic?: ItemRow['traffic']
}

export function seedItems(now: Date): ItemRow[] {
  const item = (seed: ItemSeed): ItemRow => ({
    id: seed.id,
    workspaceId: seed.workspaceId,
    kind: seed.kind ?? 'workflow',
    name: seed.name,
    description: seed.description,
    status: seed.version === null ? 'draft' : 'deployed',
    version: seed.version,
    route: seed.route ?? null,
    createdAt: daysAgo(now, seed.ageDays ?? 60),
    updatedAt: daysAgo(now, 2),
    sharing: seed.sharing ?? null,
    traffic: seed.traffic ?? null,
  })
  const workflows = (workspaceId: string, prefix: string, names: string[]) =>
    names.map((name, i) =>
      item({ id: `itm_${prefix}_${i}`, workspaceId, name, description: '', version: 1 + i }),
    )

  return [
    item({
      id: LEAD,
      workspaceId: SALES,
      name: 'Lead enrichment',
      description: 'Enrich new CRM leads with company data',
      version: 12,
      sharing: { sharedAt: '2026-10-03T10:00:00.000Z', sharedBy: AMA },
    }),
    item({
      id: QUOTE,
      workspaceId: SALES,
      name: 'Quote follow-up',
      description: 'Nudge prospects 3 days after a quote',
      version: 4,
    }),
    item({
      id: TRIAGE,
      workspaceId: SALES,
      name: 'Inbound webhook triage',
      description: 'Route form submissions to the right owner',
      version: 2,
    }),
    item({
      id: REPORT,
      workspaceId: SALES,
      name: 'Weekly pipeline report',
      description: 'Summarise the pipeline every Monday',
      version: null,
      ageDays: 4,
    }),
    item({
      id: CRM_SYNC,
      workspaceId: SALES,
      kind: 'script',
      name: 'CRM sync',
      description: 'Updates leads from the CRM',
      route: 'POST /crm/sync',
      version: 3,
      traffic: {
        requests: 2140,
        errorRate: 0.002,
        buckets: [120, 180, 240, 160, 280, 300, 260, 320, 210, 120, 70, 60],
      },
    }),
    item({
      id: PRICING,
      workspaceId: SALES,
      kind: 'script',
      name: 'Pricing webhook',
      description: 'Returns a quote',
      route: 'POST /pricing',
      version: 1,
      traffic: {
        requests: 312,
        errorRate: 0,
        buckets: [12, 18, 12, 24, 30, 18, 12, 36, 24, 18, 12, 18],
      },
    }),
    item({
      id: PROVISION,
      workspaceId: IT,
      name: 'Provision account',
      description: 'Create accounts and access for new hires',
      version: 7,
      sharing: { sharedAt: '2026-09-28T09:00:00.000Z', sharedBy: LENA },
    }),
    item({
      id: 'itm_offboard',
      workspaceId: IT,
      name: 'Offboard user',
      description: 'Revoke access when someone leaves',
      version: 3,
    }),
    item({
      id: 'itm_laptop',
      workspaceId: IT,
      name: 'Laptop request',
      description: 'Order and track hardware',
      version: 5,
    }),
    item({
      id: 'itm_access_review',
      workspaceId: IT,
      name: 'Access review',
      description: 'Quarterly review of who can reach what',
      version: null,
    }),
    item({
      id: SLACK,
      workspaceId: IT,
      kind: 'script',
      name: 'Send Slack alert',
      description: 'Posts an alert to a Slack channel',
      route: 'POST /alerts/slack',
      version: 3,
      sharing: { sharedAt: minutesAgo(now, 180), sharedBy: LENA },
      traffic: {
        requests: 860,
        errorRate: 0.01,
        buckets: [40, 60, 80, 70, 90, 100, 80, 90, 70, 60, 60, 60],
      },
    }),
    ...workflows(MARKETING_DEFAULT, 'mkt', [
      'Contact form',
      'Newsletter signup',
      'CMS publish hook',
      'Lead capture',
    ]),
    ...workflows(INTERNAL_DEFAULT, 'int', [
      'Nightly backup',
      'Invoice export',
      'Expense sync',
      'Payroll reminder',
      'Vendor onboarding',
      'Stale ticket sweep',
      'Report digest',
    ]),
  ]
}

/** "Called by IT", "Called by Sales, Support" on ProjectShared. */
export const CALLS: CallRow[] = [
  { callerWorkspaceId: IT, itemId: LEAD },
  { callerWorkspaceId: SALES, itemId: PROVISION },
  { callerWorkspaceId: SUPPORT, itemId: PROVISION },
  { callerWorkspaceId: SALES, itemId: SLACK },
]
