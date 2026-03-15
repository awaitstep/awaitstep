import type { InferSelectModel } from 'drizzle-orm'
import type { workflows } from './schema/sqlite/workflows.js'
import type { workflowVersions } from './schema/sqlite/versions.js'
import type { cfConnections } from './schema/sqlite/connections.js'
import type { workflowRuns } from './schema/sqlite/runs.js'

export type Workflow = InferSelectModel<typeof workflows>
export type WorkflowVersion = InferSelectModel<typeof workflowVersions>
export type CFConnection = InferSelectModel<typeof cfConnections>
export type WorkflowRun = InferSelectModel<typeof workflowRuns>
