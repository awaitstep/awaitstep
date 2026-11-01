import { aliasedTable, sql, type SQL } from 'drizzle-orm'
import { sqlTrue } from './connection-reach.js'
import { aliasedFrom, type Dialect } from './json-array.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export interface VariableReachTables {
  envVarWorkspaces: AnyTable
  envVarProjects: AnyTable
}

/** A column or a bound value standing for an id. */
type Ref = SQL | unknown

/**
 * Whether the project variable `v` reaches the workspace: it is set for every
 * workspace, or lists this one. A workspace's own row of the same name is the
 * resolved reads' business — it outranks this one either way.
 */
export function reachesWorkspace(
  dialect: Dialect,
  t: Pick<VariableReachTables, 'envVarWorkspaces'>,
  v: AnyTable,
  workspaceId: Ref,
): SQL {
  const vw = aliasedTable(t.envVarWorkspaces, 'rvw')
  return sql`(${v.allPlaces} = ${sqlTrue(dialect)} or exists (select 1 from ${aliasedFrom(vw)} where ${vw.envVarId} = ${v.id} and ${vw.workspaceId} = ${workspaceId}))`
}

/** Whether the organization variable `v` reaches the project: every project, or this one listed. */
export function reachesProject(
  dialect: Dialect,
  t: Pick<VariableReachTables, 'envVarProjects'>,
  v: AnyTable,
  projectId: Ref,
): SQL {
  const vp = aliasedTable(t.envVarProjects, 'rvp')
  return sql`(${v.allPlaces} = ${sqlTrue(dialect)} or exists (select 1 from ${aliasedFrom(vp)} where ${vp.envVarId} = ${v.id} and ${vp.projectId} = ${projectId}))`
}
