import { aliasedTable, sql, type SQL } from 'drizzle-orm'
import { aliasedFrom, type Dialect } from './json-array.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export interface ReachTables {
  connections: AnyTable
  connectionProjects: AnyTable
  projectConnections: AnyTable
}

/** A column or a bound value standing for an id. */
type Ref = SQL | unknown

export function sqlTrue(dialect: Dialect): SQL {
  return dialect === 'pg' ? sql`true` : sql`1`
}

/**
 * Whether connection row `c` may serve the project: an account the project
 * owns, or an organization account that serves every project or lists this
 * one. Another project's own account never does.
 */
export function servesProject(dialect: Dialect, t: ReachTables, c: AnyTable, projectId: Ref): SQL {
  const cp = aliasedTable(t.connectionProjects, 'rsp')
  // Never null, so it negates: `project_id = …` alone is null on an organization account.
  return sql`((${c.projectId} is not null and ${c.projectId} = ${projectId}) or (${c.projectId} is null and (${c.allProjects} = ${sqlTrue(dialect)} or exists (select 1 from ${aliasedFrom(cp)} where ${cp.connectionId} = ${c.id} and ${cp.projectId} = ${projectId}))))`
}

/**
 * Whether connection row `c` is one of the project's accounts — added or
 * owned, and still serving it — the only accounts its deploys may use. The
 * caller holds `c` to the project's organization.
 */
export function isProjectsAccount(
  dialect: Dialect,
  t: ReachTables,
  c: AnyTable,
  projectId: Ref,
): SQL {
  const pc = aliasedTable(t.projectConnections, 'rpa')
  return sql`(exists (select 1 from ${aliasedFrom(pc)} where ${pc.projectId} = ${projectId} and ${pc.connectionId} = ${c.id}) and ${servesProject(dialect, t, c, projectId)})`
}
