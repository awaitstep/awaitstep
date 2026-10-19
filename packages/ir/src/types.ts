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

/**
 * Canonical list of builtin node types — the single source of truth:
 * `BuiltinNodeType` is derived from it (so the two can never drift), and the
 * Set form drives every "is this type builtin?" check; provider codegen must
 * use it instead of maintaining local copies.
 */
export const BUILTIN_NODE_TYPE_LIST = [
  'step',
  'sleep',
  'sleep_until',
  'branch',
  'parallel',
  'http_request',
  'wait_for_event',
  'try_catch',
  'loop',
  'break',
  'sub_workflow',
  'sub_script',
  'race',
] as const

export type BuiltinNodeType = (typeof BUILTIN_NODE_TYPE_LIST)[number]

export const BUILTIN_NODE_TYPES: ReadonlySet<string> = new Set(BUILTIN_NODE_TYPE_LIST)

export function isBuiltinNodeType(type: string): type is BuiltinNodeType {
  return BUILTIN_NODE_TYPES.has(type)
}

export type NodeType = BuiltinNodeType | (string & {})

export interface BranchCondition {
  label: string
  condition: string
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export type LoopType = 'forEach' | 'while' | 'times'

// ── Typed node data ──
// These describe the authored contract for each builtin's `data` object.
// Stored workflows predate per-type validation, so every field is optional and
// readers must keep coercing defensively (`?? fallback`); schema-level
// acceptance stays lenient (see schema.ts) and strict checks are collected by
// validateNodeData rather than enforced at parse time.

export type StepNodeData = {
  /** Arbitrary TypeScript executed inside `step.do` (or inline when `inline`). */
  code?: string
  /** Emit raw code with no `step.do` wrapper — not durable, not billed as a step. */
  inline?: boolean
  retryLimit?: number
  retryDelay?: string
  backoff?: RetryBackoff
  timeout?: string
}

export type SleepNodeData = {
  /** Duration string ("10 seconds") or milliseconds. */
  duration?: string | number
}

export type SleepUntilNodeData = {
  /** ISO 8601 timestamp. */
  timestamp?: string
}

export type BranchNodeData = {
  /**
   * Ordered branch arms; each `label` links to the outgoing edge with the same
   * label. An empty `condition` on the last arm is the else branch.
   */
  branches?: BranchCondition[]
}

/** No declared fields — parallel fan-out is edge-driven. */
export type ParallelNodeData = Record<string, unknown>

export type HttpRequestNodeData = {
  method?: HttpMethod
  url?: string
  headers?: Record<string, string>
  queryParams?: Record<string, string>
  /** JS expression emitted as the request body. */
  body?: string
  retryLimit?: number
  timeout?: string
}

export type WaitForEventNodeData = {
  eventType?: string
  /** Duration string ("24 hours") or milliseconds. */
  timeout?: string | number
}

/** No declared fields — try/catch/finally arms are edge-label-driven. */
export type TryCatchNodeData = Record<string, unknown>

export type LoopNodeData = {
  loopType?: LoopType
  /** forEach: expression producing the collection. */
  collection?: string
  itemVar?: string
  indexVar?: string
  /** while: continue condition expression. */
  condition?: string
  /** times: iteration count (>= 1). */
  count?: number
}

export type BreakNodeData = {
  /** Optional guard expression; empty means break/return unconditionally. */
  condition?: string
}

export type SubWorkflowNodeData = {
  /** Deployed worker name of the child workflow. */
  workflowId?: string
  /** Exported class name of the child workflow. */
  workflowName?: string
  /** JS expression passed as the child's params. */
  input?: string
  /** Only literal `false` disables waiting. */
  waitForCompletion?: boolean
  timeout?: string
}

export type SubScriptNodeData = {
  workerName?: string
  method?: HttpMethod
  url?: string
  headers?: Record<string, string>
  body?: string
  retryLimit?: number
  timeout?: string
}

/** No declared fields — race fan-out is edge-driven. */
export type RaceNodeData = Record<string, unknown>

/** Custom (registry) node data is validated against its NodeDefinition.configSchema. */
export type CustomNodeData = Record<string, unknown>

export interface BuiltinNodeDataMap {
  step: StepNodeData
  sleep: SleepNodeData
  sleep_until: SleepUntilNodeData
  branch: BranchNodeData
  parallel: ParallelNodeData
  http_request: HttpRequestNodeData
  wait_for_event: WaitForEventNodeData
  try_catch: TryCatchNodeData
  loop: LoopNodeData
  break: BreakNodeData
  sub_workflow: SubWorkflowNodeData
  sub_script: SubScriptNodeData
  race: RaceNodeData
}

export interface WorkflowNode {
  id: NodeId
  type: NodeType
  name: string
  /**
   * Canvas position. Optional — code-derived workflows (SDK) have no layout;
   * renderers must fall back to auto-layout for position-less nodes.
   */
  position?: Position
  version: string
  provider: string
  data: Record<string, unknown>
  config?: StepConfig
}

/** A WorkflowNode narrowed to one builtin type with typed `data`. */
export type TypedWorkflowNode<T extends BuiltinNodeType> = Omit<WorkflowNode, 'type' | 'data'> & {
  type: T
  data: BuiltinNodeDataMap[T]
}

export function isBuiltinNode(
  node: WorkflowNode,
): node is TypedWorkflowNode<BuiltinNodeType> & WorkflowNode {
  return isBuiltinNodeType(node.type)
}

export function isNodeOfType<T extends BuiltinNodeType>(
  node: WorkflowNode,
  type: T,
): node is TypedWorkflowNode<T> & WorkflowNode {
  return node.type === type
}

/** Typed accessor for a builtin node's data; undefined when the type mismatches. */
export function nodeDataOf<T extends BuiltinNodeType>(
  node: WorkflowNode,
  type: T,
): BuiltinNodeDataMap[T] | undefined {
  return isNodeOfType(node, type) ? node.data : undefined
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
  HttpTriggerConfig | CronTriggerConfig | EventTriggerConfig | ManualTriggerConfig

/**
 * Well-known resource binding kinds. Open-ended so providers can extend
 * without editing the IR package; provider validation owns the closed set.
 */
export type BindingKind =
  | 'kv'
  | 'd1'
  | 'r2'
  | 'queue'
  | 'service'
  | 'ai'
  | 'vectorize'
  | 'analytics_engine'
  | 'hyperdrive'
  | 'browser'
  | (string & {})

/**
 * Declares that the workflow reads an environment variable. Declarations
 * carry metadata only — values stay in the platform's env-var store and are
 * resolved at deploy time.
 */
export interface EnvDeclaration {
  name: string
  required?: boolean
  secret?: boolean
  description?: string
}

/** Declares a resource binding the workflow uses (KV namespace, D1 database, ...). */
export interface BindingDeclaration {
  name: string
  type: BindingKind
  /** Provider resource id (e.g. KV namespace id). Required by some kinds at deploy. */
  resourceId?: string
  /** Human-readable resource name, for display and provisioning flows. */
  resourceName?: string
}

/**
 * Everything beyond the node graph that a deployable workflow needs — trigger
 * code, npm dependencies, env-var declarations, and resource bindings. With
 * this block present, a workflow is fully described by its IR: exports are
 * self-contained and nothing lives only in database columns.
 */
/**
 * A project-owned file deployed next to the generated code: code in any
 * folder (importable from anywhere as `#/<path>`), assets written as-is, or
 * a root config file such as `package.json`.
 */
export interface ProjectFile {
  /** Project-relative path, e.g. `config/env.ts` or `package.json`. */
  path: string
  source: string
}

export interface WorkflowRuntime {
  /** Worker entry code (the annotated @fetch/@queue/@scheduled source). */
  triggerCode?: string
  /** npm dependencies bundled at deploy: name → semver range. */
  dependencies?: Record<string, string>
  env?: EnvDeclaration[]
  bindings?: BindingDeclaration[]
  /** Reusable modules the user (or an agent) wrote; snapshotted per version. */
  files?: ProjectFile[]
}

/**
 * Current IR document version. Documents without an `irVersion` field are v1;
 * `migrateArtifact` (migrate.ts) lazily upgrades them at load time — stored
 * rows are never rewritten in place.
 */
export const IR_VERSION = 2 as const

export interface WorkflowIR {
  /**
   * Discriminator for {@link ArtifactIR}. Optional for backward compatibility
   * with stored IRs that predate the script primitive — readers should treat
   * the absence of `kind` as `'workflow'`.
   */
  kind?: 'workflow'
  /** Absent on v1 documents; {@link IR_VERSION} once migrated. */
  irVersion?: typeof IR_VERSION
  metadata: WorkflowMetadata
  nodes: WorkflowNode[]
  edges: Edge[]
  entryNodeId: NodeId
  trigger?: TriggerConfig
  /** Absent on legacy documents — folded in from workflow columns at load. */
  runtime?: WorkflowRuntime
}

export interface ScriptIR {
  kind: 'script'
  /** Absent on v1 documents; {@link IR_VERSION} once migrated. */
  irVersion?: typeof IR_VERSION
  metadata: WorkflowMetadata
  nodes: WorkflowNode[]
  edges: Edge[]
  entryNodeId: NodeId
  trigger: HttpTriggerConfig
  /** Absent on legacy documents — folded in from workflow columns at load. */
  runtime?: WorkflowRuntime
}

export type ArtifactIR = WorkflowIR | ScriptIR

export interface ValidationError {
  path: string
  message: string
  nodeId?: NodeId
}

export type Result<T, E> = { ok: true; value: T } | { ok: false; errors: E }
