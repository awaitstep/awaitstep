import type { ArtifactIR } from '@awaitstep/ir'
// Type-only circular reference (manifest.ts imports GeneratedBundle) — erased
// at runtime, legal in TS.
import type { StepManifest } from './manifest.js'
/**
 * @deprecated Single-file shape kept for legacy call sites and tests — the
 * provider contract now produces a {@link GeneratedBundle}. Wrap with
 * `toBundle()` (bundle.ts) where a bundle is required.
 */
export interface GeneratedArtifact {
  filename: string
  source: string
  compiled?: string
}

export type GeneratedFileRole = 'entry' | 'module' | 'config' | 'meta'

export interface GeneratedFile {
  /** Bundle-relative path, e.g. `worker.ts` or `src/nodes/fetch_data.ts`. */
  path: string
  source: string
  /** Transpiled JavaScript, populated by the deploy pipeline before upload. */
  compiled?: string
  role: GeneratedFileRole
}

/**
 * The full output of a generation: one entry plus any module/config/meta
 * files. Single-file today; per-node module extraction lands on top of this
 * shape without another contract change.
 */
export interface GeneratedBundle {
  /** Path of the entry file within {@link files}. */
  entry: string
  files: GeneratedFile[]
  /** Node → step identity map, populated by workflow bundle generation. */
  manifest?: StepManifest
}

export const SOURCE_MODES = ['generated', 'ejected', 'sdk'] as const

/**
 * Who owns a version's deployable source: the canvas (`generated`, produced
 * on demand from the IR), the user after eject (`ejected`, the stored bundle
 * is the truth), or the SDK push flow (`sdk`).
 */
export type SourceMode = (typeof SOURCE_MODES)[number]

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
  /**
   * The workflow IR, when available. Lets providers derive bindings from
   * declarations (authoritative) instead of regex-scanning generated source —
   * keeping local dev consistent with the deploy path.
   */
  ir?: ArtifactIR
}

export type WorkflowStatus =
  'queued' | 'running' | 'paused' | 'errored' | 'terminated' | 'complete' | 'waiting' | 'unknown'

export interface WorkflowRunStatus {
  instanceId: string
  status: WorkflowStatus
  output?: unknown
  error?: { name: string; message: string }
}

/** Step record kinds a provider can report for a run ('do' = plain step). */
export type RunStepDetailKind = 'do' | 'sleep' | 'waitForEvent' | 'rollback'

export type RunStepDetailStatus = 'running' | 'waiting' | 'complete' | 'errored'

/** One provider-reported step occurrence within a run. */
export interface RunStepDetail {
  /** The durable-step label (joins to StepManifest.steps[].stepName). */
  name: string
  kind: RunStepDetailKind
  /** 1-based occurrence per (name, kind), in provider report order. */
  index: number
  status: RunStepDetailStatus
  start?: string
  end?: string
  attemptCount: number
  error?: { name: string; message: string }
}

/** Instance detail with per-step telemetry, from WorkflowProvider.getRunDetail. */
export interface WorkflowRunDetail extends WorkflowRunStatus {
  startedAt?: string
  endedAt?: string
  /** The provider's billable step count for the run, when reported. */
  stepCount?: number
  steps: RunStepDetail[]
}

export type DeploymentConfigUiWidget =
  'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'array' | 'array-of-objects'

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
