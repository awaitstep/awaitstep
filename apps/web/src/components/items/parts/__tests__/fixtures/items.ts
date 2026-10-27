import type { SharedItem, WorkspaceItem } from '../../../../../types/dashboard/items'

// Sales's rows from the Workflows and WsFunctions boards, for the parts' stories and tests.

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
const IT = { id: 'ws_it', slug: 'it', name: 'IT', colour: 'blue' as const }

function workflow(overrides: Partial<WorkspaceItem>): WorkspaceItem {
  return {
    id: 'itm',
    name: '',
    kind: 'workflow',
    workspaceId: 'ws_sales',
    description: null,
    status: 'deployed',
    version: 1,
    route: null,
    recentRuns: [],
    lastRun: null,
    traffic: null,
    sharing: null,
    usedBy: [],
    shareToggle: { allowed: true },
    createdAt: ago(60 * 24 * 30),
    updatedAt: ago(60 * 24 * 2),
    ...overrides,
  }
}

const runs = (pattern: string) =>
  pattern.split('').map((c) => (c === 'p' ? 'succeeded' : 'failed') as 'succeeded' | 'failed')

export const LEAD_ENRICHMENT = workflow({
  id: 'itm_lead',
  name: 'Lead enrichment',
  description: 'Enrich new CRM leads with company data',
  version: 12,
  recentRuns: runs('ppppfpppff'),
  lastRun: { result: 'failed', at: ago(5) },
  sharing: { sharedAt: ago(60 * 24 * 10), sharedBy: { id: 'usr_ama', name: 'Ama Mensah' } },
  usedBy: [IT],
  shareToggle: {
    allowed: false,
    reason: 'Called by IT. Unshare is blocked while another workspace uses it',
  },
})

export const QUOTE_FOLLOW_UP = workflow({
  id: 'itm_quote',
  name: 'Quote follow-up',
  description: 'Nudge prospects 3 days after a quote',
  version: 4,
  recentRuns: runs('pppppppppp'),
  lastRun: { result: 'succeeded', at: ago(22) },
})

export const WEEKLY_REPORT = workflow({
  id: 'itm_report',
  name: 'Weekly pipeline report',
  description: 'Summarise the pipeline every Monday',
  status: 'draft',
  version: null,
})

export const CRM_SYNC = workflow({
  id: 'itm_crm_sync',
  name: 'CRM sync',
  kind: 'script',
  description: 'Updates leads from the CRM',
  route: 'POST /crm/sync',
  version: 3,
  traffic: {
    requests: 2140,
    errorRate: 0.002,
    buckets: [120, 180, 240, 160, 280, 300, 260, 320, 210, 120, 70, 60],
  },
})

export const PROVISION_ACCOUNT: SharedItem = {
  id: 'itm_provision',
  name: 'Provision account',
  kind: 'workflow',
  version: 7,
  from: IT,
  usedBy: [],
  sharedAt: ago(60 * 24 * 20),
  sharedBy: { id: 'usr_lena', name: 'Lena Vogel' },
  unshare: { allowed: true },
}

export const SEND_SLACK_ALERT: SharedItem = {
  ...PROVISION_ACCOUNT,
  id: 'itm_slack',
  name: 'Send Slack alert',
  kind: 'script',
  version: 3,
}
