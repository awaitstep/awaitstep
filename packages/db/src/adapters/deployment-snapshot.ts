import { sql, type SQL } from 'drizzle-orm'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

/**
 * One column of the latest deployment of a run's own version that went out —
 * successful, live or since taken down. The run's own account comes first;
 * another account's deploy of that version stands in for one from before
 * takedowns kept their rows. Once the version itself is deleted, both rows
 * lose its id and match on the number they kept.
 *
 * Two lookups joined by `coalesce` rather than one ordered "own account
 * first": D1 can't resolve the run's columns in a correlated subquery's
 * ORDER BY, only in its WHERE. (So an own-account row whose column is null
 * gives way to another account's value.)
 */
function latestOfRunVersion(column: AnyTable, deployments: AnyTable, runs: AnyTable): SQL {
  const d = deployments
  const ofVersion = sql`${d.workflowId} = ${runs.workflowId} AND (${d.versionId} = ${runs.versionId} OR (${runs.versionId} IS NULL AND ${d.versionId} IS NULL AND ${d.versionNumber} = ${runs.versionNumber})) AND ${d.status} IN ('success', 'taken_down')`
  const newest = sql`ORDER BY ${d.createdAt} DESC, ${d.id} DESC LIMIT 1`
  return sql`coalesce((SELECT ${column} FROM ${d} WHERE ${ofVersion} AND ${d.connectionId} = ${runs.connectionId} ${newest}), (SELECT ${column} FROM ${d} WHERE ${ofVersion} ${newest}))`
}

/**
 * The config snapshot of the run's version as deployed — its step manifest
 * matches the code that produced the run's step records. Shared by the sync
 * loop and the steps read so both agree on which manifest applies.
 */
export function latestDeploymentSnapshot(deployments: AnyTable, runs: AnyTable): SQL {
  return latestOfRunVersion(deployments.configSnapshot, deployments, runs)
}

/**
 * The name the run's version was deployed under, which its runs are found
 * by. Null when that row is from before it was recorded; the workflow's own
 * name stands in then.
 */
export function latestDeployedName(deployments: AnyTable, runs: AnyTable): SQL {
  return latestOfRunVersion(deployments.deployedName, deployments, runs)
}
