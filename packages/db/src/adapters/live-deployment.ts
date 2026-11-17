import { sql, type SQL } from 'drizzle-orm'
import { IN_FLIGHT_DEPLOYMENT_STATUSES } from '../deployment-status.js'
import { aliasedFrom } from './json-array.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

const NOT_AN_ATTEMPT = sql.raw(
  [...IN_FLIGHT_DEPLOYMENT_STATUSES, 'cancelled'].map((status) => `'${status}'`).join(', '),
)

/**
 * `d` is a deploy that went somewhere: it settled, and not as cancelled. A
 * running deploy, or one cancelled before the upload, says nothing about the
 * workflow's state, so "its newest deploy" skips them.
 */
export function settledAttempt(d: AnyTable): SQL {
  return sql`${d.status} not in (${NOT_AN_ATTEMPT})`
}

/**
 * `d` is what its account runs: a successful deploy with no newer successful
 * one of the same workflow on the same account. `newer` is an alias of the
 * deployments table, distinct from `d`'s. A row whose account was deleted is
 * live nowhere.
 */
export function liveOnItsAccount(d: AnyTable, newer: AnyTable): SQL {
  return sql`${d.status} = 'success' and ${d.connectionId} is not null and not exists (select 1 from ${aliasedFrom(newer)} where ${newer.workflowId} = ${d.workflowId} and ${newer.connectionId} = ${d.connectionId} and ${newer.status} = 'success' and (${newer.createdAt} > ${d.createdAt} or (${newer.createdAt} = ${d.createdAt} and ${newer.id} > ${d.id})))`
}
