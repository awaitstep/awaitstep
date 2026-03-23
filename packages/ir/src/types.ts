export type NodeId = string
export type EdgeId = string

export type RetryBackoff = 'constant' | 'linear' | 'exponential'

export interface RetryConfig {
  limit: number
  delay: number | string
  backoff?: RetryBackoff
}

export interface StepConfig {
  retries?: RetryConfig
  timeout?: number | string
}

export interface Position {
  x: number
  y: number
}

export type BuiltinNodeType =
  | 'step'
  | 'sleep'
  | 'sleep_until'
  | 'branch'
  | 'parallel'
  | 'http_request'
  | 'wait_for_event'

export type NodeType = BuiltinNodeType | (string & {})

export interface BranchCondition {
  label: string
  condition: string
}

export interface WorkflowNode {
  id: NodeId
  type: NodeType
  name: string
  position: Position
  version: string
  provider: string
  data: Record<string, unknown>
  config?: StepConfig
}

export interface Edge {
  id: EdgeId
  source: NodeId
  target: NodeId
  label?: string
}

export interface WorkflowMetadata {
  name: string
  description?: string
  version: number
  createdAt: string
  updatedAt: string
}

export type TriggerType = 'http' | 'cron' | 'event' | 'manual'

export interface HttpTriggerConfig {
  type: 'http'
  path?: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
}

export interface CronTriggerConfig {
  type: 'cron'
  expression: string
}

export interface EventTriggerConfig {
  type: 'event'
  eventType: string
}

export interface ManualTriggerConfig {
  type: 'manual'
}

export type TriggerConfig =
  | HttpTriggerConfig
  | CronTriggerConfig
  | EventTriggerConfig
  | ManualTriggerConfig

export interface WorkflowIR {
  metadata: WorkflowMetadata
  nodes: WorkflowNode[]
  edges: Edge[]
  entryNodeId: NodeId
  trigger?: TriggerConfig
}

export interface ValidationError {
  path: string
  message: string
  nodeId?: NodeId
}

export type Result<T, E> = { ok: true; value: T } | { ok: false; errors: E }
