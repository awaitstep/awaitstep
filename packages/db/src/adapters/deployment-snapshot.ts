import { sql, type SQL } from 'drizzle-orm'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

/**
 * Scalar subquery for the config snapshot of the latest SUCCESSFUL
 * deployment of a run's own version — the deployment whose step manifest
 * matches the code that produced the run's step records. Shared by the
 * sync loop and the steps read so both agree on which manifest applies.
 */
export function latestDeploymentSnapshot(deployments: AnyTable, runs: AnyTable): SQL {
  return sql`(SELECT ${deployments.configSnapshot} FROM ${deployments} WHERE ${deployments.workflowId} = ${runs.workflowId} AND ${deployments.versionId} = ${runs.versionId} AND ${deployments.status} = 'success' ORDER BY ${deployments.createdAt} DESC LIMIT 1)`
}
