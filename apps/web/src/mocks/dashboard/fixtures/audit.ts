import type { AuditRow } from '../db'
import { daysAgo, minutesAgo } from './clock'
import { ACME } from './orgs'
import { INTERNAL, P101 } from './projects'
import { IT, SALES, SUPPORT } from './workspaces'

// `AuditLog`: the board's seven events in the last week, then older ones so
// the longer periods have pages to step through. Fixed samples: nothing the
// session does on the dummy data is recorded (D-P7-6).

type Event = Omit<AuditRow, 'id' | 'orgId' | 'at'>

const at = {
  org: { level: 'organization', projectId: null, workspaceId: null },
  p101: { level: 'project', projectId: P101, workspaceId: null },
  internal: { level: 'project', projectId: INTERNAL, workspaceId: null },
  sales: { level: 'workspace', projectId: P101, workspaceId: SALES },
  it: { level: 'workspace', projectId: P101, workspaceId: IT },
  support: { level: 'workspace', projectId: P101, workspaceId: SUPPORT },
} as const

const BOARD: { minutes: number; event: Event }[] = [
  {
    minutes: 4,
    event: {
      kind: 'danger',
      actor: 'Tom Becker',
      action: 'tried to delete the workspace',
      target: 'IT',
      detail: 'Blocked by the deletion lock · 81.2.69.x',
      ...at.p101,
    },
  },
  {
    minutes: 22,
    event: {
      kind: 'deploy',
      actor: 'CI deploys',
      action: 'deployed',
      target: 'Lead enrichment v12',
      detail: 'Project API key ask_p1…a71d',
      ...at.sales,
    },
  },
  {
    minutes: 60,
    event: {
      kind: 'key',
      actor: 'Ama Mensah',
      action: 'created the API key',
      target: 'CRM webhook',
      detail: 'Dashboard · read, write on Workflows',
      ...at.sales,
    },
  },
  {
    minutes: 120,
    event: {
      kind: 'access',
      actor: 'Ama Mensah',
      action: 'added Daniel Kim to',
      target: 'Sales',
      detail: 'Role: Editor',
      ...at.sales,
    },
  },
  {
    minutes: 2 * 24 * 60,
    event: {
      kind: 'access',
      actor: 'Ama Mensah',
      action: 'invited',
      target: 'sam@acme.test',
      detail: 'Org role: Member',
      ...at.org,
    },
  },
  {
    minutes: 3 * 24 * 60,
    event: {
      kind: 'auth',
      actor: 'Unknown',
      action: 'failed to sign in as',
      target: 'tom@acme.test',
      detail: '5 attempts · 203.0.113.x · locked for 15 min',
      ...at.org,
    },
  },
  {
    minutes: 6 * 24 * 60,
    event: {
      kind: 'lock',
      actor: 'Ama Mensah',
      action: 'turned on the deletion lock for',
      target: 'Project 101',
      detail: 'Dashboard',
      ...at.p101,
    },
  },
]

const OLDER: Event[] = [
  {
    kind: 'deploy',
    actor: 'CI deploys',
    action: 'deployed',
    target: 'Lead enrichment v11',
    detail: 'Project API key ask_p1…a71d',
    ...at.sales,
  },
  {
    kind: 'auth',
    actor: 'Lena Ortiz',
    action: 'signed in to',
    target: 'Acme Inc',
    detail: 'Password · 198.51.100.x',
    ...at.org,
  },
  {
    kind: 'access',
    actor: 'Ama Mensah',
    action: 'changed Priya Shah’s role in',
    target: 'Sales',
    detail: 'Viewer → Editor',
    ...at.sales,
  },
  {
    kind: 'deploy',
    actor: 'Tom Becker',
    action: 'deployed',
    target: 'Provision account v4',
    detail: 'Dashboard',
    ...at.it,
  },
  {
    kind: 'key',
    actor: 'Tom Becker',
    action: 'revoked the API key',
    target: 'Old CI token',
    detail: 'Dashboard',
    ...at.p101,
  },
  {
    kind: 'access',
    actor: 'Ama Mensah',
    action: 'made Tom Becker a project admin of',
    target: 'Project 101',
    detail: 'Was: Project member',
    ...at.p101,
  },
  {
    kind: 'deploy',
    actor: 'Daniel Kim',
    action: 'deployed',
    target: 'Ticket triage v3',
    detail: 'Dashboard',
    ...at.support,
  },
  {
    kind: 'key',
    actor: 'Ama Mensah',
    action: 'created the API key',
    target: 'Terraform',
    detail: 'Dashboard · read on every resource',
    ...at.org,
  },
  {
    kind: 'danger',
    actor: 'Lena Ortiz',
    action: 'deleted the workflow',
    target: 'Old onboarding',
    detail: 'Dashboard',
    ...at.internal,
  },
  {
    kind: 'auth',
    actor: 'Daniel Kim',
    action: 'signed in to',
    target: 'Acme Inc',
    detail: 'Google · 192.0.2.x',
    ...at.org,
  },
]

const OLDER_COUNT = 40

/** Board events first, then older ones spread from 8 to about 85 days back. */
export function seedAudit(now: Date): AuditRow[] {
  const board = BOARD.map(({ minutes, event }, i) => ({
    id: `aud_board_${i + 1}`,
    orgId: ACME,
    at: minutesAgo(now, minutes),
    ...event,
  }))
  const older = Array.from({ length: OLDER_COUNT }, (_, i) => ({
    id: `aud_older_${i + 1}`,
    orgId: ACME,
    at: daysAgo(now, 8 + i * 1.9),
    ...OLDER[i % OLDER.length]!,
  }))
  return [...board, ...older]
}
