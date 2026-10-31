import type { Context } from 'hono'
import { nanoid } from 'nanoid'
import {
  AUDIT_RETENTION_MS,
  auditText,
  maskIp,
  renderAuditEvent,
  type AuditEventCode,
  type AuditFacts,
  type AuditLevel,
  type KeyLevel,
} from '@awaitstep/ir'
import type { AuditEventInsert, DatabaseAdapter } from '@awaitstep/db'
import type { AppEnv } from '../types.js'
import type { AccountEvent } from '../auth/config.js'
import { createLogger } from './logger.js'

const log = createLogger('audit')

const KEY_LEVEL_LABEL: Record<KeyLevel, string> = {
  organization: 'Organization',
  project: 'Project',
  workspace: 'Workspace',
}

/** One event to record. The scope defaults to the request's organization, at organization level. */
export interface AuditRecord {
  event: AuditEventCode
  facts: AuditFacts
  /** The organization the row belongs to, when not the request's (a project moved in). */
  organizationId?: string
  projectId?: string | null
  workspaceId?: string | null
}

function levelOf(record: AuditRecord): AuditLevel {
  if (record.workspaceId) return 'workspace'
  return record.projectId ? 'project' : 'organization'
}

/** Who did it, and how: a person through the dashboard, or a key by its name. */
export function auditActor(c: Context<AppEnv>): {
  actor: Pick<AuditEventInsert, 'actorType' | 'actorId' | 'actorName' | 'actorEmail'>
  via: string
} {
  const key = c.get('apiKey')
  if (key) {
    return {
      actor: {
        actorType: 'key',
        actorId: key.id,
        actorName: auditText(key.name),
        actorEmail: null,
      },
      via: `${KEY_LEVEL_LABEL[key.level]} API key ${key.display}`,
    }
  }
  // The name is the person's to choose; the id and address say who it was.
  const user = c.get('user')
  return {
    actor: {
      actorType: 'user',
      actorId: c.get('userId'),
      actorName: auditText(user?.name || user?.email || 'Unknown'),
      actorEmail: user?.email ?? null,
    },
    via: 'Dashboard',
  }
}

/** The rows `records` make for this request, their words rendered once. */
export function auditRows(c: Context<AppEnv>, records: AuditRecord[]): AuditEventInsert[] {
  const { actor, via } = auditActor(c)
  const ip = maskIp(c.get('clientIp'))
  const createdAt = new Date().toISOString()
  return records.map((record) => {
    const rendered = renderAuditEvent(record.event, record.facts, { via, ip })
    const level = levelOf(record)
    return {
      id: nanoid(),
      organizationId: record.organizationId ?? c.get('organizationId'),
      projectId: level === 'organization' ? null : (record.projectId ?? null),
      workspaceId: level === 'workspace' ? (record.workspaceId ?? null) : null,
      level,
      event: record.event,
      ...rendered,
      ...actor,
      meta: JSON.stringify(record.facts),
      ip,
      createdAt,
    }
  })
}

/**
 * Records what this request did in the organization's audit log, after it
 * happened. A failed write is logged and never fails the request: the
 * operation already took place (D-B7-9).
 */
export async function recordAudit(c: Context<AppEnv>, ...records: AuditRecord[]): Promise<void> {
  await writeAuditRows(c, auditRows(c, records))
}

/** Writes rows already made; a failure is logged and never fails the request. */
export async function writeAuditRows(c: Context<AppEnv>, rows: AuditEventInsert[]): Promise<void> {
  try {
    await c.get('db').insertAuditEvents(rows)
  } catch (err) {
    log.error('Failed to record audit events', {
      events: rows.map((r) => r.event),
      requestId: c.get('requestId'),
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * A sign-in, in the log of every organization the person is in — called
 * from better-auth's session hook, so it never fails the sign-in.
 */
export async function recordSignIn(
  db: DatabaseAdapter,
  session: { id: string; userId: string; ipAddress?: string | null },
): Promise<void> {
  const ip = maskIp(session.ipAddress)
  const rendered = renderAuditEvent('signin', { name: '' }, { ip })
  try {
    await db.insertPersonAuditEvents({
      idPrefix: `signin_${session.id}`,
      userId: session.userId,
      event: 'signin',
      action: rendered.action,
      detail: rendered.detail,
      ip,
      createdAt: new Date().toISOString(),
    })
  } catch (err) {
    log.error('Failed to record a sign-in', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/** Deletes rows past the 90-day retention, in one statement. */
export async function purgeExpiredAuditEvents(
  db: DatabaseAdapter,
  now = new Date(),
): Promise<number> {
  return db.purgeAuditEvents(new Date(now.getTime() - AUDIT_RETENTION_MS).toISOString())
}

/**
 * An organization's name or URL changed through better-auth — recorded from
 * its hook, which has no request: no address, and never fails the change.
 */
export async function recordOrganizationUpdate(
  db: DatabaseAdapter,
  data: {
    organization: { id: string; name: string; slug: string }
    user: { id: string; name: string; email: string }
  },
): Promise<void> {
  const rendered = renderAuditEvent(
    'organization.update',
    { name: data.organization.name, change: `URL: ${data.organization.slug}` },
    { via: 'Dashboard' },
  )
  try {
    await db.insertAuditEvents([
      {
        id: nanoid(),
        organizationId: data.organization.id,
        projectId: null,
        workspaceId: null,
        level: 'organization',
        event: 'organization.update',
        ...rendered,
        actorType: 'user',
        actorId: data.user.id,
        actorName: auditText(data.user.name || data.user.email),
        actorEmail: data.user.email,
        meta: JSON.stringify({ name: data.organization.name, slug: data.organization.slug }),
        ip: null,
        createdAt: new Date().toISOString(),
      },
    ])
  } catch (err) {
    log.error('Failed to record an organization update', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * A change to the person's own account, in the log of every organization
 * they are in — called from better-auth's hooks, so it never fails the
 * change. Deletion is recorded just before, while the memberships remain.
 */
export async function recordAccountEvent(db: DatabaseAdapter, event: AccountEvent): Promise<void> {
  const facts = { name: '', provider: event.provider }
  const ip = maskIp(event.ip)
  const rendered = renderAuditEvent(event.event, facts, { via: 'Dashboard', ip })
  try {
    await db.insertPersonAuditEvents({
      idPrefix: `${event.event}_${nanoid()}`,
      userId: event.userId,
      event: event.event,
      kind: rendered.kind,
      action: rendered.action,
      target: rendered.target,
      detail: rendered.detail,
      meta: JSON.stringify(event.provider ? { provider: event.provider } : {}),
      ip,
      createdAt: new Date().toISOString(),
    })
  } catch (err) {
    log.error('Failed to record an account change', {
      event: event.event,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/** A request's own account event (sessions signed out, a download), in each of the person's orgs. */
export async function recordPersonAudit(
  c: Context<AppEnv>,
  event: 'session.revoke' | 'account.export',
  facts: AuditFacts,
): Promise<void> {
  const ip = maskIp(c.get('clientIp'))
  const rendered = renderAuditEvent(event, facts, { via: 'Dashboard', ip })
  try {
    await c.get('db').insertPersonAuditEvents({
      idPrefix: `${event}_${nanoid()}`,
      userId: c.get('userId'),
      event,
      kind: rendered.kind,
      action: rendered.action,
      target: rendered.target,
      detail: rendered.detail,
      meta: JSON.stringify(facts),
      ip,
      createdAt: new Date().toISOString(),
    })
  } catch (err) {
    log.error('Failed to record an account change', {
      event,
      requestId: c.get('requestId'),
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
