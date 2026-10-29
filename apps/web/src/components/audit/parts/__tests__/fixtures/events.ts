import type { AuditEvent } from '../../../../../types/dashboard/audit'

// Canvas sample data for the AuditLog board. Times are relative to when the
// module loads, except the lock, which the canvas dates 12 Oct.

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

export const AUDIT_EVENTS: AuditEvent[] = [
  {
    id: 'blocked-delete',
    at: minutesAgo(4),
    kind: 'danger',
    actor: 'Tom Becker',
    action: 'tried to delete the workspace',
    target: 'IT',
    detail: 'Blocked by the deletion lock · 81.2.69.x',
    scope: { level: 'project', name: 'Project 101' },
  },
  {
    id: 'deploy',
    at: minutesAgo(22),
    kind: 'deploy',
    actor: 'CI deploys',
    action: 'deployed',
    target: 'Lead enrichment v12',
    detail: 'Project API key ask_Kq3VtR8m…a71d',
    scope: { level: 'workspace', name: 'Project 101 · Sales', colour: 'green' },
  },
  {
    id: 'key',
    at: minutesAgo(60),
    kind: 'key',
    actor: 'Ama Mensah',
    action: 'created the API key',
    target: 'CRM webhook',
    detail: 'Dashboard · read, write on Workflows',
    scope: { level: 'workspace', name: 'Project 101 · Sales', colour: 'green' },
  },
  {
    id: 'access',
    at: minutesAgo(120),
    kind: 'access',
    actor: 'Ama Mensah',
    action: 'added Daniel Kim to',
    target: 'Sales',
    detail: 'Role: Editor',
    scope: { level: 'workspace', name: 'Project 101 · Sales', colour: 'green' },
  },
  {
    id: 'sign-in',
    at: minutesAgo(3 * 24 * 60),
    kind: 'auth',
    actor: 'Unknown',
    action: 'failed to sign in as',
    target: 'tom@acme.test',
    detail: '5 attempts · 203.0.113.x · locked for 15 min',
    scope: { level: 'organization', name: 'Acme Inc' },
  },
  {
    id: 'lock',
    at: '2026-10-12T09:30:00.000Z',
    kind: 'lock',
    actor: 'Ama Mensah',
    action: 'turned on the deletion lock for',
    target: 'Project 101',
    detail: 'Dashboard',
    scope: { level: 'project', name: 'Project 101' },
  },
]
