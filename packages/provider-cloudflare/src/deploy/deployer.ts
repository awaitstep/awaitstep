import { basename } from 'node:path'
import type { GeneratedArtifact } from '@awaitstep/codegen'
import type { BindingRequirement } from '../codegen/bindings.js'
import type { SubWorkflowBinding } from '../codegen/generators/sub-workflow.js'

const SECRET_KEY_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/

/** Validate a wrangler secret key name — must be a valid env-var identifier. */
export function validateSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key)
}

/** Redact long alphanumeric strings that may be tokens or credentials. */
export function redactSensitive(text: string): string {
  return text.replace(/[A-Za-z0-9_-]{30,}/g, '[REDACTED]')
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
  previewUrls?: boolean
  workersDev?: boolean
  routes?: Array<{ pattern: string; zone_name: string }>
  customDomains?: string[]
  compatibilityDate?: string
  compatibilityFlags?: string[]
  cronTriggers?: string[]
  placement?: { mode: string }
  limits?: { cpuMs?: number }
  observability?: { enabled: boolean; headSamplingRate?: number }
  logpush?: boolean
}

export interface WranglerDeployResult {
  success: boolean
  workerName: string
  workerUrl?: string
  error?: string
}

export interface WranglerDeployer {
  deploy(
    artifact: GeneratedArtifact,
    options: DeployOptions,
    onProgress?: (stage: string, message: string) => void,
  ): Promise<WranglerDeployResult>

  deleteWorker(
    workerName: string,
    options: { accountId: string; apiToken: string },
  ): Promise<{ success: boolean; error?: string }>
}
