import { sql, type SQL } from 'drizzle-orm'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

/**
 * Scalar subquery for the config snapshot of the latest deployment of a
 * run's own version that went out — successful, live or since taken down —
 * whose step manifest matches the code that produced the run's step records.
 * The run's own account comes first; another account's deploy of that version
 * stands in for one from before takedowns kept their rows. Once the version itself is deleted, both
 * rows lose its id and match on the number they kept. Shared by the sync loop
 * and the steps read so both agree on which manifest applies.
 */
export function latestDeploymentSnapshot(deployments: AnyTable, runs: AnyTable): SQL {
  return sql`(SELECT ${deployments.configSnapshot} FROM ${deployments} WHERE ${deployments.workflowId} = ${runs.workflowId} AND (${deployments.versionId} = ${runs.versionId} OR (${runs.versionId} IS NULL AND ${deployments.versionId} IS NULL AND ${deployments.versionNumber} = ${runs.versionNumber})) AND ${deployments.status} IN ('success', 'taken_down') ORDER BY CASE WHEN ${deployments.connectionId} = ${runs.connectionId} THEN 0 ELSE 1 END, ${deployments.createdAt} DESC, ${deployments.id} DESC LIMIT 1)`
}
