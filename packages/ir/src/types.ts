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

export interface BaseNode {
  id: NodeId
  name: string
  position: Position
}

export interface StepNode extends BaseNode {
  type: 'step'
  code: string
  config?: StepConfig
}

export interface SleepNode extends BaseNode {
  type: 'sleep'
  duration: number | string
}

export interface SleepUntilNode extends BaseNode {
  type: 'sleep-until'
  timestamp: string
}

export interface BranchCondition {
  label: string
  condition: string
}

export interface BranchNode extends BaseNode {
  type: 'branch'
  branches: BranchCondition[]
}

export interface ParallelNode extends BaseNode {
  type: 'parallel'
}

export interface HttpRequestNode extends BaseNode {
  type: 'http-request'
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
  headers?: Record<string, string>
  body?: string
  config?: StepConfig
}

export interface WaitForEventNode extends BaseNode {
  type: 'wait-for-event'
  eventType: string
  timeout?: number | string
}

export type WorkflowNode =
  | StepNode
  | SleepNode
  | SleepUntilNode
  | BranchNode
  | ParallelNode
  | HttpRequestNode
  | WaitForEventNode

export type NodeType = WorkflowNode['type']

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
