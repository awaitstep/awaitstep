import { basename } from 'node:path'
import type { GeneratedBundle } from '@awaitstep/codegen'
import type { BindingRequirement } from '../codegen/bindings.js'
import type { SubWorkflowBinding } from '../codegen/generators/sub-workflow.js'
import type { SubScriptBinding } from '../codegen/generators/sub-script.js'

const SECRET_KEY_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/

/** Validate a wrangler secret key name — must be a valid env-var identifier. */
export function validateSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key)
}

/**
 * Deploy output fit to show or log: long alphanumeric runs (tokens, account
 * ids) redacted, and email addresses (wrangler names the signed-in account's)
 * kept to their first letter and domain. Every pattern is bounded.
 */
export function redactSensitive(text: string): string {
  return text
    .replace(/[A-Za-z0-9_-]{30,}/g, '[REDACTED]')
    .replace(
      /(?<![A-Za-z0-9._%+-])([A-Za-z0-9])[A-Za-z0-9._%+-]{0,63}@([A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24})\b/g,
      (_match, first: string, domain: string) => `${first}…@${domain}`,
    )
}

/** Ensure a filename has no path traversal components. */
export function safeFilename(filename: string): string {
  const base = basename(filename)
  if (!base || base.includes('..')) {
    throw new Error('Invalid artifact filename')
  }
  return base
}

/** Filename used for `wrangler secret bulk` payload inside the deploy workspace. */
export const SECRETS_BULK_FILENAME = '.secrets.bulk.json'

/**
 * Filter and serialize secrets for `wrangler secret bulk`. Skips keys that
 * fail `validateSecretKey` so the bulk command never receives invalid names.
 */
export function buildSecretsBulkJson(secrets: Record<string, string> | undefined): {
  json: string | null
  valid: string[]
  skipped: string[]
} {
  if (!secrets) return { json: null, valid: [], skipped: [] }
  const valid: string[] = []
  const skipped: string[] = []
  const filtered: Record<string, string> = {}
  for (const [key, value] of Object.entries(secrets)) {
    if (validateSecretKey(key)) {
      filtered[key] = value
      valid.push(key)
    } else {
      skipped.push(key)
    }
  }
  if (valid.length === 0) return { json: null, valid, skipped }
  return { json: JSON.stringify(filtered), valid, skipped }
}

export interface DeployOptions {
  /**
   * Discriminator for the deploy artifact. `'workflow'` (default) installs a
   * `WorkflowEntrypoint` class as the primary `WORKFLOW` binding. `'script'`
   * deploys a fetch-only Worker — no class, no `WORKFLOW` self-binding.
   */
  kind?: 'workflow' | 'script'
  workflowId: string
  workflowName: string
  className?: string
  accountId: string
  apiToken: string
  packageName?: string
  vars?: Record<string, string>
  secrets?: Record<string, string>
  dependencies?: Record<string, string>
  bindings?: BindingRequirement[]
  subWorkflowBindings?: SubWorkflowBinding[]
  /** Service bindings collected from `sub_script` nodes. Forwarded to wrangler.json `services[]`. */
  subScriptBindings?: SubScriptBinding[]
  previewUrls?: boolean
  workersDev?: boolean
  routes?: Array<{ pattern: string; zone_name: string }>
  customDomains?: string[]
  compatibilityDate?: string
  compatibilityFlags?: string[]
  cronTriggers?: string[]
  placement?: { mode: string }
  limits?: { cpuMs?: number }
  observability?: {
    enabled?: boolean
    head_sampling_rate?: number
    headSamplingRate?: number
    logs?: {
      enabled?: boolean
      head_sampling_rate?: number
      persist?: boolean
      invocation_logs?: boolean
    }
    traces?: {
      enabled?: boolean
      persist?: boolean
      head_sampling_rate?: number
    }
  }
  logpush?: boolean
  /** Provider-profile `wrangler` overrides; protected generated fields win. */
  overrides?: Record<string, unknown>
  /** Per-queue consumer settings; emitted as `queues.consumers[]` in wrangler.json. */
  queueConsumers?: Array<{
    queue: string
    maxBatchSize?: number
    maxBatchTimeout?: number
    maxRetries?: number
    deadLetterQueue?: string
    maxConcurrency?: number
  }>
}

export interface WranglerDeployResult {
  success: boolean
  workerName: string
  workerUrl?: string
  error?: string
  /** Stopped by a cancel before the upload; nothing reached Cloudflare. */
  cancelled?: boolean
}

/** How a deploy is stopped before it uploads. */
export interface DeployControl {
  /** Aborting it stops the running step; the deploy returns `cancelled`. */
  signal?: AbortSignal
  /**
   * Asked once, right before `wrangler deploy`. `false`: cancelled — the
   * deployer uploads nothing and returns `cancelled`. After `true` the upload
   * runs to its end whatever the signal does.
   */
  beforeUpload?: () => Promise<boolean>
}

export interface WranglerDeployer {
  deploy(
    bundle: GeneratedBundle,
    options: DeployOptions,
    onProgress?: (stage: string, message: string) => void,
    control?: DeployControl,
  ): Promise<WranglerDeployResult>

  deleteWorker(
    workerName: string,
    options: { accountId: string; apiToken: string },
  ): Promise<{ success: boolean; error?: string }>
}
