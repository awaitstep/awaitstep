import { AUDIT_PERIOD_MS } from '@awaitstep/ir'
import type { AuditEvent, AuditFilter, AuditPage } from '../../../types/dashboard/audit'
import type { AuditRow, MockDb } from '../db'
import { endpoint, rows } from '../scenario'
import { managedOrg } from './levels'
import { pageOf } from './paging'

// The org audit log: fixed sample events (recording them is B7). Org owners
// and admins only (D-P7-7).

function scopeOf(db: MockDb, orgName: string, row: AuditRow): AuditEvent['scope'] {
  if (row.level === 'organization') return { level: row.level, name: orgName }
  const project = db.projects.find((p) => p.id === row.projectId)
  const projectName = project?.name ?? 'Deleted project'
  if (row.level === 'project') return { level: row.level, name: projectName }
  const workspace = db.workspaces.find((w) => w.id === row.workspaceId)
  return {
    level: row.level,
    name: `${projectName} · ${workspace?.name ?? 'Deleted workspace'}`,
    colour: workspace?.colour,
  }
}

function eventRecord(db: MockDb, orgName: string, row: AuditRow): AuditEvent {
  return {
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
    scope: scopeOf(db, orgName, row),
  }
}

function matches(row: AuditRow, search: string): boolean {
  return [row.actor, row.action, row.target].some((text) => text.toLowerCase().includes(search))
}

/** Newest first, narrowed by level, period and search, a page at a time. */
export const listAuditEvents = endpoint(
  (ctx, orgSlug: string, filter: AuditFilter = {}): AuditPage => {
    const { db, org } = managedOrg(ctx, orgSlug)
    const since = new Date(Date.now() - AUDIT_PERIOD_MS[filter.period ?? '7d']).toISOString()
    const search = filter.search?.trim().toLowerCase()
    const matching = rows(
      ctx,
      db.audit.filter(
        (a) =>
          a.orgId === org.id &&
          a.at >= since &&
          (!filter.level || a.level === filter.level) &&
          (!search || matches(a, search)),
      ),
    ).sort((a, b) => b.at.localeCompare(a.at))
    const { page, nextCursor } = pageOf(matching, filter)
    return {
      data: page.map((row) => eventRecord(db, org.name, row)),
      nextCursor,
      total: matching.length,
    }
  },
)
