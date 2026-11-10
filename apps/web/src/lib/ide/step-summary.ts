import type { StepConfig } from '@awaitstep/ir'
import { appliedStepSettings } from '@awaitstep/codegen'
import type { RunStep, VersionSummary } from '../api-client'
import { formatDurationMs } from '../time'

/** The slice of a canvas node the summaries read. */
export interface SummaryNode {
  id: string
  type: string
  data: Record<string, unknown>
  config?: StepConfig
}

function formatDelay(delay: string | number): string {
  if (typeof delay === 'number') return formatDurationMs(delay)
  // "10 seconds" → "10s": the settings read tighter, and the full word is one click away on the canvas.
  const match = /^\s*(\d+(?:\.\d+)?)\s*(second|minute|hour|day|week)s?\s*$/i.exec(delay)
  if (!match) return delay.trim()
  const unit: Record<string, string> = { second: 's', minute: 'm', hour: 'h', day: 'd', week: 'w' }
  return `${match[1]}${unit[match[2]!.toLowerCase()]}`
}

/** `limit` counts retries after the first attempt, as the runtime and the in-request host read it. */
function retriesLabel(limit: number): string {
  return limit === 1 ? '1 retry' : `${limit} retries`
}

/** A run's attempt count, as telemetry reports it. */
function attempts(count: number): string {
  return count === 1 ? '1 attempt' : `${count} attempts`
}

function describeRetries(config: StepConfig | undefined): string {
  const retries = config?.retries
  if (!retries) return 'Default'
  const delay = formatDelay(retries.delay)
  const backoff = retries.backoff
  return backoff && backoff !== 'constant'
    ? `${retriesLabel(retries.limit)} · ${backoff} from ${delay}`
    : `${retriesLabel(retries.limit)} · ${delay} apart`
}

function describeTimeout(config: StepConfig | undefined): string {
  const value = config?.timeout
  if ((typeof value === 'string' && value.trim() !== '') || typeof value === 'number') {
    return formatDelay(value)
  }
  return 'Default'
}

export interface StepSettings {
  /** Null when this kind of step has no retry policy to show. */
  retries: string | null
  /** Null when this kind of step has no timeout to show. */
  timeout: string | null
}

export interface StepSettingsOptions {
  /** `'script'` for a function, whose steps run on the in-request host. */
  kind?: 'workflow' | 'script'
}

/**
 * A node's retries and timeout as the generated code will carry them (the
 * provider decides which fields each kind reads, so this never shows a value
 * the deployed step does not use). "Default" means nothing is set and the
 * runtime's own value applies; null means the kind of node has no such
 * setting, so the inspector leaves the row out.
 *
 * In a function a step runs on the in-request host, which retries and times
 * out only when asked — so an unset policy reads as none, not as a default —
 * and the other node kinds run without a step boundary at all. A durable HTTP
 * node is a step there too, so its policy reads the same way.
 */
export function stepSettings(node: SummaryNode, options?: StepSettingsOptions): StepSettings {
  if (node.type === 'step' && node.data.inline === true) {
    return { retries: 'Not used — runs inline', timeout: 'Not used — runs inline' }
  }
  const applied = appliedStepSettings(node)
  const runsAsStep =
    node.type === 'step' || (node.type === 'http_request' && node.data.durable === true)
  if (options?.kind === 'script') {
    if (!runsAsStep) {
      const unused = 'Not used in a function'
      return {
        retries: applied.retries ? unused : null,
        timeout: applied.timeout ? unused : null,
      }
    }
    return {
      retries: applied.config?.retries ? describeRetries(applied.config) : 'None — runs once',
      timeout: hasTimeout(applied.config) ? describeTimeout(applied.config) : 'None',
    }
  }
  return {
    retries: applied.retries ? describeRetries(applied.config) : null,
    timeout: applied.timeout ? describeTimeout(applied.config) : null,
  }
}

function hasTimeout(config: StepConfig | undefined): boolean {
  const value = config?.timeout
  return (typeof value === 'string' && value.trim() !== '') || typeof value === 'number'
}

/**
 * A short line for a node that is not a step, as the Steps list shows it:
 * "try/catch", "http GET", "sleep 10s", "branch · 2 arms". Non-steps have no
 * file of their own, so the list must not imply one.
 */
export function nodeMeta(node: SummaryNode, options: NodeMetaOptions = {}): string | null {
  if (node.type === 'step') return stepMeta(node, options.kind ? { kind: options.kind } : undefined)
  const arms = options.arms ?? 0
  const armLine = arms > 0 ? `${arms} ${arms === 1 ? 'arm' : 'arms'}` : null
  switch (node.type) {
    case 'try_catch':
      return 'try/catch'
    case 'branch':
      return armLine === null ? 'branch' : `branch · ${armLine}`
    case 'parallel':
      return armLine === null ? 'parallel' : `parallel · ${armLine}`
    case 'race':
      return armLine === null ? 'race' : `race · ${armLine}`
    case 'loop':
      return `loop ${text(node.data.loopType, 'forEach')}`
    case 'http_request':
      return `http ${text(node.data.method, 'GET')}`
    case 'sleep': {
      const duration = node.data.duration
      if (typeof duration === 'string') {
        return duration.trim() === '' ? 'sleep' : `sleep ${formatDelay(duration)}`
      }
      return typeof duration === 'number' ? `sleep ${formatDelay(duration)}` : 'sleep'
    }
    case 'sleep_until':
      return 'sleep until a time'
    case 'wait_for_event':
      return `wait for ${text(node.data.eventType, 'an event')}`
    case 'sub_workflow':
      return 'sub-workflow'
    case 'sub_script':
      return 'sub-script'
    case 'break':
      return 'break'
    default:
      return node.type
  }
}

/** A non-blank string, trimmed; blank and non-string values fall back. */
function text(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed === '' ? fallback : trimmed
}

export interface NodeMetaOptions {
  kind?: 'workflow' | 'script'
  /** Connections leaving the node, excluding a container's `then` continuation. */
  arms?: number
}

/** A short line for the Steps list: "retries 3", or "timeout 30s", or nothing. */
export function stepMeta(node: SummaryNode, options?: StepSettingsOptions): string | null {
  const settings = stepSettings(node, options)
  const applied = appliedStepSettings(node)
  const parts: string[] = []
  const limit = applied.config?.retries?.limit
  if (limit !== undefined && settings.retries !== null && !settings.retries.startsWith('Not')) {
    parts.push(`retries ${limit}`)
  }
  // Only a timeout that is set makes the line; "Default" and "None" are the
  // inspector's words for an unset one.
  if (
    settings.timeout !== null &&
    !settings.timeout.startsWith('Not') &&
    hasTimeout(applied.config)
  ) {
    parts.push(`timeout ${settings.timeout}`)
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

export type LastRunTone = 'ok' | 'error' | 'active'

export interface LastRunSummary {
  tone: LastRunTone
  /** "Complete", "Errored after 3 attempts", "Running", "Waiting". */
  headline: string
  /** Time and attempts, e.g. "412ms · 1 attempt". Null while it has no end. */
  detail: string | null
  /** The first line of the error, when it errored. */
  error: string | null
  /** More than one occurrence ran, e.g. a loop's iterations. */
  occurrences: number
}

/** The run steps that belong to a node: its own, or its merge leader's when it ran inside one. */
export function stepsForNode(
  steps: readonly RunStep[],
  coalescedInto: Readonly<Record<string, string>>,
  nodeId: string,
): RunStep[] {
  const owner = Object.hasOwn(coalescedInto, nodeId) ? coalescedInto[nodeId]! : nodeId
  return steps.filter((step) => step.nodeId === owner)
}

const SEVERITY: Record<RunStep['status'], number> = {
  errored: 3,
  running: 2,
  waiting: 2,
  complete: 1,
}

function firstLine(text: string): string {
  return (text.split(/\r?\n/).find((line) => line.trim() !== '') ?? text).trim()
}

/**
 * How a node did in a run, from the telemetry rows joined to it. When several
 * ran (loop iterations) the worst one speaks, and a tie goes to the latest.
 * Null when the run has nothing for this node.
 */
export function summarizeNodeRun(rows: readonly RunStep[]): LastRunSummary | null {
  if (rows.length === 0) return null
  const picked = [...rows].sort(
    (a, b) => SEVERITY[b.status] - SEVERITY[a.status] || b.stepIndex - a.stepIndex,
  )[0]!
  const count = attempts(picked.attemptCount)
  if (picked.status === 'errored') {
    return {
      tone: 'error',
      headline: `Errored after ${count}`,
      detail: null,
      error: picked.error ? firstLine(picked.error) : null,
      occurrences: rows.length,
    }
  }
  if (picked.status === 'running' || picked.status === 'waiting') {
    return {
      tone: 'active',
      headline: picked.status === 'running' ? 'Running' : 'Waiting',
      detail: null,
      error: null,
      occurrences: rows.length,
    }
  }
  const ms =
    picked.startedAt && picked.endedAt
      ? new Date(picked.endedAt).getTime() - new Date(picked.startedAt).getTime()
      : null
  return {
    tone: 'ok',
    headline: 'Complete',
    detail: ms === null ? count : `${formatDurationMs(ms)} · ${count}`,
    error: null,
    occurrences: rows.length,
  }
}

/** "v11" for a run's version, or null once that version is gone. */
export function versionLabel(
  versionId: string | null | undefined,
  versions: readonly Pick<VersionSummary, 'id' | 'version'>[],
): string | null {
  if (!versionId) return null
  const found = versions.find((v) => v.id === versionId)
  return found ? `v${found.version}` : null
}

/**
 * What the preview header says about the graph it draws. The graph and the
 * code normally come from the same saved version; when they do not, say which
 * is which instead of implying they match. It never says "Synced" unless
 * both are the same known version.
 */
export function previewSyncLabel(args: {
  graphVersionId: string | null | undefined
  codeVersionId: string | null | undefined
  versions: readonly Pick<VersionSummary, 'id' | 'version'>[]
}): string | null {
  const graph = versionLabel(args.graphVersionId, args.versions)
  if (graph === null) return null
  if (!args.codeVersionId) return null
  if (args.codeVersionId === args.graphVersionId) return `Synced with ${graph}`
  const code = versionLabel(args.codeVersionId, args.versions)
  // A code version the list does not know is newer than what was loaded.
  if (code === null) return `Showing ${graph} · the code is newer`
  return `Showing ${graph} · you’re editing ${code}`
}
