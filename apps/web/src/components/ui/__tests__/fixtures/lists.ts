import type { PillStatus } from '../../status-pill'
import type { RunOutcome } from '../../run-history-bars'

// Canvas sample data (Sales in Project 101) shared by the list stories and tests.

export interface SampleWorkflow {
  id: string
  name: string
  description: string
  status: PillStatus
  statusLabel: string
  last: string
  failing: boolean
  runs: RunOutcome[]
  shared: boolean
}

const ok = 'ok' as const
const fail = 'fail' as const

export const SALES_WORKFLOWS: SampleWorkflow[] = [
  {
    id: 'lead',
    name: 'Lead enrichment',
    description: 'Enrich new CRM leads with company data',
    status: 'deployed',
    statusLabel: 'Deployed · v12',
    last: 'Failed 5m ago',
    failing: true,
    runs: [ok, ok, ok, ok, fail, ok, ok, ok, fail, fail],
    shared: true,
  },
  {
    id: 'quote',
    name: 'Quote follow-up',
    description: 'Nudge prospects 3 days after a quote',
    status: 'deployed',
    statusLabel: 'Deployed · v4',
    last: 'Succeeded 22m ago',
    failing: false,
    runs: [ok, ok, ok, ok, ok, ok, ok, ok, ok, ok],
    shared: false,
  },
  {
    id: 'triage',
    name: 'Inbound webhook triage',
    description: 'Route form submissions to the right owner',
    status: 'deployed',
    statusLabel: 'Deployed · v2',
    last: 'Succeeded 1h ago',
    failing: false,
    runs: [ok, ok, ok, ok, ok, ok, fail, ok, ok, ok],
    shared: false,
  },
  {
    id: 'report',
    name: 'Weekly pipeline report',
    description: 'Summarise the pipeline every Monday',
    status: 'draft',
    statusLabel: 'Draft',
    last: 'Never run',
    failing: false,
    runs: [],
    shared: false,
  },
]

export interface SampleRun {
  id: string
  result: 'failed' | 'running' | 'succeeded'
  workflow: string
  kind: string
  trigger: string
  started: string
  took: string
}

export const SALES_RUNS: SampleRun[] = [
  {
    id: 'run_8f2c',
    result: 'failed',
    workflow: 'Lead enrichment',
    kind: 'Workflow',
    trigger: 'Webhook',
    started: '5m ago',
    took: '4.2s',
  },
  {
    id: 'run_8f2a',
    result: 'running',
    workflow: 'Weekly pipeline report',
    kind: 'Workflow · waiting on step "Wait 1 day"',
    trigger: 'Schedule',
    started: '12m ago',
    took: '—',
  },
  {
    id: 'run_8f27',
    result: 'succeeded',
    workflow: 'Quote follow-up',
    kind: 'Workflow',
    trigger: 'Schedule',
    started: '22m ago',
    took: '1.1s',
  },
  {
    id: 'req_31c9',
    result: 'succeeded',
    workflow: 'CRM sync',
    kind: 'Function',
    trigger: 'HTTP',
    started: '31m ago',
    took: '86ms',
  },
  {
    id: 'run_8f11',
    result: 'failed',
    workflow: 'Lead enrichment',
    kind: 'Workflow',
    trigger: 'Webhook',
    started: '48m ago',
    took: '3.9s',
  },
  {
    id: 'run_8f03',
    result: 'succeeded',
    workflow: 'Inbound webhook triage',
    kind: 'Workflow',
    trigger: 'Webhook',
    started: '1h ago',
    took: '2.7s',
  },
  {
    id: 'run_8ef9',
    result: 'succeeded',
    workflow: 'Lead enrichment',
    kind: 'Workflow',
    trigger: 'Webhook',
    started: '1h ago',
    took: '3.1s',
  },
  {
    id: 'req_30a2',
    result: 'succeeded',
    workflow: 'Pricing webhook',
    kind: 'Function',
    trigger: 'HTTP',
    started: '2h ago',
    took: '41ms',
  },
]

export const PEOPLE = [
  { id: 'ama', name: 'Ama Mensah' },
  { id: 'daniel', name: 'Daniel Kim' },
  { id: 'lena', name: 'Lena Ortiz' },
  { id: 'priya', name: 'Priya Shah' },
  { id: 'jonas', name: 'Jonas Reed' },
  { id: 'tomas', name: 'Tomás Barros' },
]
