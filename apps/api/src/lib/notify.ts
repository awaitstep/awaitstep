import type { Context } from 'hono'
import { nanoid } from 'nanoid'
import {
  KEY_EXPIRY_LAST_WARNING_MS,
  KEY_EXPIRY_WARNING_MS,
  NOTIFICATION_RETENTION_MS,
  notificationKindOf,
  notificationText,
  type NotificationEvent,
  type NotificationMeta,
} from '@awaitstep/ir'
import type { DatabaseAdapter, NotificationRecipients, NotifiedRecipient } from '@awaitstep/db'
import type { AppEnv } from '../types.js'
import { createBudget, type Budget } from '../middleware/rate-limit.js'
import { createLogger } from './logger.js'

const log = createLogger('notify')

/** Something to tell people (B8): the event, where it happened, and who to tell. */
export interface Notice {
  event: NotificationEvent
  organizationId: string
  projectId?: string | null
  workspaceId?: string | null
  accessRequestId?: string | null
  /** Repeats with the same key fold into one row per person: see `noticeGroup`. */
  groupKey: string
  meta: NotificationMeta
  recipients: NotificationRecipients
  /** The person who acted, never told about it. */
  excludeUserId?: string | null
  onRepeat?: 'keep' | 'fold'
}

/** The group keys: what makes a repeat one row. */
export const noticeGroup = {
  accessRequest: (requestId: string) => `access_request:${requestId}`,
  requestDecided: (requestId: string) => `access_request.decided:${requestId}`,
  invitation: (event: NotificationEvent, invitationId: string) => `${event}:${invitationId}`,
  /** One per time a check finds the token dead: a token revived and dead again warns again. */
  tokenInvalid: (connectionId: string, checkedAt: string) =>
    `connection.token_invalid:${connectionId}:${checkedAt}`,
  /** Every token warning about one connection, whatever its expiry or check time. */
  connectionTokens: (connectionId: string) => [
    `connection.token_expiring:${connectionId}:`,
    `connection.token_invalid:${connectionId}:`,
  ],
}

/** Typed names, cleaned and capped as the audit log keeps them; other facts as they are. */
function cleanMeta(meta: NotificationMeta): NotificationMeta {
  return Object.fromEntries(
    Object.entries(meta)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, typeof value === 'string' ? notificationText(value) : value]),
  ) as NotificationMeta
}

/**
 * Writes the notice for its recipients and answers who it reached. A failed
 * write is logged and reaches nobody: what happened already happened, and
 * the Inbox is never a reason to fail it.
 */
export async function sendNotice(
  db: DatabaseAdapter,
  notice: Notice,
  now = new Date(),
): Promise<NotifiedRecipient[]> {
  const { kind, needsAction } = notificationKindOf(notice.event)
  try {
    return await db.notify({
      idPrefix: `ntf_${nanoid()}`,
      organizationId: notice.organizationId,
      kind,
      event: notice.event,
      needsAction,
      groupKey: notice.groupKey,
      projectId: notice.projectId ?? null,
      // A workspace is only ever named inside its project.
      workspaceId: notice.projectId ? (notice.workspaceId ?? null) : null,
      accessRequestId: notice.accessRequestId ?? null,
      meta: cleanMeta(notice.meta) as Record<string, unknown>,
      recipients: notice.recipients,
      excludeUserId: notice.excludeUserId ?? null,
      onRepeat: notice.onRepeat ?? 'keep',
      now: now.toISOString(),
    })
  } catch (err) {
    log.error('Failed to send a notification', {
      event: notice.event,
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

/** As `sendNotice`, from a request: the person making it is the one who acted. */
export function notify(c: Context<AppEnv>, notice: Notice): Promise<NotifiedRecipient[]> {
  return sendNotice(c.get('db'), { excludeUserId: c.get('userId'), ...notice })
}

/** Takes a group's rows back (an undone decline, an answered ask); a failure is logged only. */
export async function clearNotice(
  db: DatabaseAdapter,
  organizationId: string,
  groupKey: string,
): Promise<void> {
  try {
    await db.clearNotifications(organizationId, groupKey)
  } catch (err) {
    log.error('Failed to clear notifications', {
      groupKey,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Takes back a connection's token warnings once they no longer hold — its
 * token replaced, or the connection gone — so they stop waiting on anyone.
 * A failure is logged only.
 */
export async function clearConnectionNotices(
  db: DatabaseAdapter,
  organizationId: string,
  connectionId: string,
): Promise<void> {
  try {
    await db.clearNotificationsByPrefix(organizationId, noticeGroup.connectionTokens(connectionId))
  } catch (err) {
    log.error('Failed to clear connection notifications', {
      connectionId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * How many notification emails one person gets an hour, across every
 * workflow and request: past it, the Inbox alone tells them. Per process (an
 * isolate on Workers), as the invitation email budget: a brake on floods,
 * not an exact count.
 */
export const NOTIFICATION_EMAILS_PER_HOUR = 20
const notificationEmails = createBudget({
  windowMs: 60 * 60_000,
  max: NOTIFICATION_EMAILS_PER_HOUR,
})

/**
 * Sends one email per recipient within each one's hourly budget; a failure
 * is logged and never fails the caller.
 */
export async function emailEach(
  recipients: NotifiedRecipient[],
  send: (to: NotifiedRecipient) => Promise<void>,
  budget: Budget = notificationEmails,
): Promise<void> {
  const within = recipients.filter((to) => budget.take(to.userId, 1))
  if (within.length < recipients.length) {
    log.warn('Notification emails over budget: the Inbox alone tells them', {
      skipped: recipients.length - within.length,
    })
  }
  await Promise.all(
    within.map((to) =>
      send(to).catch((err: unknown) => {
        log.error('Failed to email a notification', {
          error: err instanceof Error ? err.message : String(err),
        })
      }),
    ),
  )
}

/** Warns creators of keys about to expire, once a week ahead and once a day ahead. */
export function notifyExpiringKeys(db: DatabaseAdapter, now = new Date()): Promise<number> {
  const { kind, needsAction } = notificationKindOf('api_key.expiring')
  const at = now.getTime()
  return db.notifyExpiringKeys({
    idPrefix: 'ntf_exp',
    event: 'api_key.expiring',
    kind,
    needsAction,
    now: now.toISOString(),
    warnBefore: new Date(at + KEY_EXPIRY_WARNING_MS).toISOString(),
    lastWarnBefore: new Date(at + KEY_EXPIRY_LAST_WARNING_MS).toISOString(),
  })
}

/**
 * Warns whoever can replace a Cloudflare token — its connection's creator and
 * the organization's owners and admins — a week and a day before it expires.
 */
export function notifyExpiringConnections(db: DatabaseAdapter, now = new Date()): Promise<number> {
  const { kind, needsAction } = notificationKindOf('connection.token_expiring')
  const at = now.getTime()
  return db.notifyExpiringConnections({
    idPrefix: 'ntf_tok',
    event: 'connection.token_expiring',
    kind,
    needsAction,
    now: now.toISOString(),
    warnBefore: new Date(at + KEY_EXPIRY_WARNING_MS).toISOString(),
    lastWarnBefore: new Date(at + KEY_EXPIRY_LAST_WARNING_MS).toISOString(),
  })
}

/** Deletes notifications past the 30-day retention. */
export function purgeExpiredNotifications(db: DatabaseAdapter, now = new Date()): Promise<number> {
  return db.purgeNotifications(new Date(now.getTime() - NOTIFICATION_RETENTION_MS).toISOString())
}
