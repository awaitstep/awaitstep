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

export interface DeployOptions {
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
