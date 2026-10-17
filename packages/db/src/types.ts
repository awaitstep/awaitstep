import type { InferSelectModel } from 'drizzle-orm'
import type { workflows } from './schema/sqlite/workflows.js'
import type { workflowVersions } from './schema/sqlite/versions.js'
import type { connections } from './schema/sqlite/connections.js'
import type { workflowRuns } from './schema/sqlite/runs.js'
import type { workflowRunSteps } from './schema/sqlite/run-steps.js'
import type { deployments } from './schema/sqlite/deployments.js'
import type { apiKeys } from './schema/sqlite/api-keys.js'
import type { envVars } from './schema/sqlite/env-vars.js'
import type { projects } from './schema/sqlite/projects.js'
import type { installedNodes } from './schema/sqlite/installed-nodes.js'
import type { deploymentConfigs } from './schema/sqlite/deployment-configs.js'

export type Workflow = InferSelectModel<typeof workflows>
export type WorkflowVersion = InferSelectModel<typeof workflowVersions>

/**
 * How a version's deployable source relates to its IR.
 * 'generated' — IR is truth, code derived at deploy time (v1 behavior).
 * 'ejected'   — user edits the stored bundle; IR retained, drift-validated.
 * 'sdk'       — source authoritative (CLI push), IR derived from code.
 */
export type WorkflowSourceMode = 'generated' | 'ejected' | 'sdk'

export interface CreateVersionData {
  id: string
  workflowId: string
  /**
   * Omit to have the adapter assign MAX(version)+1 atomically in SQL —
   * callers that read the next number first race under concurrency and trip
   * the (workflowId, version) unique index.
   */
  version?: number
  ir: string
  sourceMode?: WorkflowSourceMode
  source?: string | null
  manifest?: string | null
  baseGeneratedHash?: string | null
}

export interface UpdateVersionData {
  ir?: string
  locked?: number
  sourceMode?: WorkflowSourceMode
  source?: string | null
  manifest?: string | null
  baseGeneratedHash?: string | null
}
export type Connection = InferSelectModel<typeof connections>
export type WorkflowRun = InferSelectModel<typeof workflowRuns>
export type WorkflowRunStep = InferSelectModel<typeof workflowRunSteps>

/** Provider step record kinds persisted per run ('do' covers plain steps). */
export type RunStepKind = 'do' | 'sleep' | 'waitForEvent' | 'rollback'

export type RunStepStatus = 'running' | 'waiting' | 'complete' | 'errored'

/**
 * One provider-reported step occurrence, upserted by its stable identity
 * (runId, stepName, kind, stepIndex) so repeated syncs converge instead of
 * duplicating rows.
 */
export interface UpsertRunStepData {
  id: string
  nodeId?: string | null
  stepName: string
  kind: RunStepKind
  stepIndex: number
  status: RunStepStatus
  attemptCount: number
  error?: string | null
  startedAt?: string | null
  endedAt?: string | null
}

/** A run's step rows plus the deployed version's config snapshot (manifest carrier). */
export interface RunStepsResult {
  steps: WorkflowRunStep[]
  configSnapshot: string | null
}

/**
 * An active (non-terminal) run joined with everything one sync tick needs:
 * the provider workflow name and the deployed version's config snapshot
 * (which carries the step manifest). Credentials stay out — they decrypt
 * through the connections adapter, once per connection group.
 */
export interface ActiveRunForSync {
  run: WorkflowRun
  workflowName: string
  configSnapshot: string | null
}
export type Deployment = InferSelectModel<typeof deployments>
export type ApiKey = InferSelectModel<typeof apiKeys>
export type EnvVar = InferSelectModel<typeof envVars>
export type Project = InferSelectModel<typeof projects>
export type InstalledNode = InferSelectModel<typeof installedNodes>
export type DeploymentConfig = InferSelectModel<typeof deploymentConfigs>
