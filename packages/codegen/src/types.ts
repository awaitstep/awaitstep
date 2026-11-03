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

/**
 * `entry`/`module` are transpiled and bundled; `config` (tsconfig) and
 * `meta` (package.json) steer the toolchain; `asset` files (JSON, docs,
 * styles) are written verbatim and never transpiled.
 */
/**
 * - `entry` / `module`: code the deployer compiles and bundles.
 * - `handlers`: the project's `handlers.ts` — `@fetch`/`@queue`/`@scheduled`
 *   annotations codegen compiles into the entry; never shipped as a module.
 * - `config` / `meta`: root toolchain inputs (tsconfig, package.json) the
 *   deployer reads but never writes verbatim.
 * - `asset`: written to the deploy as-is.
 */
export type GeneratedFileRole = 'entry' | 'module' | 'handlers' | 'config' | 'meta' | 'asset'

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
  /**
   * The file a reader should open first, when it is not the deploy entry
   * (a workflow bundle's portable definition). Defaults to {@link entry}.
   */
  primary?: string
  files: GeneratedFile[]
  /** Node → step identity map, populated by workflow bundle generation. */
  manifest?: StepManifest
}

export const DIAGNOSTIC_SOURCES = ['ir', 'provider', 'compile', 'import', 'env'] as const

/**
 * Where a diagnostic came from, so a client can route it to the right place.
 *
 * Lives here rather than in the API because three copies of it existed —
 * the API's prepare, the web client and the IDE's problem list — and the
 * data crosses between them as JSON, so a new source added to one of them
 * left the others silently wrong.
 *
 * - `ir` — the workflow itself: schema, a cycle, a bundle that cannot be built
 * - `provider` — a node this provider cannot deploy
 * - `compile` — a file that does not parse
 * - `import` — an `#app/` specifier with no file behind it
 * - `env` — a variable with no value to resolve at deploy
 */
export type DiagnosticSource = (typeof DIAGNOSTIC_SOURCES)[number]

/** One finding about a workflow, from whichever check produced it. */
export interface SourceDiagnostic {
  source: DiagnosticSource
  message: string
  /** The node the issue belongs to, when it is about one. */
  nodeId?: string
  /** The bundle file, for diagnostics about a file. */
  path?: string
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

/** One line of output from a worker process — local dev or a test session. */
export interface ProcessLogEntry {
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
