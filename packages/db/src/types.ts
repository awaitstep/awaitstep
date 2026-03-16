import type { InferSelectModel } from 'drizzle-orm'
import type { workflows } from './schema/sqlite/workflows.js'
import type { workflowVersions } from './schema/sqlite/versions.js'
import type { connections } from './schema/sqlite/connections.js'
import type { workflowRuns } from './schema/sqlite/runs.js'
import type { deployments } from './schema/sqlite/deployments.js'

export type Workflow = InferSelectModel<typeof workflows>
export type WorkflowVersion = InferSelectModel<typeof workflowVersions>
export type Connection = InferSelectModel<typeof connections>
export type WorkflowRun = InferSelectModel<typeof workflowRuns>
export type Deployment = InferSelectModel<typeof deployments>
