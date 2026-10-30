import { datedCsvName, toCsv } from '../../lib/csv'
import type { AuditEvent, AuditLevel } from '../../types/dashboard/audit'

const HEADER = [
  'Time',
  'Person',
  'Action',
  'Target',
  'Details',
  'Level',
  'Where',
  'Event',
  'IP',
  'Actor ID',
  'Email',
]

export const AUDIT_LEVEL_LABEL: Record<AuditLevel, string> = {
  organization: 'Organization',
  project: 'Project',
  workspace: 'Workspace',
}

/** Audit log → Export CSV: one row per event, newest first, times as ISO. */
export function auditToCsv(events: AuditEvent[]): string {
  return toCsv(
    HEADER,
    events.map((event) => [
      event.at,
      event.actor,
      event.action,
      event.target,
      event.detail,
      AUDIT_LEVEL_LABEL[event.scope.level],
      event.scope.name,
      event.event,
      event.ip ?? '',
      event.actorId,
      event.actorEmail ?? '',
    ]),
  )
}

/** "acme-audit-log-2026-10-27.csv". */
export function auditCsvName(orgSlug: string, now: Date = new Date()): string {
  return datedCsvName(`${orgSlug}-audit-log`, now)
}
