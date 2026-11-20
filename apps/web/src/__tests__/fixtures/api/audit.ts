import { AUDIT_PERIOD_MS, type AuditEvent, type AuditFilter, type AuditPage } from '@awaitstep/ir'
import type { AuditRow, SeedDb } from '../seed/rows'

// The org's audit log as `GET /audit-events` answers it, projected from the
// seed: newest first, narrowed by level, period and search, 25 to a page.

function scopeOf(seed: SeedDb, orgName: string, row: AuditRow): AuditEvent['scope'] {
  if (row.level === 'organization') return { level: row.level, name: orgName }
  const project = seed.projects.find((p) => p.id === row.projectId)
  const projectName = project?.name ?? 'Deleted project'
  if (row.level === 'project') return { level: row.level, name: projectName }
  const workspace = seed.workspaces.find((w) => w.id === row.workspaceId)
  return {
    level: row.level,
    name: `${projectName} · ${workspace?.name ?? 'Deleted workspace'}`,
    colour: workspace?.colour,
  }
}

export function auditPage(seed: SeedDb, orgId: string, filter: AuditFilter, now: Date): AuditPage {
  const org = seed.orgs.find((o) => o.id === orgId)!
  const since = new Date(now.getTime() - AUDIT_PERIOD_MS[filter.period ?? '7d']).toISOString()
  const search = filter.search?.trim().toLowerCase()
  const matching = seed.audit
    .filter(
      (a) =>
        a.orgId === orgId &&
        a.at >= since &&
        (!filter.level || a.level === filter.level) &&
        (!search ||
          [a.actor, a.action, a.target].some((text) => text.toLowerCase().includes(search))),
    )
    .sort((a, b) => b.at.localeCompare(a.at))
  const size = Number(filter.limit ?? 25)
  const offset = Number(filter.cursor ?? 0)
  return {
    data: matching.slice(offset, offset + size).map((row) => ({
      id: row.id,
      at: row.at,
      kind: row.kind,
      event: row.event,
      actor: row.actor,
      actorType: row.actorType,
      actorId: row.actorId,
      actorEmail: row.actorEmail,
      ip: row.ip,
      action: row.action,
      target: row.target,
      detail: row.detail,
      scope: scopeOf(seed, org.name, row),
    })),
    nextCursor: offset + size < matching.length ? String(offset + size) : null,
    total: matching.length,
  }
}
