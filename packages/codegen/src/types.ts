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
}

export interface LocalDevLogEntry {
  timestamp: number
  stream: 'stdout' | 'stderr'
  text: string
}

export interface LocalDevOptions {
  workflowId: string
  workflowName: string
  /**
   * Discriminator for the deploy artifact. Defaults to `'workflow'`. Scripts
   * are fetch-only Workers (no `WorkflowEntrypoint` class) and need a
   * different wrangler config (no primary `workflows[0]` entry).
   */
  kind?: 'workflow' | 'script'
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

export type DeploymentConfigUiWidget =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'select'
  | 'array'
  | 'array-of-objects'

export interface DeploymentConfigUiFieldOption {
  value: string
  label: string
}

/**
 * Predicate for conditionally showing a UI field based on another field's value.
 * Resolved against the live config object — when the field at `path` is truthy
 * (boolean true, non-empty object/array, non-zero number), the gated field renders.
 */
export interface DeploymentConfigUiVisibility {
  path: string
  truthy: true
}

export interface DeploymentConfigUiField {
  path: string
  label?: string
  help?: string
  placeholder?: string
  widget?: DeploymentConfigUiWidget
  options?: DeploymentConfigUiFieldOption[]
  /** Hide this field unless the visibility predicate is satisfied. */
  visibleWhen?: DeploymentConfigUiVisibility
  /**
   * For boolean-toggle parents whose schema preprocess maps `true → full object`
   * (e.g. observability, placement): the canonical object form. When a nested
   * sub-field is edited while the parent is still a bare boolean, the form
   * materializes the parent using this object before applying the leaf change,
   * preserving sub-defaults that the user hasn't touched.
   */
  defaultObject?: Record<string, unknown>
  /**
   * When true, the field renders inside a collapsed "Show advanced" disclosure
   * at the bottom of its group. Use for settings that are valid but rarely
   * needed (e.g. Logpush, which has no effect without an out-of-band
   * destination configured at the account level).
   */
  advanced?: boolean
}

export interface DeploymentConfigUiGroup {
  title: string
  description?: string
  fields: DeploymentConfigUiField[]
}

export interface DeploymentConfigUiSchema {
  groups: DeploymentConfigUiGroup[]
}

export interface DeploymentConfigValidator {
  safeParse(data: unknown): { success: true; data: unknown } | { success: false; error: unknown }
  parse(data: unknown): unknown
}

export interface DeploymentConfigPreview {
  filename: string
  content: Record<string, unknown>
}
