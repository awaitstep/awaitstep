import { sql, type SQL } from 'drizzle-orm'
import { aliasedFrom } from './json-array.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

/**
 * `d` is what its account runs: a successful deploy with no newer successful
 * one of the same workflow on the same account. `newer` is an alias of the
 * deployments table, distinct from `d`'s. A row whose account was deleted is
 * live nowhere.
 */
export function liveOnItsAccount(d: AnyTable, newer: AnyTable): SQL {
  return sql`${d.status} = 'success' and ${d.connectionId} is not null and not exists (select 1 from ${aliasedFrom(newer)} where ${newer.workflowId} = ${d.workflowId} and ${newer.connectionId} = ${d.connectionId} and ${newer.status} = 'success' and (${newer.createdAt} > ${d.createdAt} or (${newer.createdAt} = ${d.createdAt} and ${newer.id} > ${d.id})))`
}
