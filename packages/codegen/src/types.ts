export interface GeneratedArtifact {
  filename: string
  source: string
  compiled?: string
}

export interface ProviderConfig {
  provider: string
  credentials: Record<string, string>
  options?: Record<string, unknown>
  envVars?: Record<string, { value: string; isSecret: boolean }>
}

export interface DeployResult {
  success: boolean
  deploymentId: string
  url?: string
  dashboardUrl?: string
  error?: string
}

export interface LocalDevSession {
  port: number
  url: string
  pid: number
  stop: () => Promise<void>
  getLogs: (since?: number) => LocalDevLogEntry[]
}

export interface LocalDevLogEntry {
  timestamp: number
  stream: 'stdout' | 'stderr'
  text: string
}

export interface LocalDevOptions {
  workflowId: string
  workflowName: string
  port?: number
  vars?: Record<string, string>
  secrets?: Record<string, string>
  dependencies?: Record<string, string>
}

export type WorkflowStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'errored'
  | 'terminated'
  | 'complete'
  | 'waiting'
  | 'unknown'

export interface WorkflowRunStatus {
  instanceId: string
  status: WorkflowStatus
  output?: unknown
  error?: { name: string; message: string }
}
